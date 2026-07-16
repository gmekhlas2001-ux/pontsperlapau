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
import { optionsForQuestion, type BranchResult, type SurveyFull, type SurveyIndividualResponse, type SurveyRespondentKind, type SurveyLanguage } from './surveyService';

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Format today as YYYY-MM-DD for filenames. */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function safeFilePart(value: string): string {
  // Keep Unicode letters/digits (so Dari/Arabic titles survive) and collapse the
  // rest to underscores. Strip characters that are illegal in filenames.
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'export';
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

// ─── Survey report localization ──────────────────────────────────────────────
// Survey PDF/Excel reports are generated entirely in the survey's own language.

interface SurveyStrings {
  surveyDate: string; status: string; generated: string; individualResponse: string;
  totalRespondents: string; branchesWithData: string; targetStudentsStaff: string;
  taggedSatisfaction: string; recordedAnswers: string;
  branchSummary: string; branchSummarySub: string;
  colBranch: string; colRespondents: string; colIndividual: string; colStatus: string; colTagged: string;
  submitted: string; noData: string;
  questionResults: string; questionResultsSub: string;
  responses: string; positive: string; neutral: string; negative: string;
  questionnaire: string; questionnaireSub: string;
  colNum: string; colSection: string; colType: string; colQuestion: string; colOptions: string; colAnswer: string; colUpdated: string;
  emptyBranches: string; emptyQuestions: string;
  noOptionAnswers: string; writtenAnswers: string; useIndividual: string; notAnswered: string;
  respondent: string; respondentType: string; branch: string; answeredQuestions: string;
  respondentAnswers: string; savedRecords: string;
  surveyTitle: string; period: string; targetGroup: string; targetStudents: string; targetStaff: string; targetTotal: string; submittedBranches: string;
  statusDraft: string; statusActive: string; statusClosed: string;
  groupStudents: string; groupStaff: string; groupBoth: string;
  kindStudent: string; kindStaff: string; kindManual: string;
  sheetSummary: string; sheetBranches: string; sheetQuestions: string; sheetQuestionnaire: string; sheetAnswers: string; noDataYet: string;
}

interface SurveyDashboardStrings {
  sheet: string;
  overview: string;
  branchBars: string;
  answerDistribution: string;
  metric: string;
  value: string;
  bar: string;
  option: string;
  percent: string;
}

const SURVEY_DASHBOARD_T: Record<SurveyLanguage, SurveyDashboardStrings> = {
  en: {
    sheet: 'Dashboard',
    overview: 'Overview',
    branchBars: 'Branch response bars',
    answerDistribution: 'Question answer distribution',
    metric: 'Metric',
    value: 'Value',
    bar: 'Bar',
    option: 'Answer option',
    percent: 'Percent',
  },
  es: {
    sheet: 'Panel',
    overview: 'Resumen visual',
    branchBars: 'Barras de respuesta por sucursal',
    answerDistribution: 'Distribución de respuestas por pregunta',
    metric: 'Métrica',
    value: 'Valor',
    bar: 'Barra',
    option: 'Opción de respuesta',
    percent: 'Porcentaje',
  },
  ca: {
    sheet: 'Panell',
    overview: 'Resum visual',
    branchBars: 'Barres de resposta per sucursal',
    answerDistribution: 'Distribució de respostes per pregunta',
    metric: 'Mètrica',
    value: 'Valor',
    bar: 'Barra',
    option: 'Opció de resposta',
    percent: 'Percentatge',
  },
  fa: {
    sheet: 'نمودارها',
    overview: 'خلاصه تصویری',
    branchBars: 'نمودار پاسخ‌ها به تفکیک شعبه',
    answerDistribution: 'تقسیم‌بندی جواب‌ها برای هر سوال',
    metric: 'شاخص',
    value: 'مقدار',
    bar: 'نمودار',
    option: 'گزینه جواب',
    percent: 'درصد',
  },
};

const SURVEY_T: Record<SurveyLanguage, SurveyStrings> = {
  en: {
    surveyDate: 'Survey date', status: 'Status', generated: 'Generated', individualResponse: 'Individual response',
    totalRespondents: 'Total respondents', branchesWithData: 'Branches with data', targetStudentsStaff: 'Target students / staff',
    taggedSatisfaction: 'Tagged satisfaction', recordedAnswers: 'Recorded answers',
    branchSummary: 'Branch summary', branchSummarySub: 'Respondents and individual answers by branch',
    colBranch: 'Branch', colRespondents: 'Respondents', colIndividual: 'Individual answers', colStatus: 'Status', colTagged: 'Tagged satisfaction',
    submitted: 'Submitted', noData: 'No data',
    questionResults: 'Question results', questionResultsSub: 'Answer distribution for each survey question',
    responses: 'responses', positive: 'Positive', neutral: 'Neutral', negative: 'Negative',
    questionnaire: 'Questionnaire', questionnaireSub: 'Questions and answer options',
    colNum: '#', colSection: 'Section', colType: 'Type', colQuestion: 'Question', colOptions: 'Answer options', colAnswer: 'Answer', colUpdated: 'Updated',
    emptyBranches: 'No branch results have been recorded yet.', emptyQuestions: 'No questions were found in this survey.',
    noOptionAnswers: 'No option answers have been submitted yet.', writtenAnswers: 'written/date/time answers', useIndividual: 'Use the individual export to review exact answers.', notAnswered: 'Not answered',
    respondent: 'Respondent', respondentType: 'Type', branch: 'Branch', answeredQuestions: 'Answered questions',
    respondentAnswers: 'Respondent answers', savedRecords: 'saved answer records',
    surveyTitle: 'Survey title', period: 'Period', targetGroup: 'Target group', targetStudents: 'Target students', targetStaff: 'Target staff', targetTotal: 'Target total', submittedBranches: 'Submitted branches',
    statusDraft: 'Draft', statusActive: 'Active', statusClosed: 'Closed',
    groupStudents: 'Students', groupStaff: 'Staff', groupBoth: 'Students and staff',
    kindStudent: 'Student', kindStaff: 'Staff', kindManual: 'Manual',
    sheetSummary: 'Summary', sheetBranches: 'Branch Results', sheetQuestions: 'Question Results', sheetQuestionnaire: 'Questionnaire', sheetAnswers: 'Answers', noDataYet: 'No data yet',
  },
  es: {
    surveyDate: 'Fecha de la encuesta', status: 'Estado', generated: 'Generado', individualResponse: 'Respuesta individual',
    totalRespondents: 'Total de encuestados', branchesWithData: 'Sucursales con datos', targetStudentsStaff: 'Alumnos / personal objetivo',
    taggedSatisfaction: 'Satisfacción etiquetada', recordedAnswers: 'Respuestas registradas',
    branchSummary: 'Resumen por sucursal', branchSummarySub: 'Encuestados y respuestas individuales por sucursal',
    colBranch: 'Sucursal', colRespondents: 'Encuestados', colIndividual: 'Respuestas individuales', colStatus: 'Estado', colTagged: 'Satisfacción etiquetada',
    submitted: 'Enviado', noData: 'Sin datos',
    questionResults: 'Resultados por pregunta', questionResultsSub: 'Distribución de respuestas por pregunta',
    responses: 'respuestas', positive: 'Positivo', neutral: 'Neutral', negative: 'Negativo',
    questionnaire: 'Cuestionario', questionnaireSub: 'Preguntas y opciones de respuesta',
    colNum: '#', colSection: 'Sección', colType: 'Tipo', colQuestion: 'Pregunta', colOptions: 'Opciones de respuesta', colAnswer: 'Respuesta', colUpdated: 'Actualizado',
    emptyBranches: 'Todavía no se han registrado resultados de sucursales.', emptyQuestions: 'No se encontraron preguntas en esta encuesta.',
    noOptionAnswers: 'Aún no se han enviado respuestas de opción.', writtenAnswers: 'respuestas de texto/fecha/hora', useIndividual: 'Use la exportación individual para ver las respuestas exactas.', notAnswered: 'Sin responder',
    respondent: 'Encuestado', respondentType: 'Tipo', branch: 'Sucursal', answeredQuestions: 'Preguntas respondidas',
    respondentAnswers: 'Respuestas del encuestado', savedRecords: 'registros de respuesta guardados',
    surveyTitle: 'Título de la encuesta', period: 'Período', targetGroup: 'Grupo objetivo', targetStudents: 'Alumnos objetivo', targetStaff: 'Personal objetivo', targetTotal: 'Total objetivo', submittedBranches: 'Sucursales enviadas',
    statusDraft: 'Borrador', statusActive: 'Activa', statusClosed: 'Cerrada',
    groupStudents: 'Alumnos', groupStaff: 'Personal', groupBoth: 'Alumnos y personal',
    kindStudent: 'Alumno', kindStaff: 'Personal', kindManual: 'Manual',
    sheetSummary: 'Resumen', sheetBranches: 'Resultados sucursal', sheetQuestions: 'Resultados pregunta', sheetQuestionnaire: 'Cuestionario', sheetAnswers: 'Respuestas', noDataYet: 'Sin datos',
  },
  ca: {
    surveyDate: 'Data de l\'enquesta', status: 'Estat', generated: 'Generat', individualResponse: 'Resposta individual',
    totalRespondents: 'Total d\'enquestats', branchesWithData: 'Sucursals amb dades', targetStudentsStaff: 'Alumnes / personal objectiu',
    taggedSatisfaction: 'Satisfacció etiquetada', recordedAnswers: 'Respostes registrades',
    branchSummary: 'Resum per sucursal', branchSummarySub: 'Enquestats i respostes individuals per sucursal',
    colBranch: 'Sucursal', colRespondents: 'Enquestats', colIndividual: 'Respostes individuals', colStatus: 'Estat', colTagged: 'Satisfacció etiquetada',
    submitted: 'Enviat', noData: 'Sense dades',
    questionResults: 'Resultats per pregunta', questionResultsSub: 'Distribució de respostes per pregunta',
    responses: 'respostes', positive: 'Positiu', neutral: 'Neutral', negative: 'Negatiu',
    questionnaire: 'Qüestionari', questionnaireSub: 'Preguntes i opcions de resposta',
    colNum: '#', colSection: 'Secció', colType: 'Tipus', colQuestion: 'Pregunta', colOptions: 'Opcions de resposta', colAnswer: 'Resposta', colUpdated: 'Actualitzat',
    emptyBranches: 'Encara no s\'han registrat resultats de sucursals.', emptyQuestions: 'No s\'han trobat preguntes en aquesta enquesta.',
    noOptionAnswers: 'Encara no s\'han enviat respostes d\'opció.', writtenAnswers: 'respostes de text/data/hora', useIndividual: 'Utilitzeu l\'exportació individual per veure les respostes exactes.', notAnswered: 'Sense resposta',
    respondent: 'Enquestat', respondentType: 'Tipus', branch: 'Sucursal', answeredQuestions: 'Preguntes respostes',
    respondentAnswers: 'Respostes de l\'enquestat', savedRecords: 'registres de resposta desats',
    surveyTitle: 'Títol de l\'enquesta', period: 'Període', targetGroup: 'Grup objectiu', targetStudents: 'Alumnes objectiu', targetStaff: 'Personal objectiu', targetTotal: 'Total objectiu', submittedBranches: 'Sucursals enviades',
    statusDraft: 'Esborrany', statusActive: 'Activa', statusClosed: 'Tancada',
    groupStudents: 'Alumnes', groupStaff: 'Personal', groupBoth: 'Alumnes i personal',
    kindStudent: 'Alumne', kindStaff: 'Personal', kindManual: 'Manual',
    sheetSummary: 'Resum', sheetBranches: 'Resultats sucursal', sheetQuestions: 'Resultats pregunta', sheetQuestionnaire: 'Qüestionari', sheetAnswers: 'Respostes', noDataYet: 'Sense dades',
  },
  fa: {
    surveyDate: 'تاریخ سروی', status: 'وضعیت', generated: 'ساخته شد', individualResponse: 'پاسخ فردی',
    totalRespondents: 'مجموع پاسخ‌دهندگان', branchesWithData: 'شعبه‌های دارای معلومات', targetStudentsStaff: 'شاگردان / کارمندان هدف',
    taggedSatisfaction: 'رضایت برچسب‌خورده', recordedAnswers: 'جواب‌های ثبت‌شده',
    branchSummary: 'خلاصه شعبه‌ها', branchSummarySub: 'تعداد پاسخ‌دهندگان و جواب‌های فردی به تفکیک شعبه',
    colBranch: 'شعبه', colRespondents: 'پاسخ‌دهندگان', colIndividual: 'جواب‌های فردی', colStatus: 'وضعیت', colTagged: 'رضایت برچسب‌خورده',
    submitted: 'ثبت شده', noData: 'بدون معلومات',
    questionResults: 'نتایج سوال‌ها', questionResultsSub: 'تقسیم‌بندی جواب‌ها برای هر سوال سروی',
    responses: 'پاسخ', positive: 'مثبت', neutral: 'عادی', negative: 'منفی',
    questionnaire: 'پرسشنامه', questionnaireSub: 'سوال‌ها و گزینه‌های جواب',
    colNum: '#', colSection: 'بخش', colType: 'نوع جواب', colQuestion: 'سوال', colOptions: 'گزینه‌های جواب', colAnswer: 'جواب', colUpdated: 'آخرین تغییر',
    emptyBranches: 'هنوز نتیجه‌ای از شعبه‌ها ثبت نشده است.', emptyQuestions: 'هیچ سوالی در این سروی پیدا نشد.',
    noOptionAnswers: 'هنوز جوابی برای گزینه‌ها ثبت نشده است.', writtenAnswers: 'جواب نوشتاری/تاریخ/زمان', useIndividual: 'برای دیدن جواب‌های دقیق از خروجی فردی استفاده کنید.', notAnswered: 'پاسخ داده نشده',
    respondent: 'پاسخ‌دهنده', respondentType: 'نوع', branch: 'شعبه', answeredQuestions: 'سوال‌های پاسخ‌شده',
    respondentAnswers: 'جواب‌های پاسخ‌دهنده', savedRecords: 'سابقه جواب ثبت‌شده',
    surveyTitle: 'عنوان سروی', period: 'دوره', targetGroup: 'گروه هدف', targetStudents: 'شاگردان هدف', targetStaff: 'کارمندان هدف', targetTotal: 'مجموع افراد هدف', submittedBranches: 'شعبه‌های ثبت‌شده',
    statusDraft: 'پیش‌نویس', statusActive: 'فعال', statusClosed: 'بسته',
    groupStudents: 'شاگردان', groupStaff: 'کارمندان', groupBoth: 'شاگردان و کارمندان',
    kindStudent: 'شاگرد', kindStaff: 'کارمند', kindManual: 'دستی',
    sheetSummary: 'خلاصه', sheetBranches: 'نتایج شعبه', sheetQuestions: 'نتایج سوال', sheetQuestionnaire: 'پرسشنامه', sheetAnswers: 'جواب‌ها', noDataYet: 'بدون معلومات',
  },
};

const QUESTION_TYPE_T: Record<SurveyLanguage, Record<string, string>> = {
  en: {
    short_answer: 'Short answer', paragraph: 'Paragraph', multiple_choice: 'Multiple choice', checkboxes: 'Checkboxes',
    dropdown: 'Dropdown', linear_scale: 'Linear scale', rating: 'Rating', multiple_choice_grid: 'Multiple choice grid',
    checkbox_grid: 'Checkbox grid', date: 'Date', time: 'Time',
  },
  es: {
    short_answer: 'Respuesta corta', paragraph: 'Párrafo', multiple_choice: 'Opción múltiple', checkboxes: 'Casillas',
    dropdown: 'Desplegable', linear_scale: 'Escala lineal', rating: 'Valoración', multiple_choice_grid: 'Cuadrícula de opción múltiple',
    checkbox_grid: 'Cuadrícula de casillas', date: 'Fecha', time: 'Hora',
  },
  ca: {
    short_answer: 'Resposta curta', paragraph: 'Paràgraf', multiple_choice: 'Opció múltiple', checkboxes: 'Caselles',
    dropdown: 'Desplegable', linear_scale: 'Escala lineal', rating: 'Valoració', multiple_choice_grid: 'Graella d\'opció múltiple',
    checkbox_grid: 'Graella de caselles', date: 'Data', time: 'Hora',
  },
  fa: {
    short_answer: 'جواب کوتاه', paragraph: 'پاراگراف', multiple_choice: 'چند گزینه‌ای', checkboxes: 'چک‌باکس',
    dropdown: 'فهرست کشویی', linear_scale: 'مقیاس خطی', rating: 'امتیازدهی', multiple_choice_grid: 'جدول چند گزینه‌ای',
    checkbox_grid: 'جدول چک‌باکس', date: 'تاریخ', time: 'زمان',
  },
};

const REPORT_LOCALE: Record<SurveyLanguage, string> = { en: 'en-GB', es: 'es-ES', ca: 'ca-ES', fa: 'fa-AF' };

function surveyLang(survey: Pick<SurveyFull, 'language'>): SurveyLanguage {
  return survey.language ?? 'fa';
}

function isRtlLang(lang: SurveyLanguage): boolean {
  return lang === 'fa';
}

/** Localized Gregorian date for a YYYY-MM-DD survey date. */
function formatReportDate(lang: SurveyLanguage, date?: string): string {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(REPORT_LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric', calendar: 'gregory' });
}

function reportNow(lang: SurveyLanguage): string {
  return new Date().toLocaleString(REPORT_LOCALE[lang], { calendar: 'gregory' });
}

function reportTimestamp(lang: SurveyLanguage, iso?: string | null): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString(REPORT_LOCALE[lang], { calendar: 'gregory' });
}

function surveyStatusLabel(status: string, lang: SurveyLanguage): string {
  const t = SURVEY_T[lang];
  return status === 'draft' ? t.statusDraft : status === 'active' ? t.statusActive : status === 'closed' ? t.statusClosed : status;
}

function targetGroupLabel(type: string | undefined, lang: SurveyLanguage): string {
  const t = SURVEY_T[lang];
  return type === 'students' ? t.groupStudents : type === 'staff' ? t.groupStaff : t.groupBoth;
}

function questionTypeLabelL(lang: SurveyLanguage, type?: string): string {
  return QUESTION_TYPE_T[lang][type ?? 'multiple_choice'] ?? questionTypeLabel(type);
}

function sectionTitleForQuestion(survey: SurveyFull, sectionId?: string | null): string {
  if (!sectionId) return '';
  return survey.sections.find((section) => section.id === sectionId)?.title ?? '';
}

function respondentKindLabel(kind: SurveyRespondentKind, lang: SurveyLanguage): string {
  const t = SURVEY_T[lang];
  if (kind === 'student') return t.kindStudent;
  if (kind === 'staff') return t.kindStaff;
  return t.kindManual;
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
  lang: SurveyLanguage,
) {
  const sep = isRtlLang(lang) ? '، ' : ', ';
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
      answerText: answers.length > 0 ? answers.join(sep) : SURVEY_T[lang].notAnswered,
      answered: answers.length > 0,
      updatedAt,
    };
  });
}

