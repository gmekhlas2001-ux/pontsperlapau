/**
 * Export Service — PDF & Excel generation for school reports.
 *
 * Exports are generated entirely in the browser (no server round-trip).
 * jsPDF + jspdf-autotable handle PDF; ExcelJS handles Excel.
 *
 * Available exports
 * ─────────────────
 * PDF
 *   • exportClassRosterPDF    — all students in a class with final grades
 *   • exportReportCardPDF     — one student's grades + attendance for a class
 *   • exportAttendanceSheetPDF — class attendance over a date range
 *
 * Excel
 *   • exportClassRosterExcel  — same as PDF roster but as .xlsx
 *   • exportGradesExcel       — all grade entries for a class, one row per entry
 *   • exportAttendanceExcel   — attendance records, one row per student per date
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveRowsAsExcel, type ExcelRow } from '@/lib/excel';
import type { GradeStudent } from './gradesService';
import type { BranchResult, SurveyFull } from './surveyService';

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Format today as YYYY-MM-DD for filenames. */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Add a standard page header to a jsPDF doc and return the Y cursor. */
function addPDFHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const pageW = doc.internal.pageSize.getWidth();

  // Teal banner
  doc.setFillColor(13, 148, 136); // teal-600
  doc.rect(0, 0, pageW, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Ponts per la Pau', 14, 10);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 17);

  // Reset text colour
  doc.setTextColor(40, 40, 40);

  let y = 30;
  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(subtitle, 14, y);
    y += 7;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 6;

  doc.setTextColor(40, 40, 40);
  return y;
}

