import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('@/lib/edge', () => ({ callEdgeFunction: vi.fn() }));
vi.mock('@/services/activityService', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/scope', () => ({ scopedBranchId: vi.fn(() => null) }));

import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edge';
import {
  getBranchSubmission,
  getSurveyFull,
  getSurveyListStats,
  getSurveyResultsFast,
  invalidateSurveyFullCache,
  updateSurveyMeta,
} from './surveyService';

function mockSurveyFullQueries() {
  const survey = {
    id: 'survey-a',
    title: 'Survey A',
    status: 'active',
    language: 'fa',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  };
  const questions = [{
    id: 'question-a',
    survey_id: 'survey-a',
    question_text: 'Question A',
    question_type: 'multiple_choice',
    sentiment_enabled: false,
    order_index: 0,
  }];
  const options = [
    { id: 'option-a', survey_id: 'survey-a', question_id: 'question-a', label: 'Good', order_index: 0, sentiment: 'positive' },
    { id: 'option-b', survey_id: 'survey-a', question_id: 'question-a', label: 'Bad', order_index: 1, sentiment: 'negative' },
  ];

  const singleQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  singleQuery.select = vi.fn(() => singleQuery);
  singleQuery.eq = vi.fn(() => singleQuery);
  singleQuery.single = vi.fn().mockResolvedValue({ data: survey, error: null });

  const orderedQuery = (data: unknown[]) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.order = vi.fn().mockResolvedValue({ data, error: null });
    return query;
  };

  const respondentQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  respondentQuery.select = vi.fn(() => respondentQuery);
  respondentQuery.eq = vi.fn(() => respondentQuery);
  respondentQuery.order = vi.fn(() => respondentQuery);
  respondentQuery.range = vi.fn().mockResolvedValue({ data: [], error: null });

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'surveys') return singleQuery;
    if (table === 'survey_sections') return orderedQuery([]);
    if (table === 'survey_questions') return orderedQuery(questions);
    if (table === 'survey_response_options') return orderedQuery(options);
    if (table === 'survey_respondents') return respondentQuery;
    throw new Error(`Unexpected table: ${table}`);
  }) as never);
}

function mockStatsQuery(result: { data: unknown[] | null; error: { message: string } | null }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn().mockResolvedValue(result);
  vi.mocked(supabase.from).mockReturnValue(query as never);
  return query;
}

describe('getSurveyListStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses effective database totals and sums each submitted branch', async () => {
    const query = mockStatsQuery({
      data: [
        { survey_id: 'survey-a', effective_total_respondents: 34 },
        { survey_id: 'survey-a', effective_total_respondents: 10 },
        { survey_id: 'survey-b', effective_total_respondents: 7 },
      ],
      error: null,
    });

    const result = await getSurveyListStats(['survey-a', 'survey-b', 'survey-c']);

    expect(supabase.from).toHaveBeenCalledWith('survey_list_stats');
    expect(query.select).toHaveBeenCalledWith('survey_id, effective_total_respondents');
    expect(result).toEqual({
      success: true,
      data: {
        'survey-a': { totalRespondents: 44, submittedBranches: 2 },
        'survey-b': { totalRespondents: 7, submittedBranches: 1 },
        'survey-c': { totalRespondents: 0, submittedBranches: 0 },
      },
    });
  });

  it('returns a read error without inventing totals', async () => {
    mockStatsQuery({ data: null, error: { message: 'stats unavailable' } });

    await expect(getSurveyListStats(['survey-a'])).resolves.toEqual({
      success: false,
      error: 'stats unavailable',
    });
  });
});

describe('getBranchSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('overlays the effective individual respondent count without changing the stored object', async () => {
    const storedSubmission = {
      id: 'submission-a',
      survey_id: 'survey-a',
      branch_id: 'branch-a',
      total_respondents: 2,
      updated_at: '2026-07-11T00:00:00Z',
    };
    const individualResponses = [
      { id: '1', respondent_type: 'student', respondent_id: 'person-a' },
      { id: '2', respondent_type: 'student', respondent_id: 'person-a' },
      { id: '3', respondent_type: 'student', respondent_id: 'person-b' },
      { id: '4', respondent_type: 'staff', respondent_id: 'person-a' },
    ];

    const submissionQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    submissionQuery.select = vi.fn(() => submissionQuery);
    submissionQuery.eq = vi.fn(() => submissionQuery);
    submissionQuery.maybeSingle = vi.fn().mockResolvedValue({ data: storedSubmission, error: null });

    const pagedQuery = (data: unknown[]) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.range = vi.fn().mockResolvedValue({ data, error: null });
      return query;
    };
    const aggregateQuery = pagedQuery([]);
    const individualQuery = pagedQuery(individualResponses);

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'survey_branch_submissions') return submissionQuery;
      if (table === 'survey_branch_responses') return aggregateQuery;
      if (table === 'survey_individual_responses') return individualQuery;
      throw new Error(`Unexpected table: ${table}`);
    }) as never);

    const result = await getBranchSubmission('survey-a', 'branch-a');

    expect(result.submission?.total_respondents).toBe(3);
    expect(storedSubmission.total_respondents).toBe(2);
  });
});

describe('survey full cache and fast results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSurveyFullCache();
    mockSurveyFullQueries();
  });

  it('invalidates cached survey data after a successful metadata update', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({ ok: true, data: { success: true } });

    await getSurveyFull('survey-a');
    await getSurveyFull('survey-a');
    expect(supabase.from).toHaveBeenCalledTimes(5);

    await updateSurveyMeta('survey-a', { title: 'Updated survey' });
    await getSurveyFull('survey-a');

    expect(supabase.from).toHaveBeenCalledTimes(10);
  });

  it('keeps individual answer totals in the fast summary without loading answer rows', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: {
          branches: [{
            branchId: 'branch-a',
            branchName: 'Branch A',
            totalRespondents: 3,
            individualAnswerCount: 7,
            submitted: true,
            hasAggregateAnswers: false,
          }],
          questionCounts: [{
            branchId: 'branch-a',
            questionId: 'question-a',
            optionId: 'option-a',
            count: 3,
          }],
        },
      },
    });

    const result = await getSurveyResultsFast('survey-a');

    expect(result.success).toBe(true);
    expect(result.data?.[0]).toMatchObject({
      individualAnswerCount: 7,
      individualResponses: [],
      totalRespondents: 3,
    });
    expect(result.data?.[0].questionResults[0].counts).toEqual([
      { optionId: 'option-a', label: 'Good', sentiment: 'positive', count: 3 },
      { optionId: 'option-b', label: 'Bad', sentiment: 'negative', count: 0 },
    ]);
  });
});
