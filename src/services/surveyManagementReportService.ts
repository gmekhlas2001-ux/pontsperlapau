import jsPDF from 'jspdf';
import type {
  CrossSurveyRespondentMatrixRow,
  UncertainManualNamePair,
} from '@/lib/surveyAnalytics';
import type {
  BranchSurveyDashboard,
  SurveyManagementSurveySummary,
  SurveyQuestionAnalytics,
} from '@/services/surveyManagementService';
import { CORE_SURVEY_CODES } from '@/services/surveyManagementService';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'branch';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(value: string): string {
  if (value === 'not_responded') return 'Not Responded';
  if (value === 'not_assigned') return 'Not Assigned';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusClass(value: string): string {
  if (value === 'completed') return 'status-completed';
  if (value === 'incomplete') return 'status-incomplete';
  if (value === 'not_responded') return 'status-missing';
  return 'status-unassigned';
}

function isMultiResponseQuestion(questionType: string): boolean {
  return questionType.includes('checkbox') || questionType === 'multiple_choice_grid';
}

function questionAnswerSummary(question: SurveyQuestionAnalytics): string {
  const multiResponseQuestion = isMultiResponseQuestion(question.questionType);
  if (question.responseBase === 'mixed') {
    return multiResponseQuestion
      ? `${question.namedAnswerCount} named respondents / ${question.aggregateAnswerCount} aggregate selections`
      : `${question.namedAnswerCount} named / ${question.aggregateAnswerCount} aggregate`;
  }
  if (question.responseBase === 'aggregate' && multiResponseQuestion) {
    return `${question.aggregateAnswerCount} option selections`;
  }
  return `${question.answerCount ?? 'Unknown'} answered`;
}

function questionParticipationCounts(
  question: SurveyQuestionAnalytics,
  survey?: SurveyManagementSurveySummary,
) {
  const hasExplicitNotStartedCount = question.notStartedCount !== undefined;
  const hasNamedRoster = question.responseBase === 'named'
    || question.responseBase === 'mixed'
    || question.responseBase === 'none';
  const notStartedCount = hasExplicitNotStartedCount
    ? question.notStartedCount ?? null
    : hasNamedRoster && survey
      ? Math.max(question.expected - survey.started, 0)
      : null;
  let skippedCount = question.skippedCount;
  if (!hasExplicitNotStartedCount && survey) {
    if (question.responseBase === 'named' || question.responseBase === 'mixed') {
      skippedCount = Math.max(survey.started - question.namedAnswerCount, 0);
    } else if (question.responseBase === 'none') {
      skippedCount = survey.started;
    }
  }
  return { skippedCount, notStartedCount };
}

function coreSurveys(detail: BranchSurveyDashboard): SurveyManagementSurveySummary[] {
  const surveys = new Map<string, SurveyManagementSurveySummary>();
  detail.surveys.forEach((survey) => {
    if (survey.surveyCode && !surveys.has(survey.surveyCode)) surveys.set(survey.surveyCode, survey);
  });
  return Array.from(surveys.values()).sort((left, right) => (
    (left.surveyCode ?? '').localeCompare(right.surveyCode ?? '')
  ));
}

function renderMetric(label: string, value: string | number, note: string): string {
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></div>`;
}

function renderSurveyProgress(survey: SurveyManagementSurveySummary): string {
  const percent = Math.round((survey.completionRate ?? 0) * 100);
  const rate = survey.expected > 0 ? `${percent}%` : 'No target list';
  return `
    <tr>
      <td><strong>${escapeHtml(survey.surveyCode ?? 'Other')}</strong></td>
      <td dir="auto"><strong>${escapeHtml(survey.title)}</strong><div class="subtle">${escapeHtml(survey.questionCount)} questions</div></td>
      <td>${escapeHtml(survey.expected || '-')}</td>
      <td class="good">${escapeHtml(survey.completed)}</td>
      <td class="warn">${escapeHtml(survey.incomplete)}</td>
      <td class="bad">${escapeHtml(survey.notResponded)}</td>
      <td><strong>${escapeHtml(rate)}</strong><div class="progress"><span style="width:${survey.expected > 0 ? percent : 0}%"></span></div></td>
      <td>${escapeHtml(formatDateTime(survey.lastActivity))}</td>
    </tr>`;
}

function renderRespondentRows(
  surveys: SurveyManagementSurveySummary[],
  matrix: CrossSurveyRespondentMatrixRow[],
): string {
  if (matrix.length === 0) {
    return `<tr><td colspan="${surveys.length + 2}" class="empty">No respondent assignments are available for this branch.</td></tr>`;
  }
  return matrix.map((person) => `
    <tr>
      <td dir="auto"><strong>${escapeHtml(person.respondentName)}</strong><div class="subtle">${escapeHtml(person.respondentType)}</div></td>
      ${surveys.map((survey) => {
        const cell = person.surveys[survey.surveyId];
        const value = cell?.status ?? 'not_assigned';
        return `<td><span class="status ${statusClass(value)}">${escapeHtml(statusLabel(value))}</span>${cell?.lastActivity ? `<div class="subtle">${escapeHtml(formatDateTime(cell.lastActivity))}</div>` : ''}</td>`;
      }).join('')}
      <td><strong>${escapeHtml(person.completedCount)}/${escapeHtml(surveys.length)}</strong><div class="subtle">${Math.round(person.completionRate * 100)}%</div></td>
    </tr>`).join('');
}

function renderOptionRows(
  options: SurveyQuestionAnalytics['options'],
  answerCount: number,
  questionType: string,
  title?: string,
  respondentDenominator?: number | null,
  denominatorLabel?: string,
): string {
  const total = options.reduce((sum, option) => sum + option.count, 0);
  const multiResponseQuestion = isMultiResponseQuestion(questionType);
  if (options.length === 0) return '<div class="empty compact">No option answers recorded.</div>';
  const rows = options.map((option) => {
    const denominator = multiResponseQuestion ? respondentDenominator : total || answerCount;
    const percent = denominator && denominator > 0
      ? Math.round((option.count / denominator) * 100)
      : null;
    return `<div class="option-row"><div dir="auto">${escapeHtml(option.label)}</div><div class="bar"><span style="width:${Math.min(percent ?? 0, 100)}%"></span></div><div>${escapeHtml(option.count)} ${percent === null ? '(rate unavailable)' : `(${percent}%)`}</div></div>`;
  }).join('');
  const denominatorNote = multiResponseQuestion
    ? `<div class="subtle">${respondentDenominator && respondentDenominator > 0
      ? `Percentages use ${escapeHtml(denominatorLabel ?? 'respondents')} as the denominator.`
      : 'Percentages are unavailable because no respondent denominator was recorded.'}</div>`
    : '';
  return `${title ? `<h4>${escapeHtml(title)}</h4>` : ''}${rows}${denominatorNote}`;
}

function renderQuestion(
  question: SurveyQuestionAnalytics,
  index: number,
  survey?: SurveyManagementSurveySummary,
): string {
  const multiResponseQuestion = isMultiResponseQuestion(question.questionType);
  const { skippedCount, notStartedCount } = questionParticipationCounts(question, survey);
  const optionRows = question.responseBase === 'mixed'
    ? `<div class="source-grid"><div>${renderOptionRows(question.namedOptions, question.namedAnswerCount, question.questionType, `Named respondents answering (${question.namedAnswerCount})`, question.namedAnswerCount, 'named respondents who answered')}</div><div>${renderOptionRows(question.aggregateOptions, question.aggregateAnswerCount, question.questionType, `${multiResponseQuestion ? 'Aggregate option selections' : 'Aggregate answers'} (${question.aggregateAnswerCount}; reported total ${question.aggregateRespondentTotal ?? 'unknown'})`, question.aggregateRespondentTotal, 'the reported respondent total')}</div></div>`
    : renderOptionRows(
      question.options,
      question.answerCount ?? 0,
      question.questionType,
      undefined,
      question.responseBase === 'aggregate'
        ? question.aggregateRespondentTotal
        : question.responseBase === 'named'
          ? question.answerCount
          : null,
      question.responseBase === 'aggregate'
        ? 'the reported respondent total'
        : 'named respondents who answered',
    );
  const answerSummary = questionAnswerSummary(question);
  const sourceLabel = question.responseBase === 'named'
    ? 'named respondent answers'
    : question.responseBase === 'aggregate'
      ? 'aggregate counts'
      : question.responseBase === 'mixed'
        ? 'mixed sources shown separately'
        : 'no recorded source';
  const writtenResponses = question.textResponses.length > 0
    ? `<div class="written"><h4>Written responses (${question.textResponses.length})</h4>${question.textResponses.map((response) => `
      <blockquote dir="auto"><p>${escapeHtml(response.answer)}</p><footer>${escapeHtml(response.respondentName)} - ${escapeHtml(formatDateTime(response.updatedAt))}</footer></blockquote>`).join('')}</div>`
    : '';
  return `
    <section class="question pdf-block">
      <div class="question-head">
        <div><span class="code">${escapeHtml(question.surveyCode ?? 'Other')}</span> <span class="subtle">Question ${index + 1} · ${escapeHtml(question.questionType.replaceAll('_', ' '))}${question.sectionTitle ? ` · ${escapeHtml(question.sectionTitle)}` : ''}</span></div>
        <div><span class="good">${escapeHtml(answerSummary)}</span> · <span class="bad">${escapeHtml(skippedCount ?? 'Unavailable')} ${question.responseBase === 'mixed' ? 'named skipped after starting' : 'skipped after starting'}</span> · <span class="bad">${escapeHtml(notStartedCount ?? 'Unavailable')} ${question.responseBase === 'mixed' ? 'named roster not started' : 'not started'}</span></div>
      </div>
      <h3 dir="auto">${escapeHtml(question.question)}</h3>
      <div class="subtle">Source: ${escapeHtml(sourceLabel)} · Expected roster: ${escapeHtml(question.expected || 'No target list')} · ${question.required ? 'Required' : 'Optional'}</div>
      <div class="options">${optionRows}</div>
      ${writtenResponses}
    </section>`;
}

function renderQualityNotes(
  detail: BranchSurveyDashboard,
  uncertainPairs: UncertainManualNamePair[],
  missingCoreCodes: readonly string[],
): string {
  const notes: string[] = [];
  if (missingCoreCodes.length > 0) {
    notes.push(`Incomplete reporting cycle: missing core survey ${missingCoreCodes.join(', ')}. Completed-all-six is unavailable.`);
  }
  detail.dataQuality.additionalSurveys.forEach((survey) => {
    notes.push(`Additional survey excluded from the six-survey matrix: ${survey.title}.`);
  });
  detail.dataQuality.duplicateSurveyCodes.forEach((duplicate) => {
    notes.push(`${duplicate.count} surveys map to ${duplicate.surveyCode}; only one is used in the core matrix.`);
  });
  detail.dataQuality.titleBranchMismatches.forEach((mismatch) => {
    notes.push(`${mismatch.surveyCode ?? mismatch.title} title references ${mismatch.referencedBranch}, which differs from the report branch.`);
  });
  detail.dataQuality.orphanedRegisteredAssignments.forEach((assignment) => {
    notes.push(`${assignment.surveyCode ?? assignment.surveyId}: ${assignment.respondentName} is assigned as ${assignment.respondentType}, but the linked source record is missing. Any survey answers remain preserved.`);
  });
  detail.dataQuality.mixedResponseSources.forEach((source) => {
    notes.push(`${source.surveyCode ?? source.title} contains ${source.namedAnswerRows} named answer rows and ${source.positiveAggregateCells} positive aggregate cells. The sources are reported separately and are never summed.`);
    if ((source.invalidAggregateCellCount ?? 0) > 0) {
      notes.push(`${source.surveyCode ?? source.title} has ${source.invalidAggregateCellCount} preserved legacy aggregate ${source.invalidAggregateCellCount === 1 ? 'cell' : 'cells'} above the reported respondent total; review before interpreting percentages.`);
    }
  });
  if (uncertainPairs.length > 0) {
    notes.push(`${uncertainPairs.length} near-match manual identity pair(s) require human review. They were not automatically merged.`);
  }
  notes.push(detail.dataQuality.historicalCompletionRule);
  notes.push(detail.dataQuality.manualIdentityRule);
  return notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');
}

export function buildBranchSurveyManagementReportHtml(
  detail: BranchSurveyDashboard,
  matrix: CrossSurveyRespondentMatrixRow[],
  uncertainPairs: UncertainManualNamePair[],
): string {
  const surveys = coreSurveys(detail);
  const surveyById = new Map(surveys.map((survey) => [survey.surveyId, survey]));
  const missingCoreCodes = CORE_SURVEY_CODES.filter((code) => (
    !surveys.some((survey) => survey.surveyCode === code)
  ));
  const hasCompleteCoreCycle = missingCoreCodes.length === 0
    && surveys.length === CORE_SURVEY_CODES.length;
  const uniqueParticipants = matrix.filter((person) => !person.filters.noResponse).length;
  const completedAll = matrix.filter((person) => person.filters.completedAll).length;
  const expectedAssignments = surveys.reduce((sum, survey) => sum + survey.expected, 0);
  const completedAssignments = surveys.reduce((sum, survey) => sum + survey.completed, 0);
  const incompleteAssignments = surveys.reduce((sum, survey) => sum + survey.incomplete, 0);
  const notRespondedAssignments = surveys.reduce((sum, survey) => sum + survey.notResponded, 0);
  const recordedSubmissions = surveys.reduce((sum, survey) => sum + survey.started, 0);
  const completionRate = expectedAssignments > 0
    ? `${Math.round((completedAssignments / expectedAssignments) * 100)}%`
    : 'No target list';
  const generatedAt = new Date().toLocaleString();

  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(detail.branch.name)} survey management report</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef3f4; color: #17262b; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "Noto Sans Arabic", sans-serif; }
    .report { width: 1120px; margin: 0 auto; background: white; padding: 34px; }
    .pdf-block { margin: 0 0 18px; break-inside: avoid; }
    .hero { border-radius: 22px; padding: 30px; color: white; background: linear-gradient(135deg,#075985,#0f766e 58%,#16a34a); position: relative; overflow: hidden; }
    .hero:after { content:""; width: 300px; height: 300px; border-radius: 50%; background: rgba(255,255,255,.08); position:absolute; right:-80px; top:-130px; }
    .eyebrow { font-size: 13px; text-transform: uppercase; letter-spacing: .16em; font-weight: 800; opacity: .85; }
    h1 { margin: 10px 0 4px; font-size: 34px; line-height: 1.15; }
    .hero p { margin: 5px 0 0; opacity: .9; font-size: 15px; }
    .section-title { margin: 28px 0 10px; padding-bottom: 8px; border-bottom: 3px solid #0f766e; font-size: 20px; font-weight: 800; }
    .section-note { color:#52646a; font-size:12px; margin:-4px 0 12px; }
    .metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .metric { border:1px solid #d7e2e4; border-radius:12px; padding:14px; background:linear-gradient(180deg,#fff,#f7fafb); }
    .metric-label { color:#5d7075; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .metric-value { font-size:25px; line-height:1.2; font-weight:850; margin-top:4px; color:#0f4c5c; }
    .metric-note,.subtle { color:#64767b; font-size:10px; line-height:1.4; margin-top:4px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px; }
    th { background:#e8f2f2; color:#294c54; text-align:left; padding:9px 7px; border:1px solid #cbdadc; font-size:10px; text-transform:uppercase; letter-spacing:.03em; }
    td { padding:8px 7px; border:1px solid #d8e1e3; vertical-align:top; overflow-wrap:anywhere; }
    tbody tr:nth-child(even) { background:#fafcfc; }
    .progress,.bar { height:7px; border-radius:999px; background:#e3ebed; overflow:hidden; margin-top:5px; }
    .progress span,.bar span { height:100%; display:block; background:linear-gradient(90deg,#0f766e,#22c55e); border-radius:999px; }
    .good { color:#0f7a45; font-weight:750; } .warn { color:#9a5b08; font-weight:750; } .bad { color:#b42332; font-weight:750; }
    .status { display:inline-block; border-radius:999px; padding:3px 7px; font-size:9px; font-weight:800; white-space:nowrap; }
    .status-completed { background:#dcfce7;color:#166534; } .status-incomplete { background:#fef3c7;color:#92400e; } .status-missing { background:#ffe4e6;color:#9f1239; } .status-unassigned { background:#edf1f2;color:#55676c; }
    .quality { border:1px solid #f1bf62; background:#fff8e8; border-radius:12px; padding:14px 18px; }
    .quality h3 { margin:0 0 8px; color:#78460b; } .quality ul { margin:0; padding-left:20px; } .quality li { margin:5px 0; line-height:1.45; }
    .question { border:1px solid #cfdde0; border-radius:14px; padding:16px; background:white; }
    .question-head { display:flex; justify-content:space-between; gap:16px; font-size:10px; align-items:flex-start; }
    .question h3 { font-size:14px; line-height:1.55; margin:9px 0 4px; }
    .code { background:#0f766e; color:#fff; padding:3px 7px; border-radius:6px; font-size:10px; font-weight:800; }
    .options { margin-top:12px; display:grid; gap:7px; }
    .source-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .option-row { display:grid; grid-template-columns:minmax(180px,270px) 1fr 82px; align-items:center; gap:10px; font-size:10px; }
    .option-row .bar { margin:0; }
    .written { margin-top:14px; padding-top:10px; border-top:1px dashed #b9c9cc; }
    .written h4 { margin:0 0 8px; }
    blockquote { margin:6px 0; padding:8px 10px; border-left:3px solid #0f766e; background:#f5f9f9; font-size:10px; }
    blockquote p { margin:0; line-height:1.5; } blockquote footer { margin-top:5px; color:#697b80; font-size:9px; }
    .empty { padding:20px; text-align:center; color:#697b80; } .compact { padding:8px; }
    .method { border-radius:12px; padding:14px; background:#edf7f5; color:#315159; font-size:11px; line-height:1.5; }
    @media print { body { background:white; } .report { width:auto; margin:0; } }
  </style></head><body><main class="report">
    <header class="hero pdf-block">
      <div class="eyebrow">Ponts per la Pau · Survey Management</div>
      <h1 dir="auto">${escapeHtml(detail.branch.name)}</h1>
      <p>${hasCompleteCoreCycle ? 'Complete six-survey branch report' : `Incomplete reporting cycle · ${surveys.length}/6 core surveys available · Missing ${escapeHtml(missingCoreCodes.join(', '))}`} · Generated ${escapeHtml(generatedAt)}</p>
    </header>

    <section class="metrics pdf-block">
      ${renderMetric('Tracked participant IDs', uniqueParticipants, 'Manual IDs remain separate until reviewed')}
      ${renderMetric('Completed all six', hasCompleteCoreCycle ? completedAll : 'Unavailable', hasCompleteCoreCycle ? 'Across the core survey set' : `Incomplete cycle; missing ${missingCoreCodes.join(', ')}`)}
      ${renderMetric('Recorded submissions', recordedSubmissions, 'Respondent-survey records with saved activity')}
      ${renderMetric('Expected assignments', expectedAssignments || '-', expectedAssignments ? 'Assigned respondent-survey pairs' : 'No target list')}
      ${renderMetric('Completed assignments', completedAssignments, `${incompleteAssignments} incomplete · ${notRespondedAssignments} not responded`)}
      ${renderMetric('Completion rate', completionRate, 'Completed / expected assignments')}
    </section>

    <div class="section-title pdf-block">Executive survey summary</div>
    <div class="section-note pdf-block">Core T1–T6 reporting set. Additional surveys are listed under data quality and are not folded into these totals.</div>
    <table class="pdf-block"><thead><tr><th style="width:5%">Code</th><th style="width:29%">Survey</th><th style="width:7%">Expected</th><th style="width:7%">Completed</th><th style="width:7%">Incomplete</th><th style="width:9%">Not responded</th><th style="width:12%">Completion</th><th style="width:24%">Last activity</th></tr></thead><tbody>${surveys.map(renderSurveyProgress).join('')}</tbody></table>

    <div class="section-title pdf-block">Cross-survey respondent matrix</div>
    <div class="section-note pdf-block">One row per conservative identity. Registered students and staff use stable IDs. Manual IDs always remain separate; exact and near-name similarities are review-only candidates.</div>
    <table class="pdf-block"><thead><tr><th style="width:22%">Respondent</th>${surveys.map((survey) => `<th>${escapeHtml(survey.surveyCode)}</th>`).join('')}<th style="width:8%">Overall</th></tr></thead><tbody>${renderRespondentRows(surveys, matrix)}</tbody></table>

    <div class="section-title pdf-block">Question-by-question analysis</div>
    <div class="section-note pdf-block">Skipped counts include only people who started; not started is reported separately. Aggregate rates use the reported respondent total when available; written responses are included in full.</div>
    ${detail.questions.map((question, index) => renderQuestion(question, index, surveyById.get(question.surveyId))).join('') || '<div class="empty pdf-block">No questions are available.</div>'}

    <div class="section-title pdf-block">Data quality and interpretation</div>
    <aside class="quality pdf-block"><h3>Review notes</h3><ul>${renderQualityNotes(detail, uncertainPairs, missingCoreCodes)}</ul></aside>
    <aside class="method pdf-block"><strong>Status definitions.</strong> Completed means every currently required survey question has an answer. Incomplete means there is saved activity but one or more currently required questions remain unanswered. Not Responded means an assigned respondent has no recorded activity. Historical completion is inferred because the legacy system did not record final-submit events. Named and aggregate sources are never summed together.</aside>
  </main></body></html>`;
}

export function branchSurveyManagementPdfFilename(branchName: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `Ponts_per_la_Pau_Survey_Report_${safeFilePart(branchName)}_${day}.pdf`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function renderReportPdf(html: string): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.title = 'Preparing branch survey report';
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
      const timeout = window.setTimeout(() => reject(new Error('Timed out while preparing the branch report')), 15_000);
      iframe.onload = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      document.body.appendChild(iframe);
      iframe.srcdoc = html;
    });

    const frameDocument = iframe.contentDocument;
    const report = frameDocument?.querySelector('.report') as HTMLElement | null;
    if (!frameDocument || !report) throw new Error('Branch survey report could not be prepared');
    await frameDocument.fonts?.ready;
    await new Promise<void>((resolve) => iframe.contentWindow?.requestAnimationFrame(() => resolve()) ?? resolve());

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const blockGap = 10;
    const scale = Math.min(1.75, window.devicePixelRatio || 1.5);
    const blocks = Array.from(frameDocument.querySelectorAll('.pdf-block')) as HTMLElement[];
    let cursorY = margin;
    let pageHasContent = false;

    for (const block of blocks.length > 0 ? blocks : [report]) {
      const canvas = await html2canvas(block, {
        backgroundColor: '#ffffff',
        logging: false,
        scale,
        useCORS: true,
        windowWidth: 1200,
      });
      if (!canvas.width || !canvas.height) continue;
      const imageHeight = canvas.height * (contentWidth / canvas.width);

      if (imageHeight > contentHeight) {
        if (pageHasContent) {
          pdf.addPage();
          cursorY = margin;
          pageHasContent = false;
        }
        const sourcePageHeight = Math.max(1, Math.floor(canvas.width * (contentHeight / contentWidth)));
        for (let sourceY = 0; sourceY < canvas.height; sourceY += sourcePageHeight) {
          const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = sliceHeight;
          const context = slice.getContext('2d');
          if (!context) throw new Error('Branch survey report canvas could not be prepared');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, slice.width, slice.height);
          context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          if (pageHasContent) pdf.addPage();
          pdf.addImage(slice.toDataURL('image/jpeg', 0.88), 'JPEG', margin, margin, contentWidth, sliceHeight * (contentWidth / canvas.width));
          pageHasContent = true;
        }
        cursorY = pageHeight - margin;
        continue;
      }

      if (pageHasContent && cursorY + imageHeight > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
        pageHasContent = false;
      }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', margin, cursorY, contentWidth, imageHeight);
      cursorY += imageHeight + blockGap;
      pageHasContent = true;
    }

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(110, 122, 126);
      pdf.text(`Ponts per la Pau · Survey management · Page ${page} of ${pages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

export async function createBranchSurveyManagementPDF(
  detail: BranchSurveyDashboard,
  matrix: CrossSurveyRespondentMatrixRow[],
  uncertainPairs: UncertainManualNamePair[],
): Promise<Blob> {
  return renderReportPdf(buildBranchSurveyManagementReportHtml(detail, matrix, uncertainPairs));
}

export async function exportBranchSurveyManagementPDF(
  detail: BranchSurveyDashboard,
  matrix: CrossSurveyRespondentMatrixRow[],
  uncertainPairs: UncertainManualNamePair[],
): Promise<void> {
  const blob = await createBranchSurveyManagementPDF(detail, matrix, uncertainPairs);
  downloadBlob(blob, branchSurveyManagementPdfFilename(detail.branch.name));
}