function formatSurveyDate(date?: string): string {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function surveyQuestionAggregates(survey: SurveyFull, results: BranchResult[]) {
  return survey.questions.map((q) => {
    let positiveTotal = 0;
    let negativeTotal = 0;
    let neutralTotal = 0;
    let grandTotal = 0;

    results.forEach((b) => {
      const qr = b.questionResults.find((r) => r.questionId === q.id);
      if (!qr) return;
      qr.counts.forEach((c) => {
        grandTotal += c.count;
        if (c.sentiment === 'positive') positiveTotal += c.count;
        else if (c.sentiment === 'negative') negativeTotal += c.count;
        else neutralTotal += c.count;
      });
    });

    return {
      question: q,
      positiveTotal,
      negativeTotal,
      neutralTotal,
      grandTotal,
      positiveRate: grandTotal > 0 ? positiveTotal / grandTotal : 0,
      negativeRate: grandTotal > 0 ? negativeTotal / grandTotal : 0,
      neutralRate: grandTotal > 0 ? neutralTotal / grandTotal : 0,
    };
  });
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ─── PDF / Excel: Survey Results ─────────────────────────────────────────────

export function exportSurveyResultsPDF(survey: SurveyFull, results: BranchResult[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = addPDFHeader(doc, 'Survey Results', survey.title);
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const usableW = pageW - margin * 2;

  const aggregates = surveyQuestionAggregates(survey, results);
  const totalRespondents = results.reduce((sum, branch) => sum + branch.totalRespondents, 0);
  const submittedBranches = results.filter((branch) => branch.submitted).length;
  const targetStudents = survey.respondents.filter((respondent) => respondent.respondent_type === 'student').length;
  const targetStaff = survey.respondents.filter((respondent) => respondent.respondent_type === 'staff').length;
  const avgSatisfaction = aggregates.length > 0
    ? aggregates.reduce((sum, q) => sum + q.positiveRate, 0) / aggregates.length
    : 0;

  const meta = [
    survey.period,
    survey.survey_date ? `Date: ${formatSurveyDate(survey.survey_date)}` : '',
    `Status: ${survey.status}`,
  ].filter(Boolean).join('   |   ');
  if (meta) {
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(meta, margin, y);
    y += 7;
  }

  const kpis = [
    ['Total Respondents', totalRespondents.toLocaleString()],
    ['Target Students / Staff', `${targetStudents} / ${targetStaff}`],
    ['Average Positive', pct(avgSatisfaction)],
  ];
  const cardW = (usableW - 8) / 3;
  kpis.forEach(([label, value], index) => {
    const x = margin + index * (cardW + 4);
    doc.setFillColor(240, 253, 250);
    doc.roundedRect(x, y, cardW, 20, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 5, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 118, 110);
    doc.text(value, x + 5, y + 15);
    doc.setFont('helvetica', 'normal');
  });
  y += 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Satisfaction by Branch', margin, y);
  y += 7;

  const branchRows = results.slice(0, 8);
  branchRows.forEach((branch) => {
    const avg = branch.questionResults.length > 0
      ? branch.questionResults.reduce((sum, q) => sum + q.positiveRate, 0) / branch.questionResults.length
      : 0;
    const barW = Math.max(1, Math.round((usableW - 62) * avg));
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(branch.branchName.slice(0, 32), margin, y + 3);
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin + 50, y - 1, usableW - 62, 5, 2, 2, 'F');
    doc.setFillColor(avg >= 0.75 ? 16 : avg >= 0.5 ? 245 : 239, avg >= 0.75 ? 185 : avg >= 0.5 ? 158 : 68, avg >= 0.75 ? 129 : avg >= 0.5 ? 11 : 68);
    doc.roundedRect(margin + 50, y - 1, barW, 5, 2, 2, 'F');
    doc.text(pct(avg), pageW - margin - 10, y + 3, { align: 'right' });
    y += 8;
  });

  y += 5;
  autoTable(doc, {
    startY: y,
    head: [['#', 'Question', 'Positive', 'Negative', 'Neutral', 'Responses']],
    body: aggregates.map((qa, index) => [
      String(index + 1),
      qa.question.question_text,
      pct(qa.positiveRate),
      pct(qa.negativeRate),
      pct(qa.neutralRate),
      qa.grandTotal.toLocaleString(),
    ]),
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
    styles: { fontSize: 8, cellPadding: 2 },
  });

  doc.addPage();
  y = addPDFHeader(doc, 'Survey Results - Branch Detail', survey.title);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Branches submitted: ${submittedBranches} / ${results.length}`, margin, y);
  y += 7;
  autoTable(doc, {
    startY: y + 2,
    head: [['Branch', 'Respondents', 'Average Positive', ...survey.questions.map((_, index) => `Q${index + 1}`)]],
    body: results.map((branch) => {
      const avg = branch.questionResults.length > 0
        ? branch.questionResults.reduce((sum, q) => sum + q.positiveRate, 0) / branch.questionResults.length
        : 0;
      return [
        branch.branchName,
        String(branch.totalRespondents),
        pct(avg),
        ...branch.questionResults.map((q) => pct(q.positiveRate)),
      ];
    }),
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    styles: { fontSize: 7, cellPadding: 1.8 },
  });

  if (survey.respondents.length > 0) {
    doc.addPage();
    y = addPDFHeader(doc, 'Survey Target Respondents', survey.title);
    autoTable(doc, {
      startY: y + 2,
      head: [['Type', 'Name']],
      body: survey.respondents.map((respondent) => [
        respondent.respondent_type === 'student' ? 'Student' : 'Staff',
        respondent.respondent_name,
      ]),
      headStyles: { fillColor: [13, 148, 136], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      styles: { fontSize: 8, cellPadding: 2 },
    });
  }

  doc.save(`survey_results_${safeFilePart(survey.title)}_${today()}.pdf`);
}

export async function exportSurveyResultsExcel(survey: SurveyFull, results: BranchResult[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ponts per la Pau';
  workbook.created = new Date();

  const aggregates = surveyQuestionAggregates(survey, results);
  const totalRespondents = results.reduce((sum, branch) => sum + branch.totalRespondents, 0);
  const submittedBranches = results.filter((branch) => branch.submitted).length;
  const targetStudents = survey.respondents.filter((respondent) => respondent.respondent_type === 'student').length;
  const targetStaff = survey.respondents.filter((respondent) => respondent.respondent_type === 'staff').length;
  const avgSatisfaction = aggregates.length > 0
    ? aggregates.reduce((sum, q) => sum + q.positiveRate, 0) / aggregates.length
    : 0;

  const addSheet = (name: string, rows: Array<Record<string, string | number>>) => {
    const sheet = workbook.addWorksheet(name);
    const headers = Object.keys(rows[0] ?? { Empty: '' });
    sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, Math.min(55, header.length + 6)) }));
    rows.forEach((row) => sheet.addRow(row));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column, index) => {
      let max = headers[index]?.length ?? 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        max = Math.max(max, String(cell.value ?? '').length);
      });
      column.width = Math.max(12, Math.min(60, max + 2));
    });
    return sheet;
  };

  addSheet('Overview', [
    { Metric: 'Survey Title', Value: survey.title },
    { Metric: 'Period', Value: survey.period ?? '' },
    { Metric: 'Survey Date', Value: formatSurveyDate(survey.survey_date) },
    { Metric: 'Status', Value: survey.status },
    { Metric: 'Target Group', Value: survey.respondent_type ?? '' },
    { Metric: 'Target Students', Value: targetStudents },
    { Metric: 'Target Staff', Value: targetStaff },
    { Metric: 'Target Total', Value: survey.respondents.length },
    { Metric: 'Total Respondents', Value: totalRespondents },
    { Metric: 'Branches Submitted', Value: submittedBranches },
    { Metric: 'Branches With Data', Value: results.length },
    { Metric: 'Average Positive Rate', Value: pct(avgSatisfaction) },
  ]);

  addSheet('Question Summary', aggregates.map((qa, index) => ({
    '#': index + 1,
    Question: qa.question.question_text,
    Responses: qa.grandTotal,
    Positive: qa.positiveTotal,
    'Positive %': pct(qa.positiveRate),
    Negative: qa.negativeTotal,
    'Negative %': pct(qa.negativeRate),
    Neutral: qa.neutralTotal,
    'Neutral %': pct(qa.neutralRate),
  })));

  addSheet('Branch Summary', results.map((branch) => {
    const avg = branch.questionResults.length > 0
      ? branch.questionResults.reduce((sum, q) => sum + q.positiveRate, 0) / branch.questionResults.length
      : 0;
    const row: Record<string, string | number> = {
      Branch: branch.branchName,
      Respondents: branch.totalRespondents,
      Submitted: branch.submitted ? 'Yes' : 'No',
      'Average Positive %': pct(avg),
    };
    branch.questionResults.forEach((q, index) => {
      row[`Q${index + 1} Positive %`] = pct(q.positiveRate);
    });
    return row;
  }));

  addSheet('Raw Counts', results.flatMap((branch) =>
    branch.questionResults.flatMap((question, questionIndex) =>
      question.counts.map((count) => ({
        Branch: branch.branchName,
        Respondents: branch.totalRespondents,
        Question: `Q${questionIndex + 1}`,
        'Question Text': question.questionText,
        Option: count.label,
        Sentiment: count.sentiment,
        Count: count.count,
      }))
    )
  ));

  addSheet('Target Respondents', survey.respondents.map((respondent) => ({
    Type: respondent.respondent_type === 'student' ? 'Student' : 'Staff',
    Name: respondent.respondent_name,
    Branch: respondent.branch_id,
  })));

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `survey_results_${safeFilePart(survey.title)}_${today()}.xlsx`,
  );
}

// ─── PDF: Class Roster ───────────────────────────────────────────────────────

export interface ClassInfo {
  name: string;
  subject?: string;
  teacherName?: string;
}

/**
 * Generate a PDF class roster listing every student with their final grade,
 * average score, and attendance percentage.
 */
export function exportClassRosterPDF(
  classInfo: ClassInfo,
  students: GradeStudent[],
): void {
  const doc = new jsPDF();
  let y = addPDFHeader(doc, 'Class Roster', classInfo.name);

  if (classInfo.subject || classInfo.teacherName) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const meta = [classInfo.subject, classInfo.teacherName ? `Teacher: ${classInfo.teacherName}` : '']
      .filter(Boolean)
      .join('  •  ');
    doc.text(meta, 14, y);
    y += 6;
  }

  const rows = students.map((s, i) => [
    String(i + 1),
    `${s.lastName}, ${s.firstName}`,
    s.studentCode,
    s.average !== null ? `${s.average}%` : '—',
    s.finalGrade ?? '—',
    `${s.attendancePct}%`,
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [['#', 'Student', 'ID', 'Average', 'Final Grade', 'Attendance']],
    body: rows,
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
    styles: { fontSize: 9 },
  });

  doc.save(`roster_${safeFilePart(classInfo.name)}_${today()}.pdf`);
}

// ─── PDF: Student Report Card ────────────────────────────────────────────────

/**
 * Generate a single-student report card showing every grade entry plus a
 * summary of their average, final grade, and attendance.
 */
export function exportReportCardPDF(
  classInfo: ClassInfo,
  student: GradeStudent,
): void {
  const doc = new jsPDF();
  const studentName = `${student.firstName} ${student.lastName}`;
  let y = addPDFHeader(doc, 'Student Report Card', classInfo.name);

  // Student summary box
  doc.setFillColor(240, 253, 250);
  doc.roundedRect(14, y, 182, 28, 3, 3, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 148, 136);
  doc.text(studentName, 20, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Student ID: ${student.studentCode}`, 20, y + 15);
  doc.text(`Average: ${student.average !== null ? student.average + '%' : '—'}`, 80, y + 15);
  doc.text(`Final Grade: ${student.finalGrade ?? '—'}`, 130, y + 15);
  doc.text(`Attendance: ${student.attendancePct}%`, 20, y + 22);
  y += 34;

  // Grade entries table
  if (student.entries.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No grade entries recorded.', 14, y + 6);
  } else {
    const rows = student.entries.map((e) => [
      e.assessment_date,
      e.assessment_name,
      e.assessment_type.charAt(0).toUpperCase() + e.assessment_type.slice(1),
      e.score !== null ? `${e.score} / ${e.max_score}` : '—',
      e.score !== null ? `${Math.round((e.score / e.max_score) * 1000) / 10}%` : '—',
      e.grade_letter ?? '—',
      e.notes ?? '',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Assessment', 'Type', 'Score', '%', 'Letter', 'Notes']],
      body: rows,
      headStyles: { fillColor: [13, 148, 136], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: {
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { cellWidth: 40, fontSize: 7 },
      },
      styles: { fontSize: 8.5 },
    });
  }

  doc.save(`report_card_${student.studentCode}_${today()}.pdf`);
}

// ─── PDF: Attendance Sheet ───────────────────────────────────────────────────

export interface AttendanceRow {
  studentName: string;
  studentCode: string;
  records: { date: string; status: string }[];
}

/**
 * Generate a class attendance summary.
 * Each row is a student; each column is a session date.
 * Status abbreviations: P=Present, A=Absent, L=Late, E=Excused.
 */
export function exportAttendanceSheetPDF(
  classInfo: ClassInfo,
  dates: string[],
  rows: AttendanceRow[],
): void {
  const orientation = dates.length > 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const usableW = pageW - margin * 2;

  const statusAbbr: Record<string, string> = {
    present: 'P', absent: 'A', late: 'L', excused: 'E',
  };

  const statusStyle: Record<string, { fill: [number, number, number]; text: [number, number, number] }> = {
    P: { fill: [220, 252, 231], text: [22, 101, 52] },
    A: { fill: [254, 226, 226], text: [153, 27, 27] },
    L: { fill: [254, 249, 195], text: [133, 77, 14] },
    E: { fill: [219, 234, 254], text: [30, 64, 175] },
  };

  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Ponts per la Pau', margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Attendance Sheet', margin, 22);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(classInfo.name, margin, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const meta = [
    classInfo.teacherName ? `Teacher: ${classInfo.teacherName}` : '',
    `Generated: ${new Date().toLocaleString()}`,
    `${rows.length} students`,
    `${dates.length} session${dates.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join('   |   ');
  doc.text(meta, margin, 55);

  const legendY = 65;
  const legend = [
    ['P', 'Present'],
    ['A', 'Absent'],
    ['L', 'Late'],
    ['E', 'Excused'],
  ] as const;
  let legendX = margin;
  legend.forEach(([abbr, label]) => {
    const style = statusStyle[abbr];
    doc.setFillColor(...style.fill);
    doc.roundedRect(legendX, legendY - 4, 6, 6, 1.5, 1.5, 'F');
    doc.setTextColor(...style.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(abbr, legendX + 3, legendY + 0.3, { align: 'center' });
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(label, legendX + 8, legendY);
    legendX += 27;
  });

  const fixedW = dates.length > 0 ? Math.min(82, usableW * 0.45) : usableW;
  const studentW = dates.length > 0 ? fixedW - 24 : usableW - 26;
  const dateW = dates.length > 0 ? Math.max(12, (usableW - fixedW) / dates.length) : 0;
  const head = [['Student', 'ID', ...dates.map(formatDateLabel)]];
  const body = rows.map((r) =>
    [
      r.studentName,
      r.studentCode,
      ...dates.map((d) => {
        const rec = r.records.find((x) => x.date === d);
        return rec ? (statusAbbr[rec.status] ?? rec.status) : '—';
      }),
    ],
  );

  autoTable(doc, {
    startY: 72,
    head,
    body,
    margin: { left: margin, right: margin },
    tableWidth: usableW,
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: {
      fontSize: dates.length > 10 ? 7 : 8,
      halign: 'center',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      cellPadding: 2,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: studentW, fontStyle: 'bold' },
      1: { cellWidth: 24 },
      ...Object.fromEntries(dates.map((_, index) => [index + 2, { cellWidth: dateW }])),
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index >= 2) {
        const val = String(data.cell.raw ?? '');
        const style = statusStyle[val];
        if (style) {
          data.cell.styles.fillColor = style.fill;
          data.cell.styles.textColor = style.text;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`attendance_${safeFilePart(classInfo.name)}_${today()}.pdf`);
}

// ─── Excel: Class Roster ─────────────────────────────────────────────────────

/**
 * Export class roster as an Excel workbook with auto-column widths and a
 * styled header row.
 */
export function exportClassRosterExcel(
  classInfo: ClassInfo,
  students: GradeStudent[],
): void {
  const rows = students.map((s, i) => ({
    '#': i + 1,
    'Last Name': s.lastName,
    'First Name': s.firstName,
    'Student ID': s.studentCode,
    'Average (%)': s.average ?? '',
    'Final Grade': s.finalGrade ?? '',
    'Attendance (%)': s.attendancePct,
  }));

  void saveRowsAsExcel(
    rows,
    'Roster',
    `roster_${safeFilePart(classInfo.name)}_${today()}.xlsx`,
  );
}

// ─── Excel: Grades ───────────────────────────────────────────────────────────

/**
 * Export all grade entries for a class as a flat Excel sheet.
 * One row per entry — easy to sort/filter in Excel.
 */
export function exportGradesExcel(
  classInfo: ClassInfo,
  students: GradeStudent[],
): void {
  const rows: ExcelRow[] = [];

  for (const s of students) {
    if (s.entries.length === 0) {
      rows.push({
        'Last Name': s.lastName,
        'First Name': s.firstName,
        'Student ID': s.studentCode,
        'Date': '',
        'Assessment': '',
        'Type': '',
        'Score': '',
        'Max Score': '',
        'Percentage': '',
        'Letter': '',
        'Notes': '',
        'Average (%)': s.average ?? '',
        'Final Grade': s.finalGrade ?? '',
      });
    } else {
      for (const e of s.entries) {
        const pct =
          e.score !== null
            ? Math.round((e.score / e.max_score) * 1000) / 10
            : '';
        rows.push({
          'Last Name': s.lastName,
          'First Name': s.firstName,
          'Student ID': s.studentCode,
          'Date': e.assessment_date,
          'Assessment': e.assessment_name,
          'Type': e.assessment_type,
          'Score': e.score ?? '',
          'Max Score': e.max_score,
          'Percentage': pct,
          'Letter': e.grade_letter ?? '',
          'Notes': e.notes ?? '',
          'Average (%)': s.average ?? '',
          'Final Grade': s.finalGrade ?? '',
        });
      }
    }
  }

  void saveRowsAsExcel(
    rows,
    'Grades',
    `grades_${safeFilePart(classInfo.name)}_${today()}.xlsx`,
  );
}

// ─── Excel: Attendance ───────────────────────────────────────────────────────

/**
 * Export attendance records as Excel.
 * Each unique date becomes its own column (P/A/L/E values).
 */
export function exportAttendanceExcel(
  classInfo: ClassInfo,
  dates: string[],
  rows: AttendanceRow[],
): void {
  void (async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ponts per la Pau';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Attendance', {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }],
      pageSetup: {
        orientation: dates.length > 5 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
      },
    });

    const statusAbbr: Record<string, string> = {
      present: 'P', absent: 'A', late: 'L', excused: 'E',
    };
    const statusFills: Record<string, { fill: string; font: string }> = {
      P: { fill: 'FFDCFCE7', font: 'FF166534' },
      A: { fill: 'FFFEE2E2', font: 'FF991B1B' },
      L: { fill: 'FFFEF9C3', font: 'FF854D0E' },
      E: { fill: 'FFDBEAFE', font: 'FF1E40AF' },
    };

    const headers = ['Student Name', 'Student ID', ...dates.map(formatDateLabel)];
    const lastColumn = Math.max(headers.length, 2);

    worksheet.mergeCells(1, 1, 1, lastColumn);
    worksheet.mergeCells(2, 1, 2, lastColumn);
    worksheet.mergeCells(3, 1, 3, lastColumn);

    const orgCell = worksheet.getCell('A1');
    orgCell.value = 'Ponts per la Pau';
    orgCell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    orgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    orgCell.alignment = { vertical: 'middle' };
    worksheet.getRow(1).height = 28;

    const titleCell = worksheet.getCell('A2');
    titleCell.value = `Attendance Sheet - ${classInfo.name}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle' };
    worksheet.getRow(2).height = 24;

    worksheet.getCell('A3').value = [
      classInfo.teacherName ? `Teacher: ${classInfo.teacherName}` : '',
      `Generated: ${new Date().toLocaleString()}`,
      `${rows.length} students`,
      'P = Present, A = Absent, L = Late, E = Excused',
    ].filter(Boolean).join('   |   ');
    worksheet.getCell('A3').font = { color: { argb: 'FF64748B' }, size: 10 };
    worksheet.getRow(3).height = 22;

    const headerRow = worksheet.getRow(5);
    headerRow.values = headers;
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    rows.forEach((r, rowIndex) => {
      const values = [
        r.studentName,
        r.studentCode,
        ...dates.map((d) => {
          const rec = r.records.find((x) => x.date === d);
          return rec ? (statusAbbr[rec.status] ?? rec.status) : '—';
        }),
      ];
      const row = worksheet.addRow(values);
      row.height = 21;
      row.eachCell((cell, colNumber) => {
        const status = String(cell.value ?? '');
        const statusStyle = statusFills[status];
        const isAlternating = rowIndex % 2 === 0;
        cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (colNumber <= 2) {
          cell.font = { bold: colNumber === 1, color: { argb: 'FF0F172A' } };
          if (isAlternating) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        } else if (statusStyle) {
          cell.font = { bold: true, color: { argb: statusStyle.font } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusStyle.fill } };
        }
      });
    });

    worksheet.columns = [
      { width: 30 },
      { width: 16 },
      ...dates.map(() => ({ width: 13 })),
    ];
    worksheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, rows.length + 5), column: lastColumn },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${safeFilePart(classInfo.name)}_${today()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  })();
}

