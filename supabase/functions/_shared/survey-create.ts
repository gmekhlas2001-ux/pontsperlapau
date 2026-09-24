type ObjectValue = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_TYPES = ['short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'linear_scale', 'rating', 'multiple_choice_grid', 'checkbox_grid', 'date', 'time'];

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid survey item');
  return value as ObjectValue;
}
function list(value: unknown, max: number): ObjectValue[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error('Survey contains too many or invalid items');
  return value.map(object);
}
function text(value: unknown, max: number, required = false): string | null {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error('Invalid or oversized survey text');
  return value.trim() || null;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid survey identifier');
  return value.toLowerCase();
}
function choice(value: unknown, allowed: string[], fallback?: string): string {
  if (value == null && fallback) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error('Invalid survey setting');
  return value;
}

/** Validate before writing and assign IDs explicitly, independent of return order. */
export function prepareSurveyCreation(payload: unknown, caller: { id: string; role: string; branch_id: string | null }) {
  const body = object(payload);
  if (!['superadmin', 'admin'].includes(caller.role)) throw new Error('Insufficient permissions');
  const branchId = uuid(caller.role === 'superadmin' ? body.branchId : caller.branch_id);
  const respondentType = choice(body.respondentType, ['students', 'staff', 'students_staff'], 'students');
  const surveyCode = text(body.surveyCode, 2);
  const reportingCycleId = body.reportingCycleId ? uuid(body.reportingCycleId) : null;
  if (surveyCode) choice(surveyCode, ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
  if (Boolean(surveyCode) !== Boolean(reportingCycleId)) throw new Error('Survey code and reporting cycle ID must be set together');
  const date = text(body.surveyDate, 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Invalid survey date');
  const fields = {
    title: text(body.title, 500, true), description: text(body.description, 20_000),
    period: text(body.period, 200), status: choice(body.status, ['draft', 'active', 'closed']),
    branch_id: branchId, respondent_type: respondentType,
    language: choice(body.language, ['en', 'es', 'ca', 'fa'], 'fa'),
    survey_date: date, survey_code: surveyCode, reporting_cycle_id: reportingCycleId,
  };
  const sections = list(body.sections, 100).map((section, index) => ({
    id: crypto.randomUUID(), title: text(section.title, 500, true),
    description: text(section.description, 20_000), order_index: index,
  }));
  const inputQuestions = list(body.questions, 500);
  if (!inputQuestions.length) throw new Error('Add at least one question');
  const questions = inputQuestions.map((question, index) => {
    const sectionIndex = question.sectionIndex;
    if (sectionIndex != null && (typeof sectionIndex !== 'number' || !Number.isInteger(sectionIndex) || !sections[sectionIndex])) throw new Error('Question refers to an unknown section');
    return {
      id: crypto.randomUUID(), section_id: sectionIndex == null ? null : sections[sectionIndex as number].id,
      question_text: text(question.text, 10_000, true),
      question_type: choice(question.questionType, QUESTION_TYPES, 'multiple_choice'),
      sentiment_enabled: question.sentimentEnabled === true, required: question.required !== false, order_index: index,
    };
  });
  const makeOptions = (values: ObjectValue[], questionId: string | null) => values.map((option, index) => ({
    question_id: questionId, label: text(option.label, 2000, true),
    sentiment: choice(option.sentiment, ['positive', 'negative', 'neutral'], 'neutral'), order_index: index,
  }));
  const perQuestion = inputQuestions.flatMap((question, index) => makeOptions(list(question.options, 200), questions[index].id));
  const options = perQuestion.length ? perQuestion : makeOptions(list(body.options, 200), null);
  if (options.length > 10_000) throw new Error('Survey has too many response options');
  const seen = new Set<string>();
  const respondents = list(body.respondentIds, 5000).map(respondent => {
    const type = choice(respondent.type, respondentType === 'students_staff' ? ['student', 'staff'] : [respondentType === 'students' ? 'student' : 'staff']);
    const id = uuid(respondent.id);
    const key = `${type}:${id}`;
    if (seen.has(key)) throw new Error('A respondent is selected more than once');
    seen.add(key);
    // The database resolves the person's name from their actual record.
    return { respondent_type: type, respondent_id: id };
  });
  return { p_actor_id: caller.id, p_fields: fields, p_sections: sections, p_questions: questions, p_options: options, p_respondents: respondents };
}
