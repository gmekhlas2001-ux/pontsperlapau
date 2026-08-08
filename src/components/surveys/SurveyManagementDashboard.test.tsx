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

vi.mock('@/services/surveyManagementService', () => ({
  ...serviceMocks,
  CORE_SURVEY_CODES: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
}));

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
    notStartedCount: null,
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
    const completedAllMetric = screen.getByText('Completed all six').parentElement;
    expect(completedAllMetric).toHaveTextContent('Unavailable');
    expect(completedAllMetric).toHaveTextContent('Incomplete reporting cycle: missing T3, T4, T5, T6');
  });

  it('falls back to the first reporting branch when the signed-in branch is unavailable', async () => {
    serviceMocks.getSurveyManagementOverview.mockResolvedValue({
      success: true,
      data: {
        ...overview,
        branches: [{ ...overview.branches[0], branchId: 'branch-b', branchName: 'Branch B' }],
      },
    });
    serviceMocks.getBranchSurveyDashboard.mockResolvedValue({
      success: true,
      data: { ...detail, branch: { id: 'branch-b', name: 'Branch B' } },
    });

    render(<SurveyManagementDashboard branches={[]} />);

    await waitFor(() => {
      expect(serviceMocks.getBranchSurveyDashboard).toHaveBeenCalledWith('branch-b');
    });
  });

  it('disables completed-all filtering when the six-survey cycle is incomplete', async () => {
    const user = userEvent.setup();
    render(<SurveyManagementDashboard branches={[]} />);

    await screen.findByText('Six-survey progress');
    await user.click(screen.getByRole('tab', { name: 'Respondents' }));
    await user.click(screen.getByRole('combobox', { name: 'Participation' }));

    expect(await screen.findByRole('option', { name: 'Completed all six (cycle incomplete)' }))
      .toHaveAttribute('aria-disabled', 'true');
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

  it('labels aggregate checkbox totals as selections and uses the reported respondent denominator', async () => {
    const user = userEvent.setup();
    serviceMocks.getBranchSurveyDashboard.mockResolvedValue({
      success: true,
      data: {
        ...detail,
        questions: [{
          ...detail.questions[0],
          answerCount: null,
          aggregateAnswerCount: 3,
          aggregateRespondentTotal: 2,
          options: [
            { optionId: 'option-a', label: 'Option A', sentiment: 'neutral', count: 2 },
            { optionId: 'option-b', label: 'Option B', sentiment: 'neutral', count: 1 },
          ],
        }],
      },
    });
    render(<SurveyManagementDashboard branches={[]} />);

    await screen.findByText('Six-survey progress');
    await user.click(screen.getByRole('tab', { name: 'Questions' }));

    expect(screen.getByText('3 option selections')).toBeInTheDocument();
    expect(screen.queryByText('3 answered')).not.toBeInTheDocument();
    expect(screen.getByText('2 (100%)')).toBeInTheDocument();
    expect(screen.getByText('1 (50%)')).toBeInTheDocument();
    expect(screen.getByText('Percentages use the reported respondent total as the denominator.')).toBeInTheDocument();
  });

  it('separates skipped-after-starting from people who never started', async () => {
    const user = userEvent.setup();
    serviceMocks.getBranchSurveyDashboard.mockResolvedValue({
      success: true,
      data: {
        ...detail,
        surveys: [{ ...detail.surveys[0], expected: 3, started: 2 }],
        respondents: detail.respondents.filter((respondent) => respondent.surveyId === 'survey-t1'),
        questions: [{
          ...detail.questions[0],
          questionType: 'multiple_choice',
          expected: 3,
          answerCount: 1,
          skippedCount: 1,
          notStartedCount: 1,
          responseBase: 'named',
          denominatorKnown: true,
          namedAnswerCount: 1,
          aggregateAnswerCount: 0,
          aggregateRespondentTotal: null,
          options: [{ optionId: 'option-a', label: 'Option A', sentiment: 'neutral', count: 1 }],
        }],
      },
    });
    render(<SurveyManagementDashboard branches={[]} />);

    await screen.findByText('Six-survey progress');
    await user.click(screen.getByRole('tab', { name: 'Questions' }));

    expect(screen.getByText('1 answered')).toBeInTheDocument();
    expect(screen.getByText('1 skipped after starting')).toBeInTheDocument();
    expect(screen.getByText('1 not started')).toBeInTheDocument();
  });

  it('visibly flags preserved aggregate cells above the respondent total', async () => {
    serviceMocks.getBranchSurveyDashboard.mockResolvedValue({
      success: true,
      data: {
        ...detail,
        dataQuality: {
          ...detail.dataQuality,
          mixedResponseSources: [{
            surveyId: 'survey-t1',
            surveyCode: 'T1',
            title: 'T1 survey',
            namedAnswerRows: 4,
            positiveAggregateCells: 1,
            aggregateRespondentTotal: 3,
            invalidAggregateCellCount: 1,
          }],
        },
      },
    });
    render(<SurveyManagementDashboard branches={[]} />);

    expect(await screen.findByText('1 preserved legacy aggregate cell exceeds the reported respondent total and requires review.')).toBeInTheDocument();
  });
});
