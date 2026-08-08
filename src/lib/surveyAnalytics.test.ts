import { describe, expect, it } from 'vitest';
import {
  buildCrossSurveyRespondentMatrix,
  canonicalRespondentIdentity,
  deriveCrossSurveyFilters,
  filterCrossSurveyRespondents,
  findUncertainManualNamePairs,
  normalizeRespondentName,
  respondentNameKey,
  type SurveyAssignmentStatusRow,
  type SurveyMatrixSurvey,
} from './surveyAnalytics';

const surveys: SurveyMatrixSurvey[] = [
  { survey_id: 'survey-1', survey_name: 'Survey 1' },
  { survey_id: 'survey-2', survey_name: 'Survey 2' },
  { survey_id: 'survey-3', survey_name: 'Survey 3' },
];

function assignment(
  overrides: Partial<SurveyAssignmentStatusRow> = {},
): SurveyAssignmentStatusRow {
  return {
    survey_id: 'survey-1',
    survey_name: 'Survey 1',
    branch_id: 'branch-1',
    branch_name: 'Kabul',
    respondent_type: 'student',
    respondent_id: 'student-1',
    respondent_name: 'Ahmad Zia',
    response_status: 'not_responded',
    response_date: null,
    last_activity: null,
    ...overrides,
  };
}

describe('respondent name normalization', () => {
  it('normalizes Unicode, capitalization, punctuation, apostrophes, and whitespace', () => {
    expect(normalizeRespondentName("  MARI\u0301A,\tO\u2019NEILL!!  ")).toBe('maria oneill');
    expect(normalizeRespondentName('María ONeill')).toBe('maria oneill');
  });

  it('normalizes Arabic and Persian yeh and kaf variants plus Arabic diacritics', () => {
    expect(normalizeRespondentName('عَـلِي كَرِيمي')).toBe('علی کریمی');
    expect(normalizeRespondentName('على کریمی')).toBe('علی کریمی');
  });

  it('preserves semantic Arabic hamza and madda while removing vowel marks', () => {
    expect(normalizeRespondentName('رَئِیس')).toBe('رئیس');
    expect(respondentNameKey('رَئِیس')).not.toBe(respondentNameKey('ریس'));
    expect(normalizeRespondentName('آمِنَه')).toBe('آمنه');
    expect(respondentNameKey('آمنه')).not.toBe(respondentNameKey('امنه'));
  });

  it('produces a token-order-insensitive comparison key', () => {
    expect(respondentNameKey('  Zia  Ahmad ')).toBe(respondentNameKey('AHMAD, ZIA'));
    expect(respondentNameKey('Zia Ahmad')).toBe('ahmad zia');
  });
});

describe('canonical respondent identities', () => {
  it('always prefers type and stable ID for students and staff', () => {
    const student = canonicalRespondentIdentity({
      respondent_type: 'student',
      respondent_id: ' person-1 ',
      respondent_name: 'Old Name',
    });
    const renamedStudent = canonicalRespondentIdentity({
      respondent_type: 'student',
      respondent_id: 'person-1',
      respondent_name: 'Completely Different Name',
    });
    const otherStudent = canonicalRespondentIdentity({
      respondent_type: 'student',
      respondent_id: 'person-2',
      respondent_name: 'Old Name',
    });
    const staff = canonicalRespondentIdentity({
      respondent_type: 'staff',
      respondent_id: 'person-1',
      respondent_name: 'Old Name',
    });

    expect(student).toBe('student:person-1');
    expect(renamedStudent).toBe(student);
    expect(otherStudent).not.toBe(student);
    expect(staff).toBe('staff:person-1');
    expect(staff).not.toBe(student);
  });

  it('keeps survey-local manual IDs distinct even when names normalize identically', () => {
    const first = canonicalRespondentIdentity({
      respondent_type: 'manual',
      respondent_id: 'manual-survey-1',
      respondent_name: 'فاطمه کریمی',
    });
    const reordered = canonicalRespondentIdentity({
      respondent_type: 'manual',
      respondent_id: 'manual-survey-2',
      respondent_name: '  كريمي، فاطمه ',
    });

    expect(first).toBe('manual:manual-survey-1');
    expect(reordered).toBe('manual:manual-survey-2');
    expect(reordered).not.toBe(first);
  });
});

