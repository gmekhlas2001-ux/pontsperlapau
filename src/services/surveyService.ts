import { supabase } from '@/lib/supabase';
import { logActivity } from '@/services/activityService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'active' | 'closed';
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface Survey {
  id: string;
  title: string;
  description?: string;
  period?: string;
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
  order_index: number;
}

export interface SurveyResponseOption {
  id: string;
  survey_id: string;
  label: string;
  order_index: number;
  sentiment: Sentiment;
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

export interface SurveyFull extends Survey {
  sections: SurveySection[];
  questions: SurveyQuestion[];
  options: SurveyResponseOption[];
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
}

export interface CreateSurveyPayload {
  title: string;
  description?: string;
  period?: string;
  status: SurveyStatus;
  sections: { title: string; description?: string }[];
  questions: { text: string; sectionIndex: number | null }[];
  options: { label: string; sentiment: Sentiment }[];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function getSurveys() {
  const { data, error } = await supabase
    .from('surveys')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data as Survey[] };
}

export async function getSurveyFull(surveyId: string): Promise<{ success: boolean; data?: SurveyFull; error?: string }> {
  const [surveyRes, sectionsRes, questionsRes, optionsRes] = await Promise.all([
    supabase.from('surveys').select('*').eq('id', surveyId).single(),
    supabase.from('survey_sections').select('*').eq('survey_id', surveyId).order('order_index'),
    supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('order_index'),
    supabase.from('survey_response_options').select('*').eq('survey_id', surveyId).order('order_index'),
  ]);
  if (surveyRes.error) return { success: false, error: surveyRes.error.message };
  return {
    success: true,
    data: {
      ...(surveyRes.data as Survey),
      sections: (sectionsRes.data ?? []) as SurveySection[],
      questions: (questionsRes.data ?? []) as SurveyQuestion[],
      options: (optionsRes.data ?? []) as SurveyResponseOption[],
    },
  };
}

export async function getSurveyResults(surveyId: string): Promise<{ success: boolean; data?: BranchResult[]; error?: string }> {
  const [fullRes, responsesRes, submissionsRes, branchesRes] = await Promise.all([
    getSurveyFull(surveyId),
    supabase.from('survey_branch_responses').select('*').eq('survey_id', surveyId),
    supabase.from('survey_branch_submissions').select('*').eq('survey_id', surveyId),
    supabase.from('branches').select('id, name').eq('status', 'active'),
  ]);
  if (!fullRes.success || !fullRes.data) return { success: false, error: fullRes.error };
  const { questions, options } = fullRes.data;
  const responses = (responsesRes.data ?? []) as SurveyBranchResponse[];
  const submissions = (submissionsRes.data ?? []) as SurveyBranchSubmission[];
  const branches = (branchesRes.data ?? []) as { id: string; name: string }[];

  // Only include branches that have any submission data
  const activeBranchIds = new Set([
    ...submissions.map((s) => s.branch_id),
    ...responses.map((r) => r.branch_id),
  ]);

  const results: BranchResult[] = branches
    .filter((b) => activeBranchIds.has(b.id))
    .map((branch) => {
      const submission = submissions.find((s) => s.branch_id === branch.id);
      const branchResponses = responses.filter((r) => r.branch_id === branch.id);

      const questionResults = questions.map((q) => {
        const qResponses = branchResponses.filter((r) => r.question_id === q.id);
        const counts = options.map((opt) => {
          const r = qResponses.find((r) => r.option_id === opt.id);
          return { optionId: opt.id, label: opt.label, sentiment: opt.sentiment, count: r?.count ?? 0 };
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
        totalRespondents: submission?.total_respondents ?? 0,
        submitted: !!submission,
        questionResults,
      };
    });

  return { success: true, data: results };
}

export async function getBranchSubmission(surveyId: string, branchId: string) {
  const [submissionRes, responsesRes] = await Promise.all([
    supabase.from('survey_branch_submissions').select('*').eq('survey_id', surveyId).eq('branch_id', branchId).maybeSingle(),
    supabase.from('survey_branch_responses').select('*').eq('survey_id', surveyId).eq('branch_id', branchId),
  ]);
  return {
    submission: submissionRes.data as SurveyBranchSubmission | null,
    responses: (responsesRes.data ?? []) as SurveyBranchResponse[],
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSurvey(payload: CreateSurveyPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) return { success: false, error: 'Not authenticated' };
  const caller = JSON.parse(storedUser);

  // 1. Insert survey
  const { data: survey, error: sErr } = await supabase
    .from('surveys')
    .insert({ title: payload.title, description: payload.description, period: payload.period, status: payload.status, created_by: caller.id })
    .select()
    .single();
  if (sErr || !survey) return { success: false, error: sErr?.message ?? 'Failed to create survey' };

  // 2. Insert sections
  const sectionIdMap: Record<number, string> = {};
  if (payload.sections.length > 0) {
    const { data: sections, error: secErr } = await supabase
      .from('survey_sections')
      .insert(payload.sections.map((s, i) => ({ survey_id: survey.id, title: s.title, description: s.description, order_index: i })))
      .select();
    if (secErr) return { success: false, error: secErr.message };
    (sections ?? []).forEach((s: any, i: number) => { sectionIdMap[i] = s.id; });
  }

  // 3. Insert questions
  if (payload.questions.length > 0) {
    const { error: qErr } = await supabase.from('survey_questions').insert(
      payload.questions.map((q, i) => ({
        survey_id: survey.id,
        section_id: q.sectionIndex !== null ? sectionIdMap[q.sectionIndex] ?? null : null,
        question_text: q.text,
        order_index: i,
      }))
    );
    if (qErr) return { success: false, error: qErr.message };
  }

  // 4. Insert options
  if (payload.options.length > 0) {
    const { error: oErr } = await supabase.from('survey_response_options').insert(
      payload.options.map((o, i) => ({ survey_id: survey.id, label: o.label, sentiment: o.sentiment, order_index: i }))
    );
    if (oErr) return { success: false, error: oErr.message };
  }

  logActivity({ action_type: 'INSERT', table_name: 'surveys', description: `Created survey: ${payload.title}` });
  return { success: true, id: survey.id };
}

export async function updateSurveyMeta(surveyId: string, fields: { title?: string; description?: string; period?: string; status?: SurveyStatus }) {
  const { error } = await supabase.from('surveys').update(fields).eq('id', surveyId);
  if (error) return { success: false, error: error.message };
  logActivity({ action_type: 'UPDATE', table_name: 'surveys', description: `Updated survey` });
  return { success: true };
}

export async function deleteSurvey(surveyId: string) {
  const { error } = await supabase.from('surveys').delete().eq('id', surveyId);
  if (error) return { success: false, error: error.message };
  logActivity({ action_type: 'DELETE', table_name: 'surveys', description: `Deleted survey` });
  return { success: true };
}

export async function saveBranchData(
  surveyId: string,
  branchId: string,
  totalRespondents: number,
  counts: { questionId: string; optionId: string; count: number }[]
): Promise<{ success: boolean; error?: string }> {
  const storedUser = localStorage.getItem('user');
  const caller = storedUser ? JSON.parse(storedUser) : null;

  // Upsert total respondents
  const { error: subErr } = await supabase.from('survey_branch_submissions').upsert(
    { survey_id: surveyId, branch_id: branchId, total_respondents: totalRespondents, submitted_by: caller?.id },
    { onConflict: 'survey_id,branch_id' }
  );
  if (subErr) return { success: false, error: subErr.message };

  // Upsert each count
  if (counts.length > 0) {
    const { error: rErr } = await supabase.from('survey_branch_responses').upsert(
      counts.map((c) => ({
        survey_id: surveyId,
        branch_id: branchId,
        question_id: c.questionId,
        option_id: c.optionId,
        count: c.count,
        entered_by: caller?.id,
      })),
      { onConflict: 'survey_id,branch_id,question_id,option_id' }
    );
    if (rErr) return { success: false, error: rErr.message };
  }

  logActivity({ action_type: 'UPDATE', table_name: 'survey_branch_responses', description: `Submitted survey data for branch` });
  return { success: true };
}
