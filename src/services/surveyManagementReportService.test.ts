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
    expect(html).toContain('Named answers (1)');
    expect(html).toContain('Aggregate answers (4; reported total 5)');
    expect(html).toContain('sources are reported separately and are never summed');
    expect(html).toContain('Useful &amp; clear');
    expect(html).toContain('Person &lt;A&gt;');
    expect(html).not.toContain('authoritative in analytics');
  });
});