// ─── PDF: Certificate ────────────────────────────────────────────────────────

export type CertificateType = 'enrollment' | 'completion';

export interface CertificateData {
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  className?: string;
  branchName?: string;
  academicYear?: string;
  issuedBy?: string;
  type: CertificateType;
}

/**
 * Generate a printable PDF certificate (A4 landscape).
 * enrollment = confirms the student is enrolled
 * completion  = confirms the student has completed a programme
 */
export function exportCertificatePDF(data: CertificateData) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 297
  const H = doc.internal.pageSize.getHeight();  // 210
  const cx = W / 2;

  // --- Background / border ---
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(0, 0, W, H, 'F');

  // Outer decorative border
  doc.setDrawColor(13, 148, 136); // teal-600
  doc.setLineWidth(3);
  doc.rect(8, 8, W - 16, H - 16);
  doc.setLineWidth(0.8);
  doc.rect(11, 11, W - 22, H - 22);

  // Teal top ribbon
  doc.setFillColor(13, 148, 136);
  doc.rect(8, 8, W - 16, 22, 'F');

  // Organisation name in ribbon
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Ponts per la Pau', cx, 22, { align: 'center' });

  // Certificate title
  const title = data.type === 'enrollment'
    ? 'CERTIFICATE OF ENROLLMENT'
    : 'CERTIFICATE OF COMPLETION';

  doc.setTextColor(13, 148, 136);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(title, cx, 55, { align: 'center' });

  // Divider line
  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.5);
  doc.line(40, 60, W - 40, 60);

  // Body text
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');

  const introText = data.type === 'enrollment'
    ? 'This is to certify that'
    : 'This is to certify that';
  doc.text(introText, cx, 75, { align: 'center' });

  // Student name — large
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.studentFirstName} ${data.studentLastName}`, cx, 92, { align: 'center' });

  // Student code
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Student ID: ${data.studentCode}`, cx, 100, { align: 'center' });

  // Middle sentence
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');

  const midText = data.type === 'enrollment'
    ? `is officially enrolled${data.className ? ` in ${data.className}` : ''} at`
    : `has successfully completed${data.className ? ` the programme ${data.className}` : ' the programme'} at`;
  doc.text(midText, cx, 112, { align: 'center' });

  // Branch / school name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 148, 136);
  doc.text(data.branchName ?? 'Ponts per la Pau', cx, 124, { align: 'center' });

  if (data.academicYear) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Academic Year: ${data.academicYear}`, cx, 133, { align: 'center' });
  }

  // Issue date + signature line
  const issueDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const sigY = H - 40;

  // Date left
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(`Issued: ${issueDate}`, 30, sigY + 8);

  // Signature right
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(W - 90, sigY, W - 30, sigY);
  doc.text(data.issuedBy ?? 'Director', W - 60, sigY + 6, { align: 'center' });
  doc.text('Authorised Signatory', W - 60, sigY + 11, { align: 'center' });

  // Bottom ribbon
  doc.setFillColor(13, 148, 136);
  doc.rect(8, H - 19, W - 16, 11, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(`Generated ${issueDate} · pontsperlapau.org`, cx, H - 12, { align: 'center' });

  const name = `certificate-${data.studentCode}-${data.type}-${today()}.pdf`;
  doc.save(name);
}