function buildAnswerDistributionHtml(
  options: { label: string; count: number }[],
  total: number,
  lang: SurveyLanguage,
  textAnswerTotal = 0,
): string {
  const t = SURVEY_T[lang];
  if (options.length === 0) {
    return textAnswerTotal > 0
      ? `<span class="muted">${escapeHtml(textAnswerTotal)} ${escapeHtml(t.writtenAnswers)}. ${escapeHtml(t.useIndividual)}</span>`
      : `<span class="muted">${escapeHtml(t.noOptionAnswers)}</span>`;
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
  iframe.setAttribute('sandbox', 'allow-same-origin');

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

    const scale = Math.min(2, window.devicePixelRatio || 1.5);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const blockGap = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    // Render the report one block at a time and lay the blocks out across pages.
    // This keeps a question, table row, or card from being sliced in half across
    // a page boundary (the old full-page-image approach cut content arbitrarily).
    const blockEls = Array.from(frameDocument.querySelectorAll('.pdf-block')) as HTMLElement[];
    const blocks = blockEls.length > 0 ? blockEls : [reportElement];

    let cursorY = margin;
    let pageStarted = false;

    for (const element of blocks) {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        logging: false,
        scale,
        useCORS: true,
        windowWidth: 1200,
      });
      if (canvas.height === 0 || canvas.width === 0) continue;
      const imgHeight = canvas.height * (contentWidth / canvas.width);

      if (imgHeight > contentHeight) {
        // Block is taller than a full page — slice just this block across pages.
        if (pageStarted) { pdf.addPage(); cursorY = margin; pageStarted = false; }
        const pageSrcHeight = Math.max(1, Math.floor(canvas.width * (contentHeight / contentWidth)));
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        const ctx = sliceCanvas.getContext('2d');
        if (!ctx) throw new Error('Survey PDF canvas could not be prepared');
        for (let srcY = 0; srcY < canvas.height; srcY += pageSrcHeight) {
          const sliceH = Math.min(pageSrcHeight, canvas.height - srcY);
          sliceCanvas.height = sliceH;
          ctx.clearRect(0, 0, sliceCanvas.width, sliceH);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceH);
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (pageStarted) { pdf.addPage(); }
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, sliceH * (contentWidth / canvas.width));
          pageStarted = true;
        }
        continue;
      }

      if (pageStarted && cursorY + imgHeight > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
        pageStarted = false;
      }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, cursorY, contentWidth, imgHeight);
      cursorY += imgHeight + blockGap;
      pageStarted = true;
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