describe('cross-survey respondent matrix', () => {
  const rows: SurveyAssignmentStatusRow[] = [
    assignment({ response_status: 'completed', response_date: '2026-08-01T09:00:00Z' }),
    assignment({
      response_status: 'incomplete',
      last_activity: '2026-08-02T10:00:00Z',
      respondent_name: 'AHMAD  ZIA',
      survey_id: 'survey-2',
      survey_name: 'Survey 2',
    }),
    assignment({
      respondent_id: 'student-2',
      respondent_name: 'Mina Rahimi',
      response_status: 'completed',
    }),
    assignment({
      respondent_id: 'student-2',
      respondent_name: 'Mina Rahimi',
      response_status: 'completed',
      survey_id: 'survey-2',
    }),
    assignment({
      respondent_id: 'student-2',
      respondent_name: 'Mina Rahimi',
      response_status: 'completed',
      survey_id: 'survey-3',
    }),
    assignment({
      respondent_type: 'staff',
      respondent_id: 'staff-1',
      respondent_name: 'Farid Noor',
      response_status: 'not_responded',
    }),
    assignment({
      respondent_type: 'staff',
      respondent_id: 'staff-1',
      respondent_name: 'Farid Noor',
      response_status: 'not_responded',
      survey_id: 'survey-2',
    }),
    assignment({
      respondent_type: 'staff',
      respondent_id: 'staff-1',
      respondent_name: 'Farid Noor',
      response_status: 'not_responded',
      survey_id: 'survey-3',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-1',
      respondent_name: 'Fatema Ahmadi',
      response_status: 'completed',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-2',
      respondent_name: 'Ahmadi, Fatema',
      response_status: 'completed',
      survey_id: 'survey-2',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-3',
      respondent_name: 'Fatima Ahmadi',
      response_status: 'completed',
      survey_id: 'survey-3',
    }),
  ];

  it('groups stable student/staff IDs but keeps every manual ID separate', () => {
    const matrix = buildCrossSurveyRespondentMatrix(rows, surveys);
    const ahmad = matrix.find((row) => row.identityKey === 'student:student-1');
    const manualFirst = matrix.find((row) => row.identityKey === 'manual:manual-1');
    const manualExactName = matrix.find((row) => row.identityKey === 'manual:manual-2');
    const manualTypo = matrix.find((row) => row.identityKey === 'manual:manual-3');

    expect(matrix).toHaveLength(6);
    expect(ahmad).toMatchObject({
      completedCount: 1,
      incompleteCount: 1,
      notAssignedCount: 1,
      completionRate: 1 / 3,
      filters: {
        completedAll: false,
        missingAny: true,
        incomplete: true,
        noResponse: false,
      },
    });
    expect(ahmad?.surveys['survey-3']).toMatchObject({
      assigned: false,
      status: 'not_assigned',
      assignmentCount: 0,
    });
    expect(manualFirst?.completedCount).toBe(1);
    expect(manualExactName?.completedCount).toBe(1);
    expect(manualTypo?.completedCount).toBe(1);
    expect(new Set([manualFirst?.identityKey, manualExactName?.identityKey, manualTypo?.identityKey]).size).toBe(3);
  });

  it('collapses duplicate assignment rows without inflating the matrix', () => {
    const matrix = buildCrossSurveyRespondentMatrix([
      assignment({ response_status: 'incomplete', last_activity: '2026-08-01T10:00:00Z' }),
      assignment({
        response_status: 'completed',
        response_date: '2026-08-02T10:00:00Z',
        last_activity: '2026-08-03T10:00:00Z',
      }),
    ], surveys);

    expect(matrix).toHaveLength(1);
    expect(matrix[0]?.surveys['survey-1']).toMatchObject({
      status: 'completed',
      assignmentCount: 2,
      responseDate: '2026-08-02T10:00:00Z',
      lastActivity: '2026-08-03T10:00:00Z',
    });
  });

  it('keeps identical manual names in separate branch matrices', () => {
    const branchSurveys: SurveyMatrixSurvey[] = [
      { survey_id: 'survey-1', survey_name: 'Survey 1', branch_id: 'branch-1' },
      { survey_id: 'survey-4', survey_name: 'Survey 4', branch_id: 'branch-2' },
    ];
    const matrix = buildCrossSurveyRespondentMatrix([
      assignment({ respondent_type: 'manual', respondent_id: 'm-1', respondent_name: 'Nadia Ali' }),
      assignment({
        branch_id: 'branch-2',
        branch_name: 'Herat',
        respondent_type: 'manual',
        respondent_id: 'm-2',
        respondent_name: 'Nadia Ali',
        survey_id: 'survey-4',
      }),
    ], branchSurveys);

    expect(matrix).toHaveLength(2);
    expect(matrix.map((row) => row.branchId)).toEqual(['branch-2', 'branch-1']);
    expect(matrix.every((row) => Object.keys(row.surveys).length === 1)).toBe(true);
  });

  it('derives and applies completed-all, missing-any, incomplete, and no-response filters', () => {
    const matrix = buildCrossSurveyRespondentMatrix(rows, surveys);

    expect(filterCrossSurveyRespondents(matrix, 'completed_all').map((row) => row.respondentName))
      .toEqual(['Mina Rahimi']);
    expect(filterCrossSurveyRespondents(matrix, 'incomplete').map((row) => row.identityKey))
      .toEqual(['student:student-1']);
    expect(filterCrossSurveyRespondents(matrix, 'no_response').map((row) => row.respondentName))
      .toEqual(['Farid Noor']);
    expect(filterCrossSurveyRespondents(matrix, 'missing_any')).toHaveLength(5);
    expect(filterCrossSurveyRespondents(matrix, 'all')).toEqual(matrix);
  });

  it('treats incomplete as activity, while missing means not responded or not assigned', () => {
    expect(deriveCrossSurveyFilters([
      {
        surveyId: 'survey-1',
        surveyName: 'Survey 1',
        assigned: true,
        status: 'incomplete',
        responseDate: null,
        lastActivity: '2026-08-01T10:00:00Z',
        assignmentCount: 1,
      },
    ])).toEqual({
      completedAll: false,
      missingAny: false,
      incomplete: true,
      noResponse: false,
    });
  });

  it('serializes to plain JSON with PDF columns resolved in the requested survey order', () => {
    const matrix = buildCrossSurveyRespondentMatrix([
      assignment({ survey_id: 'survey-2', response_status: 'incomplete' }),
    ], surveys);
    const serialized = JSON.parse(JSON.stringify(matrix)) as typeof matrix;
    const reportStatuses = surveys.map((survey) =>
      serialized[0]?.surveys[survey.survey_id]?.status ?? 'not_assigned'
    );

    expect(serialized).toEqual(matrix);
    expect(reportStatuses).toEqual(['not_assigned', 'incomplete', 'not_assigned']);
  });
});

