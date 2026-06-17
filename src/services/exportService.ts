/**
 * Export Service — PDF & Excel generation for school reports.
 *
 * Exports are generated entirely in the browser (no server round-trip).
 * jsPDF + jspdf-autotable handle school PDFs; survey PDFs rasterize the
 * browser-rendered report so Dari/Persian text keeps proper RTL shaping.
 * ExcelJS handles Excel.
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
import { optionsForQuestion, type BranchResult, type SurveyFull, type SurveyIndividualResponse, type SurveyRespondentKind } from './surveyService';

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
    const optionTotals = new Map<string, { label: string; count: number }>();

    results.forEach((b) => {
      const qr = b.questionResults.find((r) => r.questionId === q.id);
      if (!qr) return;
      qr.counts.forEach((c) => {
        grandTotal += c.count;
        const current = optionTotals.get(c.optionId) ?? { label: c.label, count: 0 };
        current.count += c.count;
        optionTotals.set(c.optionId, current);
        if (c.sentiment === 'positive') positiveTotal += c.count;
        else if (c.sentiment === 'negative') negativeTotal += c.count;
        else neutralTotal += c.count;
      });
    });
    const textAnswerTotal = results.reduce((sum, branch) => (
      sum + branch.individualResponses.filter((response) =>
        response.question_id === q.id &&
        !response.option_id &&
        Boolean(response.text_answer?.trim())
      ).length
    ), 0);

    return {
      question: q,
      positiveTotal,
      negativeTotal,
      neutralTotal,
      grandTotal,
      positiveRate: grandTotal > 0 ? positiveTotal / grandTotal : 0,
      negativeRate: grandTotal > 0 ? negativeTotal / grandTotal : 0,
      neutralRate: grandTotal > 0 ? neutralTotal / grandTotal : 0,
      optionCounts: Array.from(optionTotals.values()),
      textAnswerTotal,
      responseTotal: grandTotal + textAnswerTotal,
    };
  });
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function questionTypeLabel(value?: string): string {
  return (value ?? 'multiple_choice')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sectionTitleForQuestion(survey: SurveyFull, sectionId?: string | null): string {
  if (!sectionId) return '';
  return survey.sections.find((section) => section.id === sectionId)?.title ?? '';
}

function respondentKindLabel(kind: SurveyRespondentKind): string {
  return kind === 'student' ? 'شاگرد / Student' : 'کارمند / Staff';
}

function answerTextForIndividualExport(survey: SurveyFull, response: SurveyIndividualResponse): string {
  if (response.text_answer) return response.text_answer;
  if (response.option_id) return survey.options.find((option) => option.id === response.option_id)?.label ?? '';
  return '';
}

function individualRowsForExport(survey: SurveyFull, results: BranchResult[]) {
  return results.flatMap((branch) =>
    branch.individualResponses.map((response) => ({
      branchName: branch.branchName,
      response,
      questionText: survey.questions.find((question) => question.id === response.question_id)?.question_text ?? '',
      answerText: answerTextForIndividualExport(survey, response),
    })),
  );
}

export interface SurveyIndividualExportTarget {
  branchId: string;
  branchName: string;
  respondentType: SurveyRespondentKind;
  respondentId: string;
  respondentName: string;
}

function individualAnswerRowsForExport(
  survey: SurveyFull,
  results: BranchResult[],
  target: SurveyIndividualExportTarget,
) {
  const rows = individualRowsForExport(survey, results).filter((row) =>
    row.response.branch_id === target.branchId &&
    row.response.respondent_type === target.respondentType &&
    row.response.respondent_id === target.respondentId
  );
  const rowsByQuestion = new Map<string, typeof rows>();
  rows.forEach((row) => {
    const questionRows = rowsByQuestion.get(row.response.question_id) ?? [];
    questionRows.push(row);
    rowsByQuestion.set(row.response.question_id, questionRows);
  });

  return survey.questions.map((question, index) => {
    const questionRows = rowsByQuestion.get(question.id) ?? [];
    const answers = questionRows.map((row) => row.answerText).filter(Boolean);
    const updatedAt = questionRows
      .map((row) => row.response.updated_at)
      .sort()
      .at(-1) ?? '';
    return {
      index: index + 1,
      section: sectionTitleForQuestion(survey, question.section_id),
      question,
      answers,
      answerText: answers.length > 0 ? answers.join('، ') : 'پاسخ داده نشده / Not answered',
      answered: answers.length > 0,
      updatedAt,
    };
  });
}

function buildAnswerDistributionHtml(
  options: { label: string; count: number }[],
  total: number,
  textAnswerTotal = 0,
): string {
  if (options.length === 0) {
    return textAnswerTotal > 0
      ? `<span class="muted">${escapeHtml(textAnswerTotal)} written/date/time answers. Use the individual export to review exact answers.</span>`
      : '<span class="muted">No option answers have been submitted yet.</span>';
  }
  return options.map((option) => {
    const ratio = total > 0 ? Math.round((option.count / total) * 100) : 0;
    return `
      <div class="option-row">
        <div class="option-label" dir="auto">${escapeHtml(option.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${ratio}%"></div></div>
        <div class="option-count">${escapeHtml(option.count)} (${ratio}%)</div>
      </div>
    `;
  }).join('');
}

async function downloadSurveyReportPDF(filename: string, html: string) {
  const downloadHtmlFallback = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, filename.replace(/\.pdf$/i, '.html'));
  };

  const iframe = document.createElement('iframe');
  iframe.title = filename;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1200px';
  iframe.style.height = '1600px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  try {
    const { default: html2canvas } = await import('html2canvas');
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out while preparing the survey PDF')), 10_000);
      iframe.onload = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      document.body.appendChild(iframe);
      iframe.srcdoc = html;
    });

    const frameDocument = iframe.contentDocument;
    const reportElement = frameDocument?.querySelector('.report') as HTMLElement | null;
    if (!frameDocument || !reportElement) throw new Error('Survey PDF report could not be prepared');

    await frameDocument.fonts?.ready;
    await new Promise<void>((resolve) => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        resolve();
        return;
      }
      frameWindow.requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        resolve();
        return;
      }
      frameWindow.requestAnimationFrame(() => resolve());
    });

    const maxCanvasHeight = 30_000;
    const reportHeight = Math.max(1, reportElement.scrollHeight);
    const scale = Math.min(1.5, window.devicePixelRatio || 1.25, maxCanvasHeight / reportHeight);
    const canvas = await html2canvas(reportElement, {
      backgroundColor: '#ffffff',
      logging: false,
      scale,
      useCORS: true,
      windowWidth: 1200,
      windowHeight: Math.max(1600, reportHeight),
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const canvasPageHeight = Math.floor(canvas.width * (pageHeight / pageWidth));
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = canvasPageHeight;
    const pageContext = pageCanvas.getContext('2d');
    if (!pageContext) throw new Error('Survey PDF canvas could not be prepared');

    for (let sourceY = 0, pageIndex = 0; sourceY < canvas.height; sourceY += canvasPageHeight, pageIndex += 1) {
      const sliceHeight = Math.min(canvasPageHeight, canvas.height - sourceY);
      pageContext.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.fillStyle = '#ffffff';
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);
    }

    pdf.save(filename);
  } catch (error) {
    console.error('Failed to generate survey PDF', error);
    downloadHtmlFallback();
    throw error;
  } finally {
    iframe.remove();
  }
}

// ─── PDF / Excel: Survey Results ─────────────────────────────────────────────

export async function exportSurveyResultsPDF(survey: SurveyFull, results: BranchResult[]): Promise<void> {
  const aggregates = surveyQuestionAggregates(survey, results);
  const totalRespondents = results.reduce((sum, branch) => sum + branch.totalRespondents, 0);
  const submittedBranches = results.filter((branch) => branch.submitted).length;
  const targetStudents = survey.respondents.filter((respondent) => respondent.respondent_type === 'student').length;
  const targetStaff = survey.respondents.filter((respondent) => respondent.respondent_type === 'staff').length;
  const taggedAggregates = aggregates.filter((qa) => qa.question.sentiment_enabled);
  const taggedQuestionIds = new Set(taggedAggregates.map((qa) => qa.question.id));
  const hasSentimentAnalytics = taggedAggregates.length > 0;
  const recordedAnswerTotal = aggregates.reduce((sum, qa) => sum + qa.responseTotal, 0);
  const avgSatisfaction = taggedAggregates.length > 0
    ? taggedAggregates.reduce((sum, q) => sum + q.positiveRate, 0) / taggedAggregates.length
    : 0;
  const filename = `survey_results_${safeFilePart(survey.title)}_${today()}.pdf`;
  const branchEmptyColspan = hasSentimentAnalytics ? 5 : 4;

  const branchRows = results.map((branch) => {
    const taggedResults = branch.questionResults.filter((question) => taggedQuestionIds.has(question.questionId) && question.total > 0);
    const avg = taggedResults.length > 0
      ? taggedResults.reduce((sum, q) => sum + q.positiveRate, 0) / taggedResults.length
      : 0;
    return `
      <tr>
        <td>${escapeHtml(branch.branchName)}</td>
        <td>${escapeHtml(branch.totalRespondents)}</td>
        <td>${escapeHtml(branch.individualResponses.length)}</td>
        <td>${escapeHtml(branch.submitted ? 'ثبت شده / Submitted' : 'بدون معلومات / No data')}</td>
        ${hasSentimentAnalytics ? `<td>${escapeHtml(pct(avg))}</td>` : ''}
      </tr>
    `;
  }).join('');

  const questionRows = aggregates.map((qa, index) => `
    <article class="question-block">
      <div class="question-head">
        <span class="question-number">${index + 1}</span>
        <div>
          <h3 dir="auto">${escapeHtml(qa.question.question_text)}</h3>
          <p>${escapeHtml(questionTypeLabel(qa.question.question_type))} - ${escapeHtml(qa.responseTotal)} responses</p>
        </div>
      </div>
      <div class="distribution">${buildAnswerDistributionHtml(qa.optionCounts, qa.grandTotal, qa.textAnswerTotal)}</div>
      ${qa.question.sentiment_enabled ? `
        <div class="tag-summary">
          <span>Positive / مثبت ${escapeHtml(pct(qa.positiveRate))}</span>
          <span>Neutral / عادی ${escapeHtml(pct(qa.neutralRate))}</span>
          <span>Negative / منفی ${escapeHtml(pct(qa.negativeRate))}</span>
        </div>
      ` : ''}
    </article>
  `).join('');

  const questionnaireRows = survey.questions.map((question, index) => `
    <tr>
      <td>${index + 1}</td>
      <td dir="auto">${escapeHtml(sectionTitleForQuestion(survey, question.section_id))}</td>
      <td>${escapeHtml(questionTypeLabel(question.question_type))}</td>
      <td class="rtl-cell" dir="rtl">${escapeHtml(question.question_text)}</td>
      <td class="rtl-cell" dir="rtl">${escapeHtml(optionsForQuestion(survey, question.id).map((option) => option.label).join('، '))}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(filename)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #0f172a;
            background: #f8fafc;
            font-family: Tahoma, "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif;
            line-height: 1.65;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .report {
            max-width: 1100px;
            margin: 0 auto;
            padding: 28px;
            direction: rtl;
          }
          .hero {
            border-radius: 10px;
            padding: 24px;
            color: white;
            background: #0f766e;
            margin-bottom: 18px;
          }
          .brand {
            direction: ltr;
            text-align: left;
            font-size: 13px;
            letter-spacing: 0;
            text-transform: uppercase;
            opacity: .85;
          }
          h1, h2, h3, p { margin: 0; }
          h1 {
            margin-top: 10px;
            font-size: 25px;
            line-height: 1.35;
            font-weight: 800;
          }
          .meta {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            color: #d1fae5;
            font-size: 13px;
          }
          .chip {
            border: 1px solid rgba(255,255,255,.32);
            border-radius: 999px;
            padding: 3px 10px;
          }
          .cards {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin: 18px 0;
          }
          .card {
            border: 1px solid #dbe7e5;
            border-radius: 8px;
            padding: 13px;
            background: white;
          }
          .card span {
            display: block;
            color: #64748b;
            font-size: 12px;
          }
          .card strong {
            display: block;
            margin-top: 4px;
            color: #0f766e;
            font-size: 22px;
            direction: ltr;
            text-align: right;
          }
          section {
            margin-top: 18px;
            page-break-inside: avoid;
          }
          .section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 2px solid #0f766e;
            padding-bottom: 7px;
            margin-bottom: 10px;
          }
          .section-title h2 {
            font-size: 17px;
          }
          .section-title p {
            color: #64748b;
            font-size: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border: 1px solid #dbe7e5;
            border-radius: 8px;
            overflow: hidden;
            direction: rtl;
          }
          th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 8px 9px;
            vertical-align: top;
            font-size: 12px;
            text-align: right;
          }
          th {
            color: white;
            background: #0f766e;
            font-weight: 700;
          }
          tr:nth-child(even) td { background: #f0fdfa; }
          .rtl-cell {
            direction: rtl;
            text-align: right;
            unicode-bidi: plaintext;
          }
          .question-block {
            border: 1px solid #dbe7e5;
            border-radius: 9px;
            background: white;
            padding: 12px;
            margin-bottom: 10px;
            page-break-inside: avoid;
          }
          .question-head {
            display: grid;
            grid-template-columns: 34px 1fr;
            gap: 10px;
            align-items: start;
          }
          .question-number {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #0f766e;
            background: #ccfbf1;
            font-weight: 800;
          }
          .question-head h3 {
            font-size: 13px;
          }
          .question-head p {
            color: #64748b;
            font-size: 11px;
          }
          .distribution {
            margin-top: 10px;
            display: grid;
            gap: 7px;
          }
          .option-row {
            display: grid;
            grid-template-columns: minmax(140px, 28%) 1fr 86px;
            gap: 9px;
            align-items: center;
          }
          .option-label {
            font-size: 12px;
            color: #334155;
            direction: rtl;
            text-align: right;
            unicode-bidi: plaintext;
          }
          .bar-track {
            height: 9px;
            border-radius: 999px;
            overflow: hidden;
            background: #e2e8f0;
          }
          .bar-fill {
            height: 100%;
            border-radius: 999px;
            background: #14b8a6;
          }
          .option-count {
            direction: ltr;
            text-align: left;
            color: #475569;
            font-size: 11px;
          }
          .tag-summary {
            margin-top: 9px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            color: #64748b;
            font-size: 11px;
            direction: ltr;
          }
          .muted, .empty {
            color: #64748b;
            font-size: 12px;
          }
          .empty {
            text-align: center;
            padding: 18px;
          }
          @media print {
            body { background: white; }
            .report { padding: 0; max-width: none; }
            .hero, .card, .question-block, table { box-shadow: none; }
            section { break-inside: avoid; }
            .question-block { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <main class="report">
          <header class="hero">
            <div class="brand">Ponts per la Pau</div>
            <h1 dir="auto">${escapeHtml(survey.title)}</h1>
            <div class="meta">
              ${survey.period ? `<span class="chip">${escapeHtml(survey.period)}</span>` : ''}
              ${survey.survey_date ? `<span class="chip">تاریخ سروی / Survey date: ${escapeHtml(formatSurveyDate(survey.survey_date))}</span>` : ''}
              <span class="chip">وضعیت / Status: ${escapeHtml(survey.status)}</span>
              <span class="chip">ساخته شد / Generated: ${escapeHtml(new Date().toLocaleString())}</span>
            </div>
          </header>

          <div class="cards">
            <div class="card"><span>مجموع پاسخ‌دهندگان / Total respondents</span><strong>${escapeHtml(totalRespondents)}</strong></div>
            <div class="card"><span>شعبه‌های دارای معلومات / Branches with data</span><strong>${escapeHtml(`${submittedBranches} / ${results.length}`)}</strong></div>
            <div class="card"><span>شاگردان / کارمندان هدف</span><strong>${escapeHtml(`${targetStudents} / ${targetStaff}`)}</strong></div>
            <div class="card"><span>${hasSentimentAnalytics ? 'رضایت برچسب‌خورده / Tagged satisfaction' : 'جواب‌های ثبت‌شده / Recorded answers'}</span><strong>${escapeHtml(hasSentimentAnalytics ? pct(avgSatisfaction) : recordedAnswerTotal)}</strong></div>
          </div>

          <section>
            <div class="section-title">
              <h2>خلاصه شعبه‌ها / Branch summary</h2>
              <p>تعداد پاسخ‌دهندگان و جواب‌های فردی به تفکیک شعبه</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>شعبه / Branch</th>
                  <th>پاسخ‌دهندگان</th>
                  <th>جواب‌های فردی</th>
                  <th>وضعیت</th>
                  ${hasSentimentAnalytics ? '<th>رضایت برچسب‌خورده</th>' : ''}
                </tr>
              </thead>
              <tbody>${branchRows || `<tr><td colspan="${branchEmptyColspan}" class="empty">هنوز نتیجه‌ای از شعبه‌ها ثبت نشده است.</td></tr>`}</tbody>
            </table>
          </section>

          <section>
            <div class="section-title">
              <h2>نتایج سوال‌ها / Question results</h2>
              <p>تقسیم‌بندی جواب‌ها برای هر سوال سروی</p>
            </div>
            ${questionRows || '<p class="empty">هیچ سوالی در این سروی پیدا نشد.</p>'}
          </section>

          <section>
            <div class="section-title">
              <h2>متن اصلی سروی (دری) / Dari questionnaire</h2>
              <p>سوال‌ها و گزینه‌های جواب به همان زبان اصلی</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>بخش / Section</th>
                  <th>نوع جواب / Type</th>
                  <th>سوال (دری)</th>
                  <th>گزینه‌های جواب (دری)</th>
                </tr>
              </thead>
              <tbody>${questionnaireRows}</tbody>
            </table>
          </section>

        </main>
      </body>
    </html>`;

  await downloadSurveyReportPDF(filename, html);
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
  const taggedAggregates = aggregates.filter((qa) => qa.question.sentiment_enabled);
  const taggedQuestionIds = new Set(taggedAggregates.map((qa) => qa.question.id));
  const hasSentimentAnalytics = taggedAggregates.length > 0;
  const recordedAnswerTotal = aggregates.reduce((sum, qa) => sum + qa.responseTotal, 0);
  const avgSatisfaction = taggedAggregates.length > 0
    ? taggedAggregates.reduce((sum, q) => sum + q.positiveRate, 0) / taggedAggregates.length
    : 0;

  type ExportCell = string | number;
  type ExportRow = Record<string, ExportCell>;
  const targetGroupLabel = {
    students: 'شاگردان / Students',
    staff: 'کارمندان / Staff',
    students_staff: 'شاگردان و کارمندان / Students and staff',
  }[survey.respondent_type ?? 'students_staff'];
  const answerDistributionText = (qa: ReturnType<typeof surveyQuestionAggregates>[number]) => {
    const optionLines = qa.optionCounts.map((option) => `${option.label}: ${option.count}`).join('\n');
    const textLine = qa.textAnswerTotal > 0 ? `${qa.textAnswerTotal} written/date/time answers` : '';
    return [optionLines, textLine].filter(Boolean).join('\n');
  };

  const addSheet = (
    name: string,
    rows: ExportRow[],
    options: {
      rtl?: boolean;
      rtlColumns?: string[];
      widths?: Record<string, number>;
      emptyMessage?: string;
      landscape?: boolean;
    } = {},
  ) => {
    const safeRows = rows.length > 0 ? rows : [{ Notice: options.emptyMessage ?? 'No data yet' }];
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1, rightToLeft: options.rtl }],
    } as any);
    const headers = Object.keys(safeRows[0]);
    sheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: options.widths?.[header] ?? Math.max(14, Math.min(55, header.length + 6)),
    }));
    safeRows.forEach((row) => sheet.addRow(row));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    headerRow.height = 24;
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: safeRows.length + 1, column: headers.length },
    };
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const header = headers[columnNumber - 1] ?? '';
        const isRtl = Boolean(options.rtl || options.rtlColumns?.includes(header));
        (cell as any).alignment = {
          horizontal: isRtl ? 'right' : 'left',
          vertical: 'top',
          wrapText: true,
          readingOrder: isRtl ? 'rtl' : 'ltr',
        };
        (cell as any).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });
    headerRow.eachCell((cell) => {
      (cell as any).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    sheet.columns.forEach((column, index) => {
      const header = headers[index] ?? '';
      let max = header.length;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const longestLine = String(cell.value ?? '')
          .split('\n')
          .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
        max = Math.max(max, longestLine);
      });
      column.width = options.widths?.[header] ?? Math.max(12, Math.min(70, max + 2));
    });
    (sheet as any).pageSetup = {
      orientation: options.landscape ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    return sheet;
  };

  addSheet('Summary', [
    { Metric: 'عنوان سروی / Survey title', Value: survey.title },
    { Metric: 'دوره / Period', Value: survey.period ?? '' },
    { Metric: 'تاریخ سروی / Survey date', Value: formatSurveyDate(survey.survey_date) },
    { Metric: 'وضعیت / Status', Value: survey.status },
    { Metric: 'گروه هدف / Target group', Value: targetGroupLabel },
    { Metric: 'شاگردان هدف / Target students', Value: targetStudents },
    { Metric: 'کارمندان هدف / Target staff', Value: targetStaff },
    { Metric: 'مجموع افراد هدف / Target total', Value: survey.respondents.length },
    { Metric: 'مجموع پاسخ‌دهندگان / Total respondents', Value: totalRespondents },
    { Metric: 'شعبه‌های ثبت‌شده / Submitted branches', Value: submittedBranches },
    { Metric: 'شعبه‌های دارای معلومات / Branches with data', Value: results.length },
    { Metric: 'جواب‌های ثبت‌شده / Recorded answers', Value: recordedAnswerTotal },
    ...(hasSentimentAnalytics ? [{ Metric: 'رضایت برچسب‌خورده / Tagged satisfaction', Value: pct(avgSatisfaction) }] : []),
  ], {
    rtl: true,
    rtlColumns: ['Metric', 'Value'],
    widths: { Metric: 36, Value: 62 },
  });

  addSheet('Branch Results', results.map((branch) => {
    const taggedResults = branch.questionResults.filter((question) => taggedQuestionIds.has(question.questionId) && question.total > 0);
    const avg = taggedResults.length > 0
      ? taggedResults.reduce((sum, q) => sum + q.positiveRate, 0) / taggedResults.length
      : 0;
    return {
      'شعبه / Branch': branch.branchName,
      'پاسخ‌دهندگان / Respondents': branch.totalRespondents,
      'جواب‌های فردی / Individual answers': branch.individualResponses.length,
      'وضعیت / Status': branch.submitted ? 'ثبت شده / Submitted' : 'بدون معلومات / No data',
      ...(hasSentimentAnalytics ? { 'رضایت برچسب‌خورده / Tagged satisfaction': pct(avg) } : {}),
    };
  }), {
    rtl: true,
    rtlColumns: ['شعبه / Branch', 'وضعیت / Status'],
    widths: {
      'شعبه / Branch': 28,
      'پاسخ‌دهندگان / Respondents': 20,
      'جواب‌های فردی / Individual answers': 22,
      'وضعیت / Status': 24,
      'رضایت برچسب‌خورده / Tagged satisfaction': 26,
    },
    emptyMessage: 'No branch results yet',
  });

  addSheet('Question Results', aggregates.map((qa, index) => {
    const base: Record<string, string | number> = {
      '#': index + 1,
      'بخش / Section': sectionTitleForQuestion(survey, qa.question.section_id),
      'نوع جواب / Type': questionTypeLabel(qa.question.question_type),
      'سوال (دری) / Question': qa.question.question_text,
      'پاسخ‌ها / Responses': qa.responseTotal,
      'تقسیم جواب‌ها / Answer distribution': answerDistributionText(qa),
    };
    if (!hasSentimentAnalytics) return base;
    return {
      ...base,
      'Positive tag': qa.question.sentiment_enabled ? qa.positiveTotal : '',
      'Positive %': qa.question.sentiment_enabled ? pct(qa.positiveRate) : '',
      'Neutral tag': qa.question.sentiment_enabled ? qa.neutralTotal : '',
      'Neutral %': qa.question.sentiment_enabled ? pct(qa.neutralRate) : '',
      'Negative tag': qa.question.sentiment_enabled ? qa.negativeTotal : '',
      'Negative %': qa.question.sentiment_enabled ? pct(qa.negativeRate) : '',
    };
  }), {
    rtl: true,
    rtlColumns: ['بخش / Section', 'سوال (دری) / Question', 'تقسیم جواب‌ها / Answer distribution'],
    widths: {
      '#': 8,
      'بخش / Section': 24,
      'نوع جواب / Type': 18,
      'سوال (دری) / Question': 56,
      'پاسخ‌ها / Responses': 16,
      'تقسیم جواب‌ها / Answer distribution': 52,
    },
    landscape: true,
    emptyMessage: 'No questions found',
  });

  addSheet('Questionnaire Dari', survey.questions.map((question, index) => ({
    '#': index + 1,
    'بخش / Section': sectionTitleForQuestion(survey, question.section_id),
    'نوع جواب / Type': questionTypeLabel(question.question_type),
    'سوال (دری)': question.question_text,
    'گزینه‌های جواب (دری)': optionsForQuestion(survey, question.id).map((option) => option.label).join('\n'),
  })), {
    rtl: true,
    rtlColumns: ['بخش / Section', 'سوال (دری)', 'گزینه‌های جواب (دری)'],
    widths: {
      '#': 8,
      'بخش / Section': 24,
      'نوع جواب / Type': 18,
      'سوال (دری)': 58,
      'گزینه‌های جواب (دری)': 46,
    },
    landscape: true,
    emptyMessage: 'No questionnaire questions found',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `survey_results_${safeFilePart(survey.title)}_${today()}.xlsx`,
  );
}

export async function exportSurveyIndividualPDF(
  survey: SurveyFull,
  results: BranchResult[],
  target: SurveyIndividualExportTarget,
): Promise<void> {
  const answerRows = individualAnswerRowsForExport(survey, results, target);
  const answeredCount = answerRows.filter((row) => row.answered).length;
  const answerRecordCount = answerRows.reduce((sum, row) => sum + row.answers.length, 0);
  const filename = `survey_response_${safeFilePart(target.respondentName)}_${safeFilePart(survey.title)}_${today()}.pdf`;
  const answerTableRows = answerRows.map((row) => `
    <tr class="${row.answered ? '' : 'muted-row'}">
      <td>${escapeHtml(row.index)}</td>
      <td dir="auto">${escapeHtml(row.section)}</td>
      <td>${escapeHtml(questionTypeLabel(row.question.question_type))}</td>
      <td class="rtl-cell" dir="rtl">${escapeHtml(row.question.question_text)}</td>
      <td class="rtl-cell" dir="rtl">${escapeHtml(row.answerText)}</td>
      <td>${escapeHtml(row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '')}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(filename)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #0f172a;
            background: #ffffff;
            font-family: Tahoma, "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif;
            line-height: 1.65;
          }
          .report {
            max-width: 1100px;
            margin: 0 auto;
            padding: 28px;
            direction: rtl;
          }
          .hero {
            border-radius: 10px;
            padding: 24px;
            color: white;
            background: #0f766e;
            margin-bottom: 18px;
          }
          .brand {
            direction: ltr;
            text-align: left;
            font-size: 13px;
            letter-spacing: 0;
            text-transform: uppercase;
            opacity: .85;
          }
          h1, h2, p { margin: 0; }
          h1 {
            margin-top: 10px;
            font-size: 25px;
            line-height: 1.35;
            font-weight: 800;
          }
          .meta {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            color: #d1fae5;
            font-size: 13px;
          }
          .chip {
            border: 1px solid rgba(255,255,255,.32);
            border-radius: 999px;
            padding: 3px 10px;
          }
          .cards {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin: 18px 0;
          }
          .card {
            border: 1px solid #dbe7e5;
            border-radius: 8px;
            padding: 13px;
            background: white;
          }
          .card span {
            display: block;
            color: #64748b;
            font-size: 12px;
          }
          .card strong {
            display: block;
            margin-top: 4px;
            color: #0f766e;
            font-size: 19px;
          }
          .section-title {
            border-bottom: 2px solid #0f766e;
            padding-bottom: 7px;
            margin: 18px 0 10px;
          }
          .section-title h2 {
            font-size: 17px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border: 1px solid #dbe7e5;
            border-radius: 8px;
            overflow: hidden;
            direction: rtl;
          }
          th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 8px 9px;
            vertical-align: top;
            font-size: 12px;
            text-align: right;
          }
          th {
            color: white;
            background: #0f766e;
            font-weight: 700;
          }
          tr:nth-child(even) td { background: #f0fdfa; }
          .muted-row td { color: #94a3b8; }
          .rtl-cell {
            direction: rtl;
            text-align: right;
            unicode-bidi: plaintext;
          }
        </style>
      </head>
      <body>
        <main class="report">
          <header class="hero">
            <div class="brand">Ponts per la Pau</div>
            <h1 dir="auto">${escapeHtml(survey.title)}</h1>
            <div class="meta">
              <span class="chip">پاسخ فردی / Individual response</span>
              ${survey.period ? `<span class="chip">${escapeHtml(survey.period)}</span>` : ''}
              ${survey.survey_date ? `<span class="chip">تاریخ سروی / Survey date: ${escapeHtml(formatSurveyDate(survey.survey_date))}</span>` : ''}
              <span class="chip">ساخته شد / Generated: ${escapeHtml(new Date().toLocaleString())}</span>
            </div>
          </header>

          <div class="cards">
            <div class="card"><span>نام / Respondent</span><strong dir="auto">${escapeHtml(target.respondentName)}</strong></div>
            <div class="card"><span>نوع / Type</span><strong>${escapeHtml(respondentKindLabel(target.respondentType))}</strong></div>
            <div class="card"><span>شعبه / Branch</span><strong dir="auto">${escapeHtml(target.branchName)}</strong></div>
            <div class="card"><span>سوال‌های پاسخ‌شده</span><strong>${escapeHtml(`${answeredCount} / ${survey.questions.length}`)}</strong></div>
          </div>

          <section>
            <div class="section-title">
              <h2>جواب‌های پاسخ‌دهنده / Respondent answers</h2>
              <p>${escapeHtml(answerRecordCount)} saved answer record${answerRecordCount === 1 ? '' : 's'}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>بخش / Section</th>
                  <th>نوع جواب / Type</th>
                  <th>سوال (دری)</th>
                  <th>جواب (دری)</th>
                  <th>آخرین تغییر</th>
                </tr>
              </thead>
              <tbody>${answerTableRows}</tbody>
            </table>
          </section>
        </main>
      </body>
    </html>`;

  await downloadSurveyReportPDF(filename, html);
}

export async function exportSurveyIndividualExcel(
  survey: SurveyFull,
  results: BranchResult[],
  target: SurveyIndividualExportTarget,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ponts per la Pau';
  workbook.created = new Date();
  const answerRows = individualAnswerRowsForExport(survey, results, target);
  const answeredCount = answerRows.filter((row) => row.answered).length;

  type ExportCell = string | number;
  type ExportRow = Record<string, ExportCell>;
  const addSheet = (
    name: string,
    rows: ExportRow[],
    rtlColumns: string[] = [],
    widths: Record<string, number> = {},
  ) => {
    const safeRows = rows.length > 0 ? rows : [{ Notice: 'No data yet' }];
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }] } as any);
    const headers = Object.keys(safeRows[0]);
    sheet.columns = headers.map((header) => ({ header, key: header, width: widths[header] ?? Math.max(14, header.length + 6) }));
    safeRows.forEach((row) => sheet.addRow(row));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: safeRows.length + 1, column: headers.length },
    };
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const header = headers[columnNumber - 1] ?? '';
        const isRtl = rtlColumns.includes(header);
        (cell as any).alignment = {
          horizontal: isRtl ? 'right' : 'left',
          vertical: 'top',
          wrapText: true,
          readingOrder: isRtl ? 'rtl' : 'ltr',
        };
        (cell as any).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });
    headerRow.eachCell((cell) => {
      (cell as any).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    return sheet;
  };

  addSheet('Summary', [
    { Metric: 'عنوان سروی / Survey title', Value: survey.title },
    { Metric: 'نام / Respondent', Value: target.respondentName },
    { Metric: 'نوع / Type', Value: respondentKindLabel(target.respondentType) },
    { Metric: 'شعبه / Branch', Value: target.branchName },
    { Metric: 'دوره / Period', Value: survey.period ?? '' },
    { Metric: 'تاریخ سروی / Survey date', Value: formatSurveyDate(survey.survey_date) },
    { Metric: 'سوال‌های پاسخ‌شده / Answered questions', Value: `${answeredCount} / ${survey.questions.length}` },
  ], ['Metric', 'Value'], { Metric: 34, Value: 58 });

  addSheet('Answers', answerRows.map((row) => ({
    '#': row.index,
    'بخش / Section': row.section,
    'نوع جواب / Type': questionTypeLabel(row.question.question_type),
    'سوال (دری) / Question': row.question.question_text,
    'جواب (دری) / Answer': row.answerText,
    'گزینه‌ها / Options': optionsForQuestion(survey, row.question.id).map((option) => option.label).join('\n'),
    'آخرین تغییر / Updated': row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '',
  })), [
    'بخش / Section',
    'سوال (دری) / Question',
    'جواب (دری) / Answer',
    'گزینه‌ها / Options',
  ], {
    '#': 8,
    'بخش / Section': 24,
    'نوع جواب / Type': 20,
    'سوال (دری) / Question': 58,
    'جواب (دری) / Answer': 44,
    'گزینه‌ها / Options': 40,
    'آخرین تغییر / Updated': 24,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `survey_response_${safeFilePart(target.respondentName)}_${safeFilePart(survey.title)}_${today()}.xlsx`,
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