// Native (selectable-text) survey PDF header for Latin-script languages.
function addSurveyNativeHeader(doc: jsPDF, survey: SurveyFull, lang: SurveyLanguage, subtitle: string): number {
  const t = SURVEY_T[lang];
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, pageW, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('Ponts per la Pau', 14, 11);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(survey.title, pageW - 28)[0] ?? '', 14, 18);
  doc.setTextColor(40, 40, 40);

  let y = 32;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(subtitle, 14, y); y += 6;

  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
  const meta = [
    survey.period || '',
    survey.survey_date ? `${t.surveyDate}: ${formatReportDate(lang, survey.survey_date)}` : '',
    `${t.status}: ${surveyStatusLabel(survey.status, lang)}`,
    `${t.generated}: ${reportNow(lang)}`,
  ].filter(Boolean).join('   |   ');
  doc.text(doc.splitTextToSize(meta, pageW - 28), 14, y);
  y += 8;
  doc.setTextColor(40, 40, 40);
  return y;
}

const NATIVE_HEAD_STYLES = { fillColor: [15, 118, 110] as [number, number, number], textColor: 255, fontStyle: 'bold' as const };

function exportSurveyResultsNativePDF(survey: SurveyFull, results: BranchResult[], lang: SurveyLanguage): void {
  const t = SURVEY_T[lang];
  const sep = ', ';
  const aggregates = surveyQuestionAggregates(survey, results);
  const totalRespondents = results.reduce((sum, branch) => sum + branch.totalRespondents, 0);
  const submittedBranches = results.filter((branch) => branch.submitted).length;
  const targetStudents = survey.respondents.filter((r) => r.respondent_type === 'student').length;
  const targetStaff = survey.respondents.filter((r) => r.respondent_type === 'staff').length;
  const taggedIds = new Set(aggregates.filter((qa) => qa.question.sentiment_enabled).map((qa) => qa.question.id));
  const hasSentiment = taggedIds.size > 0;
  const recordedAnswerTotal = aggregates.reduce((sum, qa) => sum + qa.responseTotal, 0);
  const taggedRates = aggregates.filter((qa) => qa.question.sentiment_enabled).map((qa) => qa.positiveRate);
  const avgSatisfaction = taggedRates.length > 0 ? taggedRates.reduce((s, r) => s + r, 0) / taggedRates.length : 0;
  const filename = `survey_results_${safeFilePart(survey.title)}_${today()}.pdf`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = addSurveyNativeHeader(doc, survey, lang, t.branchSummary);

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
  const summary = [
    `${t.totalRespondents}: ${totalRespondents}`,
    `${t.branchesWithData}: ${submittedBranches}/${results.length}`,
    `${t.targetStudentsStaff}: ${targetStudents}/${targetStaff}`,
    hasSentiment ? `${t.taggedSatisfaction}: ${pct(avgSatisfaction)}` : `${t.recordedAnswers}: ${recordedAnswerTotal}`,
  ].join('    ');
  doc.text(doc.splitTextToSize(summary, pageW - 28), 14, y);
  y += 6;
  doc.setTextColor(40, 40, 40);

  autoTable(doc, {
    startY: y,
    head: [[t.colBranch, t.colRespondents, t.colIndividual, t.colStatus, ...(hasSentiment ? [t.colTagged] : [])]],
    body: results.length > 0
      ? results.map((branch) => {
          const tagged = branch.questionResults.filter((q) => taggedIds.has(q.questionId) && q.total > 0);
          const avg = tagged.length > 0 ? tagged.reduce((s, q) => s + q.positiveRate, 0) / tagged.length : 0;
          return [branch.branchName, String(branch.totalRespondents), String(branch.individualResponses.length), branch.submitted ? t.submitted : t.noData, ...(hasSentiment ? [pct(avg)] : [])];
        })
      : [[t.emptyBranches, ...Array(hasSentiment ? 4 : 3).fill('')]],
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: NATIVE_HEAD_STYLES,
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 118, 110);
  doc.text(t.questionResults, 14, y); y += 5;
  doc.setTextColor(40, 40, 40);
  autoTable(doc, {
    startY: y,
    head: [[t.colNum, t.colQuestion, t.colType, t.responses, t.colOptions, ...(hasSentiment ? [t.taggedSatisfaction] : [])]],
    body: aggregates.length > 0
      ? aggregates.map((qa, index) => {
          const dist = qa.optionCounts.length > 0
            ? qa.optionCounts.map((o) => `${o.label}: ${o.count} (${qa.grandTotal > 0 ? Math.round((o.count / qa.grandTotal) * 100) : 0}%)`).join('\n')
            : (qa.textAnswerTotal > 0 ? `${qa.textAnswerTotal} ${t.writtenAnswers}` : '-');
          const sentiment = qa.question.sentiment_enabled ? `${t.positive} ${pct(qa.positiveRate)}\n${t.neutral} ${pct(qa.neutralRate)}\n${t.negative} ${pct(qa.negativeRate)}` : '';
          return [String(index + 1), qa.question.question_text, questionTypeLabelL(lang, qa.question.question_type), String(qa.responseTotal), dist, ...(hasSentiment ? [sentiment] : [])];
        })
      : [[t.emptyQuestions, ...Array(hasSentiment ? 5 : 4).fill('')]],
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: NATIVE_HEAD_STYLES,
    columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 22 }, 3: { cellWidth: 18 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 118, 110);
  doc.text(t.questionnaire, 14, y); y += 5;
  doc.setTextColor(40, 40, 40);
  autoTable(doc, {
    startY: y,
    head: [[t.colNum, t.colSection, t.colType, t.colQuestion, t.colOptions]],
    body: survey.questions.map((question, index) => [
      String(index + 1),
      sectionTitleForQuestion(survey, question.section_id),
      questionTypeLabelL(lang, question.question_type),
      question.question_text,
      optionsForQuestion(survey, question.id).map((o) => o.label).join(sep),
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: NATIVE_HEAD_STYLES,
    columnStyles: { 0: { cellWidth: 8 } },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename);
}

function exportSurveyIndividualNativePDF(survey: SurveyFull, results: BranchResult[], target: SurveyIndividualExportTarget, lang: SurveyLanguage): void {
  const t = SURVEY_T[lang];
  const answerRows = individualAnswerRowsForExport(survey, results, target, lang);
  const answeredCount = answerRows.filter((row) => row.answered).length;
  const filename = `survey_response_${safeFilePart(target.respondentName)}_${safeFilePart(survey.title)}_${today()}.pdf`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = addSurveyNativeHeader(doc, survey, lang, t.individualResponse);

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
  const info = [
    `${t.respondent}: ${target.respondentName}`,
    `${t.respondentType}: ${respondentKindLabel(target.respondentType, lang)}`,
    `${t.branch}: ${target.branchName}`,
    `${t.answeredQuestions}: ${answeredCount}/${survey.questions.length}`,
  ].join('    ');
  doc.text(doc.splitTextToSize(info, pageW - 28), 14, y);
  y += 6;
  doc.setTextColor(40, 40, 40);

  autoTable(doc, {
    startY: y,
    head: [[t.colNum, t.colSection, t.colType, t.colQuestion, t.colAnswer, t.colUpdated]],
    body: answerRows.map((row) => [
      String(row.index),
      row.section,
      questionTypeLabelL(lang, row.question.question_type),
      row.question.question_text,
      row.answerText,
      reportTimestamp(lang, row.updatedAt),
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: NATIVE_HEAD_STYLES,
    columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 20 }, 5: { cellWidth: 26 } },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename);
}

export async function exportSurveyResultsPDF(survey: SurveyFull, results: BranchResult[]): Promise<void> {
  if (!isRtlLang(surveyLang(survey))) {
    exportSurveyResultsNativePDF(survey, results, surveyLang(survey));
    return;
  }
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

  const lang = surveyLang(survey);
  const rtl = isRtlLang(lang);
  const dir = rtl ? 'rtl' : 'ltr';
  const t = SURVEY_T[lang];
  const sep = rtl ? '، ' : ', ';

  const branchRows = results.map((branch) => {
    const taggedResults = branch.questionResults.filter((question) => taggedQuestionIds.has(question.questionId) && question.total > 0);
    const avg = taggedResults.length > 0
      ? taggedResults.reduce((sum, q) => sum + q.positiveRate, 0) / taggedResults.length
      : 0;
    return `
      <tr>
        <td dir="auto">${escapeHtml(branch.branchName)}</td>
        <td>${escapeHtml(branch.totalRespondents)}</td>
        <td>${escapeHtml(branch.individualResponses.length)}</td>
        <td>${escapeHtml(branch.submitted ? t.submitted : t.noData)}</td>
        ${hasSentimentAnalytics ? `<td>${escapeHtml(pct(avg))}</td>` : ''}
      </tr>
    `;
  }).join('');

  const questionRows = aggregates.map((qa, index) => `
    <article class="question-block pdf-block">
      <div class="question-head">
        <span class="question-number">${index + 1}</span>
        <div>
          <h3 dir="auto">${escapeHtml(qa.question.question_text)}</h3>
          <p>${escapeHtml(questionTypeLabelL(lang, qa.question.question_type))} · ${escapeHtml(qa.responseTotal)} ${escapeHtml(t.responses)}</p>
        </div>
      </div>
      <div class="distribution">${buildAnswerDistributionHtml(qa.optionCounts, qa.grandTotal, lang, qa.textAnswerTotal)}</div>
      ${qa.question.sentiment_enabled ? `
        <div class="tag-summary">
          <span>${escapeHtml(t.positive)} ${escapeHtml(pct(qa.positiveRate))}</span>
          <span>${escapeHtml(t.neutral)} ${escapeHtml(pct(qa.neutralRate))}</span>
          <span>${escapeHtml(t.negative)} ${escapeHtml(pct(qa.negativeRate))}</span>
        </div>
      ` : ''}
    </article>
  `).join('');

  const questionnaireRows = survey.questions.map((question, index) => `
    <tr>
      <td>${index + 1}</td>
      <td dir="auto">${escapeHtml(sectionTitleForQuestion(survey, question.section_id))}</td>
      <td>${escapeHtml(questionTypeLabelL(lang, question.question_type))}</td>
      <td class="content-cell" dir="auto">${escapeHtml(question.question_text)}</td>
      <td class="content-cell" dir="auto">${escapeHtml(optionsForQuestion(survey, question.id).map((option) => option.label).join(sep))}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
    <html lang="${lang}" dir="${dir}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(filename)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #0f172a;
            background: #ffffff;
            font-family: Tahoma, "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif;
            line-height: 1.65;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .report {
            max-width: 1100px;
            margin: 0 auto;
            padding: 24px;
            direction: ${dir};
          }
          .pdf-block { margin-bottom: 12px; }
          .hero {
            border-radius: 10px;
            padding: 24px;
            color: white;
            background: #0f766e;
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
            text-align: start;
          }
          .section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 2px solid #0f766e;
            padding-bottom: 7px;
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
            direction: ${dir};
          }
          th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 8px 9px;
            vertical-align: top;
            font-size: 12px;
            text-align: start;
          }
          th {
            color: white;
            background: #0f766e;
            font-weight: 700;
          }
          tr:nth-child(even) td { background: #f0fdfa; }
          .content-cell {
            text-align: start;
            unicode-bidi: plaintext;
          }
          .question-block {
            border: 1px solid #dbe7e5;
            border-radius: 9px;
            background: white;
            padding: 12px;
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
            text-align: start;
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
            text-align: end;
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
          }
          .muted, .empty {
            color: #64748b;
            font-size: 12px;
          }
          .empty {
            text-align: center;
            padding: 18px;
          }
        </style>
      </head>
      <body>
        <main class="report">
          <header class="hero pdf-block">
            <div class="brand">Ponts per la Pau</div>
            <h1 dir="auto">${escapeHtml(survey.title)}</h1>
            <div class="meta">
              ${survey.period ? `<span class="chip">${escapeHtml(survey.period)}</span>` : ''}
              ${survey.survey_date ? `<span class="chip">${escapeHtml(t.surveyDate)}: ${escapeHtml(formatReportDate(lang, survey.survey_date))}</span>` : ''}
              <span class="chip">${escapeHtml(t.status)}: ${escapeHtml(surveyStatusLabel(survey.status, lang))}</span>
              <span class="chip">${escapeHtml(t.generated)}: ${escapeHtml(reportNow(lang))}</span>
            </div>
          </header>

          <div class="cards pdf-block">
            <div class="card"><span>${escapeHtml(t.totalRespondents)}</span><strong>${escapeHtml(totalRespondents)}</strong></div>
            <div class="card"><span>${escapeHtml(t.branchesWithData)}</span><strong>${escapeHtml(`${submittedBranches} / ${results.length}`)}</strong></div>
            <div class="card"><span>${escapeHtml(t.targetStudentsStaff)}</span><strong>${escapeHtml(`${targetStudents} / ${targetStaff}`)}</strong></div>
            <div class="card"><span>${escapeHtml(hasSentimentAnalytics ? t.taggedSatisfaction : t.recordedAnswers)}</span><strong>${escapeHtml(hasSentimentAnalytics ? pct(avgSatisfaction) : recordedAnswerTotal)}</strong></div>
          </div>

          <div class="section-title pdf-block">
            <h2>${escapeHtml(t.branchSummary)}</h2>
            <p>${escapeHtml(t.branchSummarySub)}</p>
          </div>
          <table class="pdf-block">
            <thead>
              <tr>
                <th>${escapeHtml(t.colBranch)}</th>
                <th>${escapeHtml(t.colRespondents)}</th>
                <th>${escapeHtml(t.colIndividual)}</th>
                <th>${escapeHtml(t.colStatus)}</th>
                ${hasSentimentAnalytics ? `<th>${escapeHtml(t.colTagged)}</th>` : ''}
              </tr>
            </thead>
            <tbody>${branchRows || `<tr><td colspan="${branchEmptyColspan}" class="empty">${escapeHtml(t.emptyBranches)}</td></tr>`}</tbody>
          </table>

          <div class="section-title pdf-block">
            <h2>${escapeHtml(t.questionResults)}</h2>
            <p>${escapeHtml(t.questionResultsSub)}</p>
          </div>
          ${questionRows || `<p class="empty pdf-block">${escapeHtml(t.emptyQuestions)}</p>`}

          <div class="section-title pdf-block">
            <h2>${escapeHtml(t.questionnaire)}</h2>
            <p>${escapeHtml(t.questionnaireSub)}</p>
          </div>
          <table class="pdf-block">
            <thead>
              <tr>
                <th>${escapeHtml(t.colNum)}</th>
                <th>${escapeHtml(t.colSection)}</th>
                <th>${escapeHtml(t.colType)}</th>
                <th>${escapeHtml(t.colQuestion)}</th>
                <th>${escapeHtml(t.colOptions)}</th>
              </tr>
            </thead>
            <tbody>${questionnaireRows}</tbody>
          </table>
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

  const lang = surveyLang(survey);
  const rtl = isRtlLang(lang);
  const t = SURVEY_T[lang];

  type ExportCell = string | number;
  type ExportRow = Record<string, ExportCell>;
  const groupLabel = targetGroupLabel(survey.respondent_type, lang);
  const answerDistributionText = (qa: ReturnType<typeof surveyQuestionAggregates>[number]) => {
    const optionLines = qa.optionCounts.map((option) => `${option.label}: ${option.count}`).join('\n');
    const textLine = qa.textAnswerTotal > 0 ? `${qa.textAnswerTotal} ${t.writtenAnswers}` : '';
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

  const makeBar = (count: number, total: number, width = 22): string => {
    if (count <= 0 || total <= 0) return '';
    return '█'.repeat(Math.max(1, Math.round((count / total) * width)));
  };

  const addDashboardSheet = () => {
    const d = SURVEY_DASHBOARD_T[lang];
    const sheet = workbook.addWorksheet(d.sheet, {
      views: [{ state: 'frozen', ySplit: 6, rightToLeft: rtl, showGridLines: false }],
    } as any);

    sheet.columns = [
      { width: 8 },
      { width: 28 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
      { width: 18 },
      { width: 52 },
      { width: 18 },
    ];

    const baseAlignment = {
      horizontal: rtl ? 'right' : 'left',
      vertical: 'middle',
      wrapText: true,
      readingOrder: rtl ? 'rtl' : 'ltr',
    } as const;
    const border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    } as const;
    const styleRow = (rowNumber: number, fill = 'FFFFFFFF') => {
      const row = sheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, (cell) => {
        (cell as any).alignment = baseAlignment;
        (cell as any).border = border;
        (cell as any).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      });
    };
    const styleHeaderRow = (rowNumber: number) => {
      const row = sheet.getRow(rowNumber);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.height = 24;
      row.eachCell({ includeEmpty: true }, (cell) => {
        (cell as any).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        (cell as any).border = border;
        (cell as any).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      });
    };

    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = survey.title;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    (titleCell as any).alignment = { ...baseAlignment, vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:H2');
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value = `${d.overview} • ${t.generated}: ${reportNow(lang)}`;
    subtitleCell.font = { color: { argb: 'FF475569' } };
    (subtitleCell as any).alignment = baseAlignment;
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

    const cards = [
      [t.totalRespondents, totalRespondents],
      [t.submittedBranches, `${submittedBranches} / ${results.length}`],
      [t.recordedAnswers, recordedAnswerTotal],
      [t.targetTotal, survey.respondents.length],
    ];
    cards.forEach(([label, value], index) => {
      const startCol = index * 2 + 1;
      sheet.mergeCells(4, startCol, 4, startCol + 1);
      sheet.mergeCells(5, startCol, 5, startCol + 1);
      const labelCell = sheet.getCell(4, startCol);
      const valueCell = sheet.getCell(5, startCol);
      labelCell.value = label;
      valueCell.value = value;
      labelCell.font = { bold: true, color: { argb: 'FF64748B' } };
      valueCell.font = { bold: true, size: 15, color: { argb: 'FF0F766E' } };
      [labelCell, valueCell].forEach((cell) => {
        (cell as any).alignment = { ...baseAlignment, horizontal: 'center' };
        (cell as any).border = border;
        (cell as any).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
      });
    });

    let rowNumber = 8;
    sheet.mergeCells(rowNumber, 1, rowNumber, 8);
    sheet.getCell(rowNumber, 1).value = d.branchBars;
    sheet.getCell(rowNumber, 1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
    styleRow(rowNumber, 'FFFFFFFF');
    rowNumber += 1;
    sheet.getRow(rowNumber).values = [
      t.colNum,
      t.colBranch,
      t.colRespondents,
      t.colIndividual,
      t.colStatus,
      d.percent,
      d.bar,
      '',
    ];
    styleHeaderRow(rowNumber);
    const maxBranchRespondents = Math.max(1, ...results.map((branch) => branch.totalRespondents));
    results.forEach((branch, index) => {
      rowNumber += 1;
      const pctOfMax = maxBranchRespondents > 0 ? branch.totalRespondents / maxBranchRespondents : 0;
      sheet.getRow(rowNumber).values = [
        index + 1,
        branch.branchName,
        branch.totalRespondents,
        branch.individualResponses.length,
        branch.submitted ? t.submitted : t.noData,
        pct(pctOfMax),
        makeBar(branch.totalRespondents, maxBranchRespondents),
        '',
      ];
      styleRow(rowNumber, index % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC');
      const barCell = sheet.getCell(rowNumber, 7);
      barCell.font = { bold: true, color: { argb: branch.totalRespondents > 0 ? 'FF0F766E' : 'FFCBD5E1' } };
    });

    rowNumber += 3;
    sheet.mergeCells(rowNumber, 1, rowNumber, 8);
    sheet.getCell(rowNumber, 1).value = d.answerDistribution;
    sheet.getCell(rowNumber, 1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
    styleRow(rowNumber, 'FFFFFFFF');
    rowNumber += 1;
    sheet.getRow(rowNumber).values = [
      t.colNum,
      t.colSection,
      t.colQuestion,
      d.option,
      t.responses,
      d.percent,
      d.bar,
      t.colType,
    ];
    styleHeaderRow(rowNumber);

    aggregates.forEach((qa, questionIndex) => {
      const optionRows = qa.optionCounts.length > 0
        ? qa.optionCounts
        : qa.textAnswerTotal > 0
          ? [{ label: t.writtenAnswers, count: qa.textAnswerTotal }]
          : [{ label: t.noData, count: 0 }];
      optionRows.forEach((option, optionIndex) => {
        rowNumber += 1;
        const total = Math.max(qa.responseTotal, 1);
        sheet.getRow(rowNumber).values = [
          optionIndex === 0 ? questionIndex + 1 : '',
          optionIndex === 0 ? sectionTitleForQuestion(survey, qa.question.section_id) : '',
          optionIndex === 0 ? qa.question.question_text : '',
          option.label,
          option.count,
          pct(option.count / total),
          makeBar(option.count, total),
          optionIndex === 0 ? questionTypeLabelL(lang, qa.question.question_type) : '',
        ];
        styleRow(rowNumber, questionIndex % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC');
        const barCell = sheet.getCell(rowNumber, 7);
        barCell.font = { bold: true, color: { argb: option.count > 0 ? 'FF0F766E' : 'FFCBD5E1' } };
      });
    });

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        (cell as any).alignment = {
          ...(cell as any).alignment,
          readingOrder: rtl ? 'rtl' : 'ltr',
          wrapText: true,
        };
      });
    });
    (sheet as any).pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
  };

  addDashboardSheet();

  addSheet(t.sheetSummary, [
    { Metric: t.surveyTitle, Value: survey.title },
    { Metric: t.period, Value: survey.period ?? '' },
    { Metric: t.surveyDate, Value: formatReportDate(lang, survey.survey_date) },
    { Metric: t.status, Value: surveyStatusLabel(survey.status, lang) },
    { Metric: t.targetGroup, Value: groupLabel },
    { Metric: t.targetStudents, Value: targetStudents },
    { Metric: t.targetStaff, Value: targetStaff },
    { Metric: t.targetTotal, Value: survey.respondents.length },
    { Metric: t.totalRespondents, Value: totalRespondents },
    { Metric: t.submittedBranches, Value: submittedBranches },
    { Metric: t.branchesWithData, Value: results.length },
    { Metric: t.recordedAnswers, Value: recordedAnswerTotal },
    ...(hasSentimentAnalytics ? [{ Metric: t.taggedSatisfaction, Value: pct(avgSatisfaction) }] : []),
  ], {
    rtl,
    widths: { Metric: 36, Value: 62 },
  });

  addSheet(t.sheetBranches, results.map((branch) => {
    const taggedResults = branch.questionResults.filter((question) => taggedQuestionIds.has(question.questionId) && question.total > 0);
    const avg = taggedResults.length > 0
      ? taggedResults.reduce((sum, q) => sum + q.positiveRate, 0) / taggedResults.length
      : 0;
    return {
      [t.colBranch]: branch.branchName,
      [t.colRespondents]: branch.totalRespondents,
      [t.colIndividual]: branch.individualResponses.length,
      [t.colStatus]: branch.submitted ? t.submitted : t.noData,
      ...(hasSentimentAnalytics ? { [t.colTagged]: pct(avg) } : {}),
    };
  }), {
    rtl,
    widths: {
      [t.colBranch]: 28,
      [t.colRespondents]: 20,
      [t.colIndividual]: 22,
      [t.colStatus]: 24,
      [t.colTagged]: 26,
    },
    emptyMessage: t.emptyBranches,
  });

  addSheet(t.sheetQuestions, aggregates.map((qa, index) => {
    const base: Record<string, string | number> = {
      [t.colNum]: index + 1,
      [t.colSection]: sectionTitleForQuestion(survey, qa.question.section_id),
      [t.colType]: questionTypeLabelL(lang, qa.question.question_type),
      [t.colQuestion]: qa.question.question_text,
      [t.responses]: qa.responseTotal,
      [t.colOptions]: answerDistributionText(qa),
    };
    if (!hasSentimentAnalytics) return base;
    return {
      ...base,
      [`${t.positive} #`]: qa.question.sentiment_enabled ? qa.positiveTotal : '',
      [`${t.positive} %`]: qa.question.sentiment_enabled ? pct(qa.positiveRate) : '',
      [`${t.neutral} #`]: qa.question.sentiment_enabled ? qa.neutralTotal : '',
      [`${t.neutral} %`]: qa.question.sentiment_enabled ? pct(qa.neutralRate) : '',
      [`${t.negative} #`]: qa.question.sentiment_enabled ? qa.negativeTotal : '',
      [`${t.negative} %`]: qa.question.sentiment_enabled ? pct(qa.negativeRate) : '',
    };
  }), {
    rtl,
    widths: {
      [t.colNum]: 8,
      [t.colSection]: 24,
      [t.colType]: 18,
      [t.colQuestion]: 56,
      [t.responses]: 16,
      [t.colOptions]: 52,
    },
    landscape: true,
    emptyMessage: t.emptyQuestions,
  });

  addSheet(t.sheetQuestionnaire, survey.questions.map((question, index) => ({
    [t.colNum]: index + 1,
    [t.colSection]: sectionTitleForQuestion(survey, question.section_id),
    [t.colType]: questionTypeLabelL(lang, question.question_type),
    [t.colQuestion]: question.question_text,
    [t.colOptions]: optionsForQuestion(survey, question.id).map((option) => option.label).join('\n'),
  })), {
    rtl,
    widths: {
      [t.colNum]: 8,
      [t.colSection]: 24,
      [t.colType]: 18,
      [t.colQuestion]: 58,
      [t.colOptions]: 46,
    },
    landscape: true,
    emptyMessage: t.emptyQuestions,
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
  if (!isRtlLang(surveyLang(survey))) {
    exportSurveyIndividualNativePDF(survey, results, target, surveyLang(survey));
    return;
  }
  const lang = surveyLang(survey);
  const rtl = isRtlLang(lang);
  const dir = rtl ? 'rtl' : 'ltr';
  const t = SURVEY_T[lang];
  const answerRows = individualAnswerRowsForExport(survey, results, target, lang);
  const answeredCount = answerRows.filter((row) => row.answered).length;
  const answerRecordCount = answerRows.reduce((sum, row) => sum + row.answers.length, 0);
  const filename = `survey_response_${safeFilePart(target.respondentName)}_${safeFilePart(survey.title)}_${today()}.pdf`;
  const answerTableRows = answerRows.map((row) => `
    <tr class="${row.answered ? '' : 'muted-row'}">
      <td>${escapeHtml(row.index)}</td>
      <td dir="auto">${escapeHtml(row.section)}</td>
      <td>${escapeHtml(questionTypeLabelL(lang, row.question.question_type))}</td>
      <td class="content-cell" dir="auto">${escapeHtml(row.question.question_text)}</td>
      <td class="content-cell" dir="auto">${escapeHtml(row.answerText)}</td>
      <td>${escapeHtml(reportTimestamp(lang, row.updatedAt))}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
    <html lang="${lang}" dir="${dir}">
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
            padding: 24px;
            direction: ${dir};
          }
          .pdf-block { margin-bottom: 12px; }
          .hero {
            border-radius: 10px;
            padding: 24px;
            color: white;
            background: #0f766e;
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
            direction: ${dir};
          }
          th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 8px 9px;
            vertical-align: top;
            font-size: 12px;
            text-align: start;
          }
          th {
            color: white;
            background: #0f766e;
            font-weight: 700;
          }
          tr:nth-child(even) td { background: #f0fdfa; }
          .muted-row td { color: #94a3b8; }
          .content-cell {
            text-align: start;
            unicode-bidi: plaintext;
          }
        </style>
      </head>
      <body>
        <main class="report">
          <header class="hero pdf-block">
            <div class="brand">Ponts per la Pau</div>
            <h1 dir="auto">${escapeHtml(survey.title)}</h1>
            <div class="meta">
              <span class="chip">${escapeHtml(t.individualResponse)}</span>
              ${survey.period ? `<span class="chip">${escapeHtml(survey.period)}</span>` : ''}
              ${survey.survey_date ? `<span class="chip">${escapeHtml(t.surveyDate)}: ${escapeHtml(formatReportDate(lang, survey.survey_date))}</span>` : ''}
              <span class="chip">${escapeHtml(t.generated)}: ${escapeHtml(reportNow(lang))}</span>
            </div>
          </header>

          <div class="cards pdf-block">
            <div class="card"><span>${escapeHtml(t.respondent)}</span><strong dir="auto">${escapeHtml(target.respondentName)}</strong></div>
            <div class="card"><span>${escapeHtml(t.respondentType)}</span><strong>${escapeHtml(respondentKindLabel(target.respondentType, lang))}</strong></div>
            <div class="card"><span>${escapeHtml(t.branch)}</span><strong dir="auto">${escapeHtml(target.branchName)}</strong></div>
            <div class="card"><span>${escapeHtml(t.answeredQuestions)}</span><strong>${escapeHtml(`${answeredCount} / ${survey.questions.length}`)}</strong></div>
          </div>

          <div class="section-title pdf-block">
            <h2>${escapeHtml(t.respondentAnswers)}</h2>
            <p>${escapeHtml(answerRecordCount)} ${escapeHtml(t.savedRecords)}</p>
          </div>
          <table class="pdf-block">
            <thead>
              <tr>
                <th>${escapeHtml(t.colNum)}</th>
                <th>${escapeHtml(t.colSection)}</th>
                <th>${escapeHtml(t.colType)}</th>
                <th>${escapeHtml(t.colQuestion)}</th>
                <th>${escapeHtml(t.colAnswer)}</th>
                <th>${escapeHtml(t.colUpdated)}</th>
              </tr>
            </thead>
            <tbody>${answerTableRows}</tbody>
          </table>
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
  const lang = surveyLang(survey);
  const rtl = isRtlLang(lang);
  const t = SURVEY_T[lang];
  const answerRows = individualAnswerRowsForExport(survey, results, target, lang);
  const answeredCount = answerRows.filter((row) => row.answered).length;

  type ExportCell = string | number;
  type ExportRow = Record<string, ExportCell>;
  const addSheet = (
    name: string,
    rows: ExportRow[],
    widths: Record<string, number> = {},
  ) => {
    const safeRows = rows.length > 0 ? rows : [{ Notice: t.noDataYet }];
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, rightToLeft: rtl }] } as any);
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
        void columnNumber;
        (cell as any).alignment = {
          horizontal: rtl ? 'right' : 'left',
          vertical: 'top',
          wrapText: true,
          readingOrder: rtl ? 'rtl' : 'ltr',
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

  addSheet(t.sheetSummary, [
    { Metric: t.surveyTitle, Value: survey.title },
    { Metric: t.respondent, Value: target.respondentName },
    { Metric: t.respondentType, Value: respondentKindLabel(target.respondentType, lang) },
    { Metric: t.branch, Value: target.branchName },
    { Metric: t.period, Value: survey.period ?? '' },
    { Metric: t.surveyDate, Value: formatReportDate(lang, survey.survey_date) },
    { Metric: t.answeredQuestions, Value: `${answeredCount} / ${survey.questions.length}` },
  ], { Metric: 34, Value: 58 });

  addSheet(t.sheetAnswers, answerRows.map((row) => ({
    [t.colNum]: row.index,
    [t.colSection]: row.section,
    [t.colType]: questionTypeLabelL(lang, row.question.question_type),
    [t.colQuestion]: row.question.question_text,
    [t.colAnswer]: row.answerText,
    [t.colOptions]: optionsForQuestion(survey, row.question.id).map((option) => option.label).join('\n'),
    [t.colUpdated]: reportTimestamp(lang, row.updatedAt),
  })), {
    [t.colNum]: 8,
    [t.colSection]: 24,
    [t.colType]: 20,
    [t.colQuestion]: 58,
    [t.colAnswer]: 44,
    [t.colOptions]: 40,
    [t.colUpdated]: 24,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `survey_response_${safeFilePart(target.respondentName)}_${safeFilePart(survey.title)}_${today()}.xlsx`,
  );
}

export async function exportSurveyIndividualsExcel(
  survey: SurveyFull,
  results: BranchResult[],
  targets: SurveyIndividualExportTarget[],
): Promise<void> {
  if (targets.length === 0) return;

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ponts per la Pau';
  workbook.created = new Date();
  const lang = surveyLang(survey);
  const rtl = isRtlLang(lang);
  const t = SURVEY_T[lang];

  const usedSheetNames = new Set<string>();
  const uniqueSheetName = (rawName: string, index: number) => {
    const cleaned = rawName.replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim() || `${t.respondent} ${index + 1}`;
    const base = cleaned.slice(0, 31);
    let candidate = base;
    let suffix = 2;
    while (usedSheetNames.has(candidate.toLocaleLowerCase())) {
      const ending = ` (${suffix})`;
      candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
      suffix += 1;
    }
    usedSheetNames.add(candidate.toLocaleLowerCase());
    return candidate;
  };

  const styleHeader = (row: any) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };

  const indexSheet = workbook.addWorksheet(uniqueSheetName(t.sheetSummary, 0), {
    views: [{ state: 'frozen', ySplit: 4, rightToLeft: rtl }],
  } as any);
  indexSheet.mergeCells('A1:E1');
  indexSheet.getCell('A1').value = survey.title;
  indexSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  indexSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  indexSheet.getCell('A1').alignment = { horizontal: rtl ? 'right' : 'left', vertical: 'middle' };
  indexSheet.getRow(1).height = 30;
  indexSheet.getRow(3).values = [t.colNum, t.respondent, t.respondentType, t.branch, t.answeredQuestions];
  styleHeader(indexSheet.getRow(3));
  indexSheet.columns = [
    { width: 8 }, { width: 34 }, { width: 20 }, { width: 30 }, { width: 22 },
  ];

  targets.forEach((target, targetIndex) => {
    const answerRows = individualAnswerRowsForExport(survey, results, target, lang);
    const answeredCount = answerRows.filter((row) => row.answered).length;
    indexSheet.addRow([
      targetIndex + 1,
      target.respondentName,
      respondentKindLabel(target.respondentType, lang),
      target.branchName,
      `${answeredCount} / ${survey.questions.length}`,
    ]);

    const sheet = workbook.addWorksheet(uniqueSheetName(target.respondentName, targetIndex + 1), {
      views: [{ state: 'frozen', ySplit: 8, rightToLeft: rtl }],
    } as any);
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = target.respondentName;
    sheet.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    sheet.getCell('A1').alignment = { horizontal: rtl ? 'right' : 'left', vertical: 'middle' };
    sheet.getRow(1).height = 28;
    const metadataRows = [
      [t.surveyTitle, survey.title],
      [t.branch, target.branchName],
      [t.respondentType, respondentKindLabel(target.respondentType, lang)],
      [t.answeredQuestions, `${answeredCount} / ${survey.questions.length}`],
    ];
    metadataRows.forEach(([label, value], metadataIndex) => {
      const rowNumber = metadataIndex + 3;
      sheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
      sheet.mergeCells(`C${rowNumber}:G${rowNumber}`);
      sheet.getCell(`A${rowNumber}`).value = label;
      sheet.getCell(`A${rowNumber}`).font = { bold: true, color: { argb: 'FF0F766E' } };
      sheet.getCell(`C${rowNumber}`).value = value;
    });
    sheet.getRow(8).values = [t.colNum, t.colSection, t.colType, t.colQuestion, t.colAnswer, t.colOptions, t.colUpdated];
    styleHeader(sheet.getRow(8));
    sheet.columns = [
      { width: 8 }, { width: 24 }, { width: 18 }, { width: 54 },
      { width: 42 }, { width: 38 }, { width: 24 },
    ];
    answerRows.forEach((row) => {
      sheet.addRow([
        row.index,
        row.section,
        questionTypeLabelL(lang, row.question.question_type),
        row.question.question_text,
        row.answerText,
        optionsForQuestion(survey, row.question.id).map((option) => option.label).join('\n'),
        reportTimestamp(lang, row.updatedAt),
      ]);
    });
    sheet.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + answerRows.length, column: 7 } };
    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = {
          horizontal: rtl ? 'right' : 'left',
          vertical: 'top',
          wrapText: true,
          readingOrder: rtl ? 'rtl' : 'ltr',
        } as any;
        if (rowNumber >= 8) {
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        }
      });
    });
    styleHeader(sheet.getRow(8));
  });

  indexSheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + targets.length, column: 5 } };
  indexSheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { horizontal: rtl ? 'right' : 'left', vertical: 'top', wrapText: true };
      if (rowNumber >= 3) cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });
  styleHeader(indexSheet.getRow(3));

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `survey_individual_responses_${safeFilePart(survey.title)}_${today()}.xlsx`,
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
