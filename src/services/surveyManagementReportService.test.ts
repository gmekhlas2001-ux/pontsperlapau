import { describe, expect, it } from 'vitest';
import { buildCrossSurveyRespondentMatrix } from '@/lib/surveyAnalytics';
import type { BranchSurveyDashboard } from '@/services/surveyManagementService';
import { buildBranchSurveyManagementReportHtml } from './surveyManagementReportService';

const detail: BranchSurveyDashboard = {
  branch: { id: 'branch-a', name: 'Branch A' },
  surveys: [{
    surveyId: 'survey-a',
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
  }],
  respondents: [{
    assignmentId: 'assignment-a',
    surveyId: 'survey-a',
    surveyCode: 'T1',
    branchId: 'branch-a',
    respondentType: 'manual',
    respondentId: 'person-a',
    respondentName: 'Person <A>',
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
  }],
  questions: [{
    questionId: 'question-a',
    surveyId: 'survey-a',
    surveyCode: 'T1',
    sectionId: null,
    sectionTitle: null,
    question: 'How was it?',
    questionType: 'multiple_choice',
    sentimentEnabled: true,
    required: true,
    orderIndex: 0,
    expected: 1,
    answerCount: null,
    skippedCount: null,
    notStartedCount: 0,
    responseBase: 'mixed',
    denominatorKnown: false,
    namedAnswerCount: 1,
    aggregateAnswerCount: 4,
    aggregateRespondentTotal: 5,
    options: [],
    namedOptions: [{ optionId: 'yes', label: 'Yes', sentiment: 'positive', count: 1 }],
    aggregateOptions: [{ optionId: 'yes', label: 'Yes', sentiment: 'positive', count: 4 }],
    textResponses: [{
      respondentType: 'manual',
      respondentId: 'person-a',
      respondentName: 'Person <A>',
      answer: 'Useful & clear',
      updatedAt: '2026-08-08T10:00:00Z',
    }],
  }],
  dataQuality: {
    additionalSurveys: [],
    duplicateSurveyCodes: [],
    titleBranchMismatches: [],
    orphanedRegisteredAssignments: [],
    mixedResponseSources: [{
      surveyId: 'survey-a',
      surveyCode: 'T1',
      title: 'T1 survey',
      namedAnswerRows: 1,
      positiveAggregateCells: 1,
      aggregateRespondentTotal: 5,
      invalidAggregateCellCount: 1,
    }],
    historicalCompletionRule: 'Historical timestamps are inferred.',
    manualIdentityRule: 'Manual IDs remain separate.',
  },
};

describe('branch survey management report', () => {
  it('includes the complete mixed-source report without merging or trusting one source', () => {
    const matrix = buildCrossSurveyRespondentMatrix([{
      survey_id: 'survey-a',
      survey_name: 'T1',
      branch_id: 'branch-a',
      branch_name: 'Branch A',
      respondent_type: 'manual',
      respondent_id: 'person-a',
      respondent_name: 'Person <A>',
      response_status: 'completed',
      last_activity: '2026-08-08T10:00:00Z',
    }], [{ survey_id: 'survey-a', survey_name: 'T1', branch_id: 'branch-a' }]);

    const html = buildBranchSurveyManagementReportHtml(detail, matrix, []);

    expect(html).toContain('Cross-survey respondent matrix');
    expect(html).toContain('Question-by-question analysis');
    expect(html).toContain('Named respondents answering (1)');
    expect(html).toContain('Aggregate answers (4; reported total 5)');
    expect(html).toContain('sources are reported separately and are never summed');
    expect(html).toContain('Incomplete reporting cycle');
    expect(html).toContain('Completed all six');
    expect(html).toContain('Unavailable');
    expect(html).toContain('1 preserved legacy aggregate cell above the reported respondent total');
    expect(html).toContain('Useful &amp; clear');
    expect(html).toContain('Person &lt;A&gt;');
    expect(html).not.toContain('authoritative in analytics');
  });

  it('labels aggregate checkbox counts as selections and uses the reported respondent total', () => {
    const checkboxDetail: BranchSurveyDashboard = {
      ...detail,
      questions: [{
        ...detail.questions[0],
        questionType: 'checkboxes',
        answerCount: null,
        skippedCount: null,
        notStartedCount: null,
        responseBase: 'aggregate',
        namedAnswerCount: 0,
        aggregateAnswerCount: 3,
        aggregateRespondentTotal: 2,
        options: [
          { optionId: 'yes', label: 'Yes', sentiment: 'positive', count: 2 },
          { optionId: 'sometimes', label: 'Sometimes', sentiment: 'neutral', count: 1 },
        ],
        namedOptions: [],
        aggregateOptions: [
          { optionId: 'yes', label: 'Yes', sentiment: 'positive', count: 2 },
          { optionId: 'sometimes', label: 'Sometimes', sentiment: 'neutral', count: 1 },
        ],
      }],
    };

    const html = buildBranchSurveyManagementReportHtml(checkboxDetail, [], []);

    expect(html).toContain('3 option selections');
    expect(html).not.toContain('3 answered');
    expect(html).toContain('2 (100%)');
    expect(html).toContain('1 (50%)');
    expect(html).toContain('Percentages use the reported respondent total as the denominator.');
  });

  it('reports skipped-after-starting separately from assigned people who never started', () => {
    const namedDetail: BranchSurveyDashboard = {
      ...detail,
      surveys: [{ ...detail.surveys[0], expected: 3, started: 2 }],
      questions: [{
        ...detail.questions[0],
        expected: 3,
        answerCount: 1,
        skippedCount: 1,
        notStartedCount: 1,
        responseBase: 'named',
        namedAnswerCount: 1,
        aggregateAnswerCount: 0,
        aggregateRespondentTotal: null,
        options: [{ optionId: 'yes', label: 'Yes', sentiment: 'positive', count: 1 }],
        namedOptions: [{ optionId: 'yes', label: 'Yes', sentiment: 'positive', count: 1 }],
        aggregateOptions: [],
      }],
    };

    const html = buildBranchSurveyManagementReportHtml(namedDetail, [], []);

    expect(html).toContain('1 answered');
    expect(html).toContain('1 skipped after starting');
    expect(html).toContain('1 not started');
  });
});
