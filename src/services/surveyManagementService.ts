import { callEdgeFunction } from '@/lib/edge';

export type SurveyResponseStatus = 'completed' | 'incomplete' | 'not_responded';

export const CORE_SURVEY_CODES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const;

export interface SurveyManagementSummary {
  expectedAssignments: number;
  completed: number;
  incomplete: number;
  notResponded: number;
  totalSubmissions: number;
}

export interface SurveyManagementBranchSummary {
  branchId: string;
  branchName: string;
  surveyCount: number;
  canonicalSurveyCount: number;
  expectedAssignments: number;
  completed: number;
  incomplete: number;
  notResponded: number;
  totalSubmissions: number;
  completionRate: number | null;
  lastActivity: string | null;
}

export interface SurveyManagementSurveySummary {
  surveyId: string;
  branchId?: string;
  surveyCode: string | null;
  reportingCycleId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  surveyDate: string | null;
  questionCount: number;
  expected: number;
  completed: number;
  incomplete: number;
  notResponded: number;
  started: number;
  completionRate: number | null;
  participationRate: number | null;
  lastActivity: string | null;
}

export interface SurveyManagementOverview {
  definitions: {
    expected: string;
    completed: string;
    incomplete: string;
    notResponded: string;
    totalSubmissions: string;
  };
  summary: SurveyManagementSummary;
  branches: SurveyManagementBranchSummary[];
  surveys: SurveyManagementSurveySummary[];
}

export interface SurveyRespondentStatusRow {
  assignmentId: string;
  surveyId: string;
  surveyCode: string | null;
  branchId: string;
  respondentType: 'student' | 'staff' | 'manual';
  respondentId: string;
  respondentName: string;
  respondentDetail: string | null;
  responseStatus: SurveyResponseStatus;
  answeredQuestions: number;
  questionCount: number;
  progress: number;
  firstActivity: string | null;
  lastActivity: string | null;
  completedAt: string | null;
  completionSource: 'inferred_current_answers' | 'saved_complete' | null;
  activitySource: 'inferred_current_rows' | 'tracked' | null;
}

export interface SurveyQuestionOptionAnalytics {
  optionId: string;
  label: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  count: number;
}

export interface SurveyTextResponseAnalytics {
  respondentType: 'student' | 'staff' | 'manual';
  respondentId: string;
  respondentName: string;
  answer: string;
  updatedAt: string;
}

export interface SurveyQuestionAnalytics {
  questionId: string;
  surveyId: string;
  surveyCode: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  question: string;
  questionType: string;
  sentimentEnabled: boolean;
  required: boolean;
  orderIndex: number;
  expected: number;
  started?: number | null;
  answerCount: number | null;
  skippedCount: number | null;
  notStartedCount?: number | null;
  responseBase: 'named' | 'aggregate' | 'mixed' | 'none';
  denominatorKnown: boolean;
  namedAnswerCount: number;
  aggregateAnswerCount: number;
  aggregateRespondentTotal: number | null;
  options: SurveyQuestionOptionAnalytics[];
  namedOptions: SurveyQuestionOptionAnalytics[];
  aggregateOptions: SurveyQuestionOptionAnalytics[];
  textResponses: SurveyTextResponseAnalytics[];
}

export interface SurveyDashboardDataQuality {
  additionalSurveys: {
    surveyId: string;
    title: string;
    surveyCode?: string | null;
    reportingCycleId?: string | null;
    exclusionReason?: 'uncoded' | 'missing_cycle' | 'inactive_cycle';
  }[];
  duplicateSurveyCodes: { surveyCode: string; count: number }[];
  titleBranchMismatches: {
    surveyId: string;
    surveyCode: string | null;
    title: string;
    referencedBranch: string;
  }[];
  orphanedRegisteredAssignments: {
    assignmentId: string;
    surveyId: string;
    surveyCode: string | null;
    respondentType: 'student' | 'staff';
    respondentId: string;
    respondentName: string;
  }[];
  mixedResponseSources: {
    surveyId: string;
    surveyCode: string | null;
    title: string;
    namedAnswerRows: number;
    positiveAggregateCells: number;
    aggregateRespondentTotal: number | null;
    invalidAggregateCellCount?: number;
  }[];
  historicalCompletionRule: string;
  manualIdentityRule: string;
}

export interface BranchSurveyDashboard {
  branch: { id: string; name: string };
  surveys: SurveyManagementSurveySummary[];
  respondents: SurveyRespondentStatusRow[];
  questions: SurveyQuestionAnalytics[];
  dataQuality: SurveyDashboardDataQuality;
}

type EdgeAnalyticsResponse<T> = { success: boolean; data: T };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSurveyManagementOverview(value: unknown): value is SurveyManagementOverview {
  if (!isRecord(value) || !isRecord(value.summary) || !isRecord(value.definitions)) return false;
  return Array.isArray(value.branches) && Array.isArray(value.surveys);
}

function isBranchSurveyDashboard(value: unknown): value is BranchSurveyDashboard {
  if (!isRecord(value) || !isRecord(value.branch) || !isRecord(value.dataQuality)) return false;
  if (typeof value.branch.id !== 'string' || !value.branch.id || typeof value.branch.name !== 'string' || !value.branch.name) return false;
  const quality = value.dataQuality;
  return Array.isArray(value.surveys)
    && Array.isArray(value.respondents)
    && Array.isArray(value.questions)
    && Array.isArray(quality.additionalSurveys)
    && Array.isArray(quality.duplicateSurveyCodes)
    && Array.isArray(quality.titleBranchMismatches)
    && Array.isArray(quality.orphanedRegisteredAssignments)
    && Array.isArray(quality.mixedResponseSources);
}

export async function getSurveyManagementOverview(
  branchId?: string,
): Promise<{ success: true; data: SurveyManagementOverview } | { success: false; error: string }> {
  const response = await callEdgeFunction<EdgeAnalyticsResponse<SurveyManagementOverview>>(
    'app-actions',
    { operation: 'get-survey-management-overview', branchId: branchId || null },
  );

  if (!response.ok || response.data?.success !== true || !isSurveyManagementOverview(response.data.data)) {
    return { success: false, error: response.error ?? 'Failed to load survey overview' };
  }
  return { success: true, data: response.data.data };
}

export async function getBranchSurveyDashboard(
  branchId: string,
): Promise<{ success: true; data: BranchSurveyDashboard } | { success: false; error: string }> {
  const response = await callEdgeFunction<EdgeAnalyticsResponse<BranchSurveyDashboard>>(
    'app-actions',
    { operation: 'get-branch-survey-dashboard', branchId },
  );

  if (!response.ok || response.data?.success !== true || !isBranchSurveyDashboard(response.data.data)) {
    return { success: false, error: response.error ?? 'Failed to load branch survey analysis' };
  }
  return { success: true, data: response.data.data };
}