describe('uncertain manual-name review', () => {
  const reviewRows: SurveyAssignmentStatusRow[] = [
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-1',
      respondent_name: 'Fatema Ahmadi',
      response_status: 'completed',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-2',
      respondent_name: 'Fatima Ahmadi',
      response_status: 'completed',
      survey_id: 'survey-2',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-3',
      respondent_name: 'Ahmadi, FATEMA',
      survey_id: 'survey-3',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-4',
      respondent_name: 'Laila Rahimi',
      survey_id: 'survey-2',
    }),
    assignment({
      respondent_type: 'manual',
      respondent_id: 'manual-5',
      respondent_name: 'Vali Ahmadi',
      survey_id: 'survey-3',
    }),
    assignment({
      respondent_type: 'student',
      respondent_id: 'student-9',
      respondent_name: 'Fatemah Ahmadi',
      survey_id: 'survey-3',
    }),
  ];

  it('flags exact-normalized names and conservative typos without aggregating IDs', () => {
    const candidates = findUncertainManualNamePairs(reviewRows);

    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({
      branchId: 'branch-1',
      matchType: 'exact_normalized_name',
      similarity: 1,
      left: {
        identityKey: 'manual:manual-1',
        respondentIds: ['manual-1'],
        surveyIds: ['survey-1'],
      },
      right: {
        identityKey: 'manual:manual-3',
        respondentIds: ['manual-3'],
        surveyIds: ['survey-3'],
      },
    });
    expect(candidates.filter((candidate) => candidate.matchType === 'fuzzy_name')).toHaveLength(2);
    expect(candidates.slice(1).every((candidate) => candidate.similarity >= 0.9)).toBe(true);
  });

  it('never merges exact-name or fuzzy-name review candidates in the respondent matrix', () => {
    const matrix = buildCrossSurveyRespondentMatrix(reviewRows, surveys);
    const uncertainNames = matrix.filter((row) => ['manual-1', 'manual-2', 'manual-3'].includes(row.respondentId));

    expect(findUncertainManualNamePairs(reviewRows)).toHaveLength(3);
    expect(uncertainNames).toHaveLength(3);
    expect(new Set(uncertainNames.map((row) => row.identityKey)).size).toBe(3);
  });

  it('allows a stricter review threshold but never a less conservative one', () => {
    expect(findUncertainManualNamePairs(reviewRows, { threshold: 0.99 })).toHaveLength(1);
    expect(findUncertainManualNamePairs(reviewRows, { threshold: 0.1 })).toHaveLength(3);
  });
});
