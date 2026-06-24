/**
 * Survey service.
 *
 * Manages the psychosocial survey module:
 *  - Surveys have sections → questions → response options (with sentiment tags).
 *  - Branch staff can submit aggregate counts or named respondent answers.
 *  - `getSurveyResults` combines both sources for the results view.
 *
 * Surveys are hard-deleted (no soft-delete) because all child rows (sections,
 * questions, options, responses) are ON DELETE CASCADE in the DB schema.
 */

import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edge';
import { logActivity } from '@/services/activityService';
import { scopedBranchId } from '@/lib/scope';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'active' | 'closed';
export type SurveyLanguage = 'en' | 'es' | 'ca' | 'fa';
export type Sentiment = 'positive' | 'negative' | 'neutral';
export type SurveyRespondentType = 'students' | 'staff' | 'students_staff';
export type SurveyRespondentKind = 'student' | 'staff' | 'manual';
export type SurveyQuestionType =
  | 'short_answer'
  | 'paragraph'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'linear_scale'
  | 'rating'
  | 'multiple_choice_grid'
  | 'checkbox_grid'
  | 'date'
  | 'time';

export interface Survey {
  id: string;
  title: string;
  description?: string;
  period?: string;
  survey_date?: string;
  branch_id?: string | null;
  respondent_type?: SurveyRespondentType;
  language?: SurveyLanguage;
  status: SurveyStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SurveySection {
  id: string;
  survey_id: string;
  title: string;
  description?: string;
  order_index: number;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  section_id?: string;
  question_text: string;
  question_type: SurveyQuestionType;
  sentiment_enabled: boolean;
  order_index: number;
}

export interface SurveyResponseOption {
  id: string;
  survey_id: string;
  question_id?: string | null;
  label: string;
  order_index: number;
  sentiment: Sentiment;
}

export interface SurveyRespondent {
  id: string;
  survey_id: string;
  branch_id: string;
  respondent_type: SurveyRespondentKind;
  respondent_id: string;
  respondent_name: string;
  respondent_detail?: string | null;
  created_at: string;
}

export interface SurveyBranchResponse {
  id: string;
  survey_id: string;
  branch_id: string;
  question_id: string;
  option_id: string;
  count: number;
  entered_by?: string;
  updated_at: string;
}

export interface SurveyBranchSubmission {
  id: string;
  survey_id: string;
  branch_id: string;
  total_respondents: number;
  submitted_by?: string;
  updated_at: string;
}

export interface SurveyIndividualResponse {
  id: string;
  survey_id: string;
  branch_id: string;
  respondent_type: SurveyRespondentKind;
  respondent_id: string;
  respondent_name: string;
  question_id: string;
  option_id?: string | null;
  text_answer?: string | null;
  answered_by?: string | null;
  updated_at: string;
}

export interface SurveyFull extends Survey {
  sections: SurveySection[];
  questions: SurveyQuestion[];
  options: SurveyResponseOption[];
  respondents: SurveyRespondent[];
}

export interface BranchResult {
  branchId: string;
  branchName: string;
  totalRespondents: number;
  submitted: boolean;
  questionResults: {
    questionId: string;
    questionText: string;
    counts: { optionId: string; label: string; sentiment: Sentiment; count: number }[];
    total: number;
    positiveRate: number;
    negativeRate: number;
  }[];
  individualResponses: SurveyIndividualResponse[];
}

export interface CreateSurveyPayload {
  title: string;
  description?: string;
  period?: string;
  surveyDate?: string;
  branchId?: string;
  respondentType: SurveyRespondentType;
  respondentIds: { type: SurveyRespondentKind; id: string; name: string }[];
  language: SurveyLanguage;
  status: SurveyStatus;
  sections: { title: string; description?: string }[];
  questions: {
    text: string;
    sectionIndex: number | null;
    questionType?: SurveyQuestionType;
    sentimentEnabled?: boolean;
    options?: { label: string; sentiment: Sentiment }[];
  }[];
  options: { label: string; sentiment: Sentiment }[];
}

export interface UpdateSurveyStructurePayload {
  title: string;
  description?: string | null;
  period?: string | null;
  surveyDate?: string | null;
  language: SurveyLanguage;
  status: SurveyStatus;
  sections: CreateSurveyPayload['sections'];
  questions: CreateSurveyPayload['questions'];
  options: CreateSurveyPayload['options'];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function getSurveys() {
  const branchId = scopedBranchId();
  let query = supabase
    .from('surveys')
    .select('*')
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data as Survey[] };
}

export async function getSurveyFull(surveyId: string): Promise<{ success: boolean; data?: SurveyFull; error?: string }> {
  const [surveyRes, sectionsRes, questionsRes, optionsRes, respondentsRes] = await Promise.all([
    supabase.from('surveys').select('*').eq('id', surveyId).single(),
    supabase.from('survey_sections').select('*').eq('survey_id', surveyId).order('order_index'),
    supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('order_index'),
    supabase.from('survey_response_options').select('*').eq('survey_id', surveyId).order('order_index'),
    supabase.from('survey_respondents').select('*').eq('survey_id', surveyId).order('respondent_name'),
  ]);
  if (surveyRes.error) return { success: false, error: surveyRes.error.message };
  const respondentTableUnavailable =
    respondentsRes.error &&
    ['42P01', 'PGRST106', 'PGRST202', 'PGRST205'].includes(respondentsRes.error.code ?? '');
  if (respondentsRes.error && !respondentTableUnavailable) {
    return { success: false, error: respondentsRes.error.message };
  }
  return {
    success: true,
    data: {
      ...(surveyRes.data as Survey),
      sections: (sectionsRes.data ?? []) as SurveySection[],
      questions: (questionsRes.data ?? []) as SurveyQuestion[],
      options: (optionsRes.data ?? []) as SurveyResponseOption[],
      respondents: respondentTableUnavailable ? [] : (respondentsRes.data ?? []) as SurveyRespondent[],
    },
  };
}

export function optionsForQuestion(survey: Pick<SurveyFull, 'options'>, questionId: string) {
  const questionOptions = survey.options.filter((option) => option.question_id === questionId);
  return questionOptions.length > 0
    ? questionOptions
    : survey.options.filter((option) => !option.question_id);
}

export async function getSurveyResults(surveyId: string): Promise<{ success: boolean; data?: BranchResult[]; error?: string }> {
  const [fullRes, responsesRes, submissionsRes, individualResponsesRes, branchesRes] = await Promise.all([
    getSurveyFull(surveyId),
    supabase.from('survey_branch_responses').select('*').eq('survey_id', surveyId),
    supabase.from('survey_branch_submissions').select('*').eq('survey_id', surveyId),
    supabase.from('survey_individual_responses').select('*').eq('survey_id', surveyId),
    supabase.from('branches').select('id, name').eq('status', 'active'),
  ]);
  if (!fullRes.success || !fullRes.data) return { success: false, error: fullRes.error };
  const { questions } = fullRes.data;
  const responses = (responsesRes.data ?? []) as SurveyBranchResponse[];
  const submissions = (submissionsRes.data ?? []) as SurveyBranchSubmission[];
  const individualResponses = (individualResponsesRes.data ?? []) as SurveyIndividualResponse[];
  const branches = (branchesRes.data ?? []) as { id: string; name: string }[];

  // Only include branches that have any submission data
  const activeBranchIds = new Set([
    ...submissions.map((s) => s.branch_id),
    ...responses.map((r) => r.branch_id),
    ...individualResponses.map((r) => r.branch_id),
  ]);

  const results: BranchResult[] = branches
    .filter((b) => activeBranchIds.has(b.id))
    .map((branch) => {
      const submission = submissions.find((s) => s.branch_id === branch.id);
      const branchResponses = responses.filter((r) => r.branch_id === branch.id);
      const branchIndividualResponses = individualResponses.filter((r) => r.branch_id === branch.id);
      const individualRespondentCount = new Set(
        branchIndividualResponses.map((r) => `${r.respondent_type}:${r.respondent_id}`),
      ).size;

      const questionResults = questions.map((q) => {
        const questionOptions = optionsForQuestion(fullRes.data!, q.id);
        const qResponses = branchResponses.filter((r) => r.question_id === q.id);
        const qIndividualResponses = branchIndividualResponses.filter((r) => r.question_id === q.id);
        const counts = questionOptions.map((opt) => {
          const r = qResponses.find((r) => r.option_id === opt.id);
          const individualCount = qIndividualResponses.filter((answer) => answer.option_id === opt.id).length;
          return { optionId: opt.id, label: opt.label, sentiment: opt.sentiment, count: (r?.count ?? 0) + individualCount };
        });
        const total = counts.reduce((s, c) => s + c.count, 0);
        const positiveCount = counts.filter((c) => c.sentiment === 'positive').reduce((s, c) => s + c.count, 0);
        const negativeCount = counts.filter((c) => c.sentiment === 'negative').reduce((s, c) => s + c.count, 0);
        return {
          questionId: q.id,
          questionText: q.question_text,
          counts,
          total,
          positiveRate: total > 0 ? positiveCount / total : 0,
          negativeRate: total > 0 ? negativeCount / total : 0,
        };
      });

      return {
        branchId: branch.id,
        branchName: branch.name,
        totalRespondents: Math.max(submission?.total_respondents ?? 0, individualRespondentCount),
        submitted: !!submission || branchIndividualResponses.length > 0,
        questionResults,
        individualResponses: branchIndividualResponses,
      };
    });

  return { success: true, data: results };
}

export async function getSurveyRespondentOptions(branchId: string) {
  const [studentsRes, staffRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, student_id, user:users!user_id(first_name, last_name, status)')
      .eq('branch_id', branchId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('staff')
      .select('id, user:users!user_id(first_name, last_name, role, status)')
      .eq('branch_id', branchId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (studentsRes.error) return { success: false as const, error: studentsRes.error.message };
  if (staffRes.error) return { success: false as const, error: staffRes.error.message };

  const students = ((studentsRes.data ?? []) as any[])
    .filter((student) => student.user?.status === 'active')
    .map((student) => ({
      type: 'student' as const,
      id: student.id as string,
      name: `${student.user?.first_name ?? ''} ${student.user?.last_name ?? ''}`.trim() || student.student_id || 'Student',
      meta: student.student_id as string | undefined,
    }));

  const staff = ((staffRes.data ?? []) as any[])
    .filter((member) => member.user?.status === 'active' && member.user?.role !== 'parent')
    .map((member) => ({
      type: 'staff' as const,
      id: member.id as string,
      name: `${member.user?.first_name ?? ''} ${member.user?.last_name ?? ''}`.trim() || 'Staff member',
      meta: member.user?.role as string | undefined,
    }));

  return { success: true as const, students, staff };
}

export async function getBranchSubmission(surveyId: string, branchId: string) {
  const [submissionRes, responsesRes, individualResponsesRes] = await Promise.all([
    supabase.from('survey_branch_submissions').select('*').eq('survey_id', surveyId).eq('branch_id', branchId).maybeSingle(),
    supabase.from('survey_branch_responses').select('*').eq('survey_id', surveyId).eq('branch_id', branchId),
    supabase.from('survey_individual_responses').select('*').eq('survey_id', surveyId).eq('branch_id', branchId),
  ]);
  return {
    submission: submissionRes.data as SurveyBranchSubmission | null,
    responses: (responsesRes.data ?? []) as SurveyBranchResponse[],
    individualResponses: (individualResponsesRes.data ?? []) as SurveyIndividualResponse[],
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSurvey(payload: CreateSurveyPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; id: string }>('app-actions', {
    operation: 'create-survey',
    ...payload,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to create survey' };

  logActivity({ action_type: 'INSERT', table_name: 'surveys', description: `Created survey: ${payload.title}` });
  return { success: true, id: res.data?.id };
}

export async function updateSurveyMeta(surveyId: string, fields: { title?: string; description?: string | null; period?: string | null; survey_date?: string | null; status?: SurveyStatus; language?: SurveyLanguage }) {
  const res = await callEdgeFunction('app-actions', {
    operation: 'update-survey-meta',
    surveyId,
    fields,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update survey' };
  logActivity({ action_type: 'UPDATE', table_name: 'surveys', description: `Updated survey` });
  return { success: true };
}

export async function updateSurveyStructure(
  surveyId: string,
  payload: UpdateSurveyStructurePayload,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'update-survey-structure',
    surveyId,
    fields: {
      title: payload.title,
      description: payload.description ?? null,
      period: payload.period ?? null,
      survey_date: payload.surveyDate ?? null,
      status: payload.status,
      language: payload.language,
    },
    sections: payload.sections,
    questions: payload.questions,
    options: payload.options,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update survey questions' };
  logActivity({ action_type: 'UPDATE', table_name: 'survey_questions', description: 'Updated survey questions' });
  return { success: true };
}

export async function deleteSurvey(surveyId: string) {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-survey',
    surveyId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete survey' };
  logActivity({ action_type: 'DELETE', table_name: 'surveys', description: `Deleted survey` });
  return { success: true };
}

export async function saveBranchData(
  surveyId: string,
  branchId: string,
  totalRespondents: number,
  counts: { questionId: string; optionId: string; count: number }[]
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'save-branch-survey-data',
    surveyId,
    branchId,
    totalRespondents,
    counts,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to save survey data' };

  logActivity({ action_type: 'UPDATE', table_name: 'survey_branch_responses', description: `Submitted survey data for branch` });
  return { success: true };
}

/**
 * Adds a manually-entered respondent to an existing survey — a person who is
 * not in the students or staff records. The edge function generates the id.
 * `detail` carries free-text info (e.g. province) shown alongside the name.
 */
export async function addSurveyRespondent(
  surveyId: string,
  branchId: string,
  name: string,
  detail?: string,
): Promise<{ success: boolean; respondent?: SurveyRespondent; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; respondent: SurveyRespondent }>('app-actions', {
    operation: 'add-survey-respondent',
    surveyId,
    branchId,
    name,
    detail,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to add respondent' };

  logActivity({ action_type: 'INSERT', table_name: 'survey_respondents', description: `Added survey respondent: ${name}` });
  return { success: true, respondent: res.data?.respondent };
}

export async function saveIndividualResponses(
  surveyId: string,
  branchId: string,
  respondent: { type: SurveyRespondentKind; id: string; name: string },
  answers: { questionId: string; optionId?: string | null; optionIds?: string[]; textAnswer?: string | null }[],
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'save-individual-survey-responses',
    surveyId,
    branchId,
    respondent,
    answers,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to save individual responses' };

  logActivity({ action_type: 'UPDATE', table_name: 'survey_individual_responses', description: `Submitted individual survey responses` });
  return { success: true };
}
