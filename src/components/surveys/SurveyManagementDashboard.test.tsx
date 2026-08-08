import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BranchSurveyDashboard,
  SurveyManagementOverview,
} from '@/services/surveyManagementService';
import { SurveyManagementDashboard } from './SurveyManagementDashboard';

const serviceMocks = vi.hoisted(() => ({
  getSurveyManagementOverview: vi.fn(),
  getBranchSurveyDashboard: vi.fn(),
}));

vi.mock('@/services/surveyManagementService', () => serviceMocks);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-a', role: 'admin', branchId: 'branch-a' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const overview: SurveyManagementOverview = {
  definitions: {
    expected: 'Expected',
    completed: 'Completed',
    incomplete: 'Incomplete',
    notResponded: 'Not responded',
    totalSubmissions: 'Submissions',
  },
  summary: {
    expectedAssignments: 2,
    completed: 1,
    incomplete: 0,
    notResponded: 1,
    totalSubmissions: 1,
  },
  branches: [{
    branchId: 'branch-a',
    branchName: 'Branch A',
    surveyCount: 2,
    canonicalSurveyCount: 2,
    expectedAssignments: 2,
    completed: 1,
    incomplete: 0,
    notResponded: 1,
    totalSubmissions: 1,
    completionRate: 0.5,
    lastActivity: '2026-08-08T10:00:00Z',
  }],
  surveys: [],
};

const detail: BranchSurveyDashboard = {
  branch: { id: 'branch-a', name: 'Branch A' },
  surveys: [
    {
      surveyId: 'survey-t1',
      surveyCode: 'T1',
      reportingCycleId: 'cycle-a',
      title: 'T1 survey',
      status: 'active',
      surveyDate: '2026-08-01',
      questionCount: 1,
      expected: 1,
      completed: 1,
      incomplete: 0,
      notResponded: 0,
      started: 1,
      completionRate: 1,
      participationRate: 1,
      lastActivity: '2026-08-08T10:00:00Z',
    },
    {
      surveyId: 'survey-t2',
      surveyCode: 'T2',
      reportingCycleId: 'cycle-a',
      title: 'T2 survey',
      status: 'active',
      surveyDate: '2026-08-01',
      questionCount: 1,
      expected: 1,
      completed: 0,
      incomplete: 0,
      notResponded: 1,
      started: 0,
      completionRate: 0,
      participationRate: 0,
      lastActivity: null,
    },
  ],
  respondents: [
    {
      assignmentId: 'assignment-a',
      surveyId: 'survey-t1',
      surveyCode: 'T1',
      branchId: 'branch-a',
      respondentType: 'manual',
      respondentId: 'person-a',
      respondentName: 'Alice',
      respondentDetail: null,
      responseStatus: 'completed',
      answeredQuestions: 1,
      questionCount: 1,
      progress: 1,
      firstActivity: '2026-08-08T09:00:00Z',
      lastActivity: '2026-08-08T10:00:00Z',
      completedAt: '2026-08-08T10:00:00Z',
      completionSource: 'saved_complete',
      activitySource: 'tracked',
    },
    {
      assignmentId: 'assignment-b',
      surveyId: 'survey-t2',
      surveyCode: 'T2',
      branchId: 'branch-a',
      respondentType: 'manual',
      respondentId: 'person-b',
      respondentName: 'Bob',
      respondentDetail: null,
      responseStatus: 'not_responded',
      answeredQuestions: 0,
      questionCount: 1,
      progress: 0,
      firstActivity: null,
      lastActivity: null,
      completedAt: null,
      completionSource: null,
      activitySource: null,
    },
  ],
  questions: [{
    questionId: 'question-a',
    surveyId: 'survey-t1',
    surveyCode: 'T1',
    sectionId: null,
    sectionTitle: null,
    question: 'Select every applicable option',
    questionType: 'checkboxes',
    sentimentEnabled: false,
    required: true,
    orderIndex: 0,
    expected: 0,
    answerCount: 3,
    skippedCount: null,
    responseBase: 'aggregate',
    denominatorKnown: false,
    namedAnswerCount: 0,
    aggregateAnswerCount: 3,
    aggregateRespondentTotal: null,
    options: [
      { optionId: 'option-a', label: 'Option A', sentiment: 'neutral', count: 2 },
      { optionId: 'option-b', label: 'Option B', sentiment: 'neutral', count: 1 },
    ],
    namedOptions: [],
    aggregateOptions: [],
    textResponses: [],
  }],
  dataQuality: {
    additionalSurveys: [],
    duplicateSurveyCodes: [],
    titleBranchMismatches: [],
    orphanedRegisteredAssignments: [],
    mixedResponseSources: [],
    historicalCompletionRule: 'Historical completion is inferred.',
    manualIdentityRule: 'Manual identities remain separate.',
  },
};

describe('SurveyManagementDashboard', () => {
  beforeAll(() => {
    Object.defineProperties(Element.prototype, {
      hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      scrollIntoView: { configurable: true, value: vi.fn() },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getSurveyManagementOverview.mockResolvedValue({ success: true, data: overview });
    serviceMocks.getBranchSurveyDashboard.mockResolvedValue({ success: true, data: detail });
  });

  it('shows the missing core surveys and gives progress bars a complete accessible name', async () => {
    render(<SurveyManagementDashboard branches={[]} />);

    expect(await screen.findByText('Six-survey progress')).toBeInTheDocument();
    expect(screen.getByText('Missing core survey definitions: T3, T4, T5, T6.')).toBeInTheDocument();
    expect(screen.getAllByText('Survey definition missing')).toHaveLength(4);
    expect(screen.getByRole('progressbar', {
      name: 'T1: 1 of 1 assignments completed, 100%',
    })).toBeInTheDocument();
  });

  it('uses the selected survey as an actual respondent filter', async () => {
    const user = userEvent.setup();
    render(<SurveyManagementDashboard branches={[]} />);

    await screen.findByText('Six-survey progress');
    await user.click(screen.getByRole('tab', { name: 'Respondents' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Survey' }));
    await user.click(await screen.findByRole('option', { name: 'T1' }));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });
  });

  it('does not invent aggregate checkbox percentages without a respondent denominator', async () => {
    const user = userEvent.setup();
    render(<SurveyManagementDashboard branches={[]} />);

    await screen.findByText('Six-survey progress');
    await user.click(screen.getByRole('tab', { name: 'Questions' }));

    expect(screen.getByText('2 (rate unavailable)')).toBeInTheDocument();
    expect(screen.getByText('1 (rate unavailable)')).toBeInTheDocument();
    expect(screen.getByText('Percentages are unavailable because no respondent denominator was recorded.')).toBeInTheDocument();
  });
});
