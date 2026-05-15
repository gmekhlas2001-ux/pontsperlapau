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

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Format today as YYYY-MM-DD for filenames. */
function today(): string {
  return new Date().toISOString().split('T')[0];
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

  doc.save(`roster_${classInfo.name.replace(/\s+/g, '_')}_${today()}.pdf`);
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
  // Use landscape if there are many dates
  const orientation = dates.length > 8 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation });
  let y = addPDFHeader(doc, 'Attendance Sheet', classInfo.name);

  // Status abbreviation legend
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('P = Present   A = Absent   L = Late   E = Excused', 14, y + 4);
  y += 10;

  const statusAbbr: Record<string, string> = {
    present: 'P', absent: 'A', late: 'L', excused: 'E',
  };

  const statusColor: Record<string, [number, number, number]> = {
    P: [134, 239, 172],  // green
    A: [252, 165, 165],  // red
    L: [253, 224, 71],   // yellow
    E: [147, 197, 253],  // blue
  };

  const head = [['Student', 'ID', ...dates.map((d) => d.slice(5))]]; // show MM-DD
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
    startY: y,
    head,
    body,
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 8, halign: 'center' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 40 },
      1: { cellWidth: 22 },
    },
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index >= 2) {
        const val = String(data.cell.raw ?? '');
        const color = statusColor[val];
        if (color) {
          const { x, y: cy, width, height } = data.cell;
          doc.setFillColor(...color);
          doc.rect(x, cy, width, height, 'F');
          doc.setTextColor(40, 40, 40);
          doc.setFontSize(7.5);
          doc.text(val, x + width / 2, cy + height / 2 + 1, { align: 'center' });
        }
      }
    },
  });

  doc.save(`attendance_${classInfo.name.replace(/\s+/g, '_')}_${today()}.pdf`);
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
    `roster_${classInfo.name.replace(/\s+/g, '_')}_${today()}.xlsx`,
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
    `grades_${classInfo.name.replace(/\s+/g, '_')}_${today()}.xlsx`,
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
  const statusAbbr: Record<string, string> = {
    present: 'P', absent: 'A', late: 'L', excused: 'E',
  };

  const data = rows.map((r) => {
    const row: Record<string, string | number> = {
      'Student Name': r.studentName,
      'Student ID': r.studentCode,
    };
    for (const d of dates) {
      const rec = r.records.find((x) => x.date === d);
      row[d] = rec ? (statusAbbr[rec.status] ?? rec.status) : '—';
    }
    return row;
  });

  void saveRowsAsExcel(
    data,
    'Attendance',
    `attendance_${classInfo.name.replace(/\s+/g, '_')}_${today()}.xlsx`,
    [24, 18, ...dates.map(() => 12)],
  );
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
