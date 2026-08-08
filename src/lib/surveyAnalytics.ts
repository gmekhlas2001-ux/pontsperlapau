export type SurveyAnalyticsRespondentType = 'student' | 'staff' | 'manual';

export type SurveyResponseStatus = 'completed' | 'incomplete' | 'not_responded';

export type SurveyMatrixCellStatus = SurveyResponseStatus | 'not_assigned';

export interface SurveyRespondentIdentityInput {
  respondent_type: SurveyAnalyticsRespondentType;
  respondent_id: string;
  respondent_name: string;
}

export interface SurveyMatrixSurvey {
  survey_id: string;
  survey_name: string;
  branch_id?: string | null;
}

export interface SurveyAssignmentStatusRow extends SurveyRespondentIdentityInput {
  survey_id: string;
  survey_name?: string;
  branch_id?: string | null;
  branch_name?: string | null;
  response_status: SurveyResponseStatus;
  response_date?: string | null;
  last_activity?: string | null;
}

export interface CrossSurveyMatrixCell {
  surveyId: string;
  surveyName: string;
  assigned: boolean;
  status: SurveyMatrixCellStatus;
  responseDate: string | null;
  lastActivity: string | null;
  assignmentCount: number;
}

export interface CrossSurveyFilterFlags {
  completedAll: boolean;
  missingAny: boolean;
  incomplete: boolean;
  noResponse: boolean;
}

export interface CrossSurveyRespondentMatrixRow {
  identityKey: string;
  respondentType: SurveyAnalyticsRespondentType;
  respondentId: string;
  respondentName: string;
  branchId: string | null;
  branchName: string | null;
  surveys: Record<string, CrossSurveyMatrixCell>;
  completedCount: number;
  incompleteCount: number;
  notRespondedCount: number;
  notAssignedCount: number;
  completionRate: number;
  filters: CrossSurveyFilterFlags;
}

export type CrossSurveyRespondentFilter =
  | 'all'
  | 'completed_all'
  | 'missing_any'
  | 'incomplete'
  | 'no_response';

export interface ManualNameReviewIdentity {
  identityKey: string;
  respondentName: string;
  normalizedNameKey: string;
  respondentIds: string[];
  surveyIds: string[];
}

export type ManualNameReviewMatchType = 'exact_normalized_name' | 'fuzzy_name';

export interface UncertainManualNamePair {
  branchId: string | null;
  branchName: string | null;
  left: ManualNameReviewIdentity;
  right: ManualNameReviewIdentity;
  similarity: number;
  matchType: ManualNameReviewMatchType;
}

export interface ManualNameReviewOptions {
  threshold?: number;
}

/**
 * Fuzzy-name matches below this value are deliberately ignored. Exact
 * normalized names belonging to different manual IDs are always review
 * candidates, never canonical identity evidence.
 */
export const MANUAL_NAME_REVIEW_THRESHOLD = 0.9;

const FORMAT_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/gu;
const JOINING_APOSTROPHES = /['\u2019\u02BC]/gu;
const ARABIC_TATWEEL = /\u0640/gu;
const MARK_CHARACTER = /\p{Mark}/u;
const PUNCTUATION_OR_SYMBOLS = /[\p{Punctuation}\p{Symbol}]+/gu;
const WHITESPACE = /\s+/gu;

// NFKD decomposes letters such as ئ, أ, and آ into a base letter plus one of
// these marks. Unlike vowel/ornamental diacritics, hamza and madda can change a
// name's spelling, so retaining them avoids an unsafe identity merge.
const SEMANTIC_ARABIC_MARKS: ReadonlySet<string> = new Set([
  '\u0653', // maddah above
  '\u0654', // hamza above
  '\u0655', // hamza below
]);

function removeNonSemanticDiacritics(value: string): string {
  return Array.from(value.normalize('NFKD'))
    .filter((character) => !MARK_CHARACTER.test(character) || SEMANTIC_ARABIC_MARKS.has(character))
    .join('');
}

/**
 * Produces a human-readable normalized form while retaining the entered token
 * order. Use {@link respondentNameKey} when comparing names for review.
 */
export function normalizeRespondentName(value: string): string {
  const characterNormalized = value
    .normalize('NFKC')
    .replace(ARABIC_TATWEEL, '')
    .replace(/[\u064A\u0649]/gu, '\u06CC')
    .replace(/\u0643/gu, '\u06A9');

  return removeNonSemanticDiacritics(characterNormalized)
    .toLowerCase()
    .replace(FORMAT_CHARACTERS, '')
    .replace(JOINING_APOSTROPHES, '')
    .replace(PUNCTUATION_OR_SYMBOLS, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
    .normalize('NFC');
}

/**
 * Returns an order-insensitive name-comparison key. A matching key alone is
 * never sufficient to merge two manual respondent IDs.
 */
export function respondentNameKey(value: string): string {
  return normalizeRespondentName(value)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Every respondent is keyed by type and ID. Student and staff IDs are stable
 * people; manual IDs may be survey-local, but keeping each one distinct avoids
 * silently merging different people who happen to share a name.
 */
export function canonicalRespondentIdentity(
  respondent: SurveyRespondentIdentityInput,
): string {
  return `${respondent.respondent_type}:${respondent.respondent_id.trim()}`;
}

export function deriveCrossSurveyFilters(
  cells: readonly CrossSurveyMatrixCell[],
): CrossSurveyFilterFlags {
  const hasSurveys = cells.length > 0;
  const missingStatuses: ReadonlySet<SurveyMatrixCellStatus> = new Set([
    'not_responded',
    'not_assigned',
  ]);

  return {
    completedAll: hasSurveys && cells.every((cell) => cell.status === 'completed'),
    missingAny: cells.some((cell) => missingStatuses.has(cell.status)),
    incomplete: cells.some((cell) => cell.status === 'incomplete'),
    noResponse: hasSurveys && cells.every((cell) => missingStatuses.has(cell.status)),
  };
}

function preferredText(current: string | null, candidate: string | null | undefined): string | null {
  const normalizedCandidate = candidate?.replace(WHITESPACE, ' ').trim() ?? '';
  if (!normalizedCandidate) return current;
  if (!current) return normalizedCandidate;

  const currentLength = normalizeRespondentName(current).replace(WHITESPACE, '').length;
  const candidateLength = normalizeRespondentName(normalizedCandidate).replace(WHITESPACE, '').length;
  if (candidateLength !== currentLength) {
    return candidateLength > currentLength ? normalizedCandidate : current;
  }

  return normalizedCandidate.localeCompare(current) < 0 ? normalizedCandidate : current;
}

function laterTimestamp(current: string | null, candidate: string | null | undefined): string | null {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (Number.isFinite(currentTime) && Number.isFinite(candidateTime)) {
    return candidateTime > currentTime ? candidate : current;
  }

  return candidate.localeCompare(current) > 0 ? candidate : current;
}

const STATUS_PRIORITY: Readonly<Record<SurveyResponseStatus, number>> = {
  not_responded: 0,
  incomplete: 1,
  completed: 2,
};

interface MutableMatrixCell {
  status: SurveyResponseStatus;
  responseDate: string | null;
  lastActivity: string | null;
  assignmentCount: number;
}

interface MutableRespondentGroup {
  identityKey: string;
  respondentType: SurveyAnalyticsRespondentType;
  respondentId: string;
  respondentName: string;
  branchId: string | null;
  branchName: string | null;
  surveyCells: Map<string, MutableMatrixCell>;
}

function uniqueSurveyColumns(
  rows: readonly SurveyAssignmentStatusRow[],
  requestedSurveys?: readonly SurveyMatrixSurvey[],
): SurveyMatrixSurvey[] {
  const sources: readonly SurveyMatrixSurvey[] = requestedSurveys ?? rows.map((row) => ({
    survey_id: row.survey_id,
    survey_name: row.survey_name ?? row.survey_id,
    branch_id: row.branch_id,
  }));
  const surveys = new Map<string, SurveyMatrixSurvey>();

  sources.forEach((survey) => {
    if (!surveys.has(survey.survey_id)) {
      surveys.set(survey.survey_id, {
        ...survey,
        survey_name: survey.survey_name || survey.survey_id,
      });
    }
  });

  return Array.from(surveys.values());
}

/**
 * Builds one respondent row per branch and canonical identity. Duplicate source
 * assignments are collapsed into a single survey cell and exposed through its
 * assignmentCount instead of inflating respondent totals.
 *
 * Pass the complete survey list to make absent assignments visible as
 * `not_assigned`. When omitted, the columns are derived from the supplied rows.
 */
export function buildCrossSurveyRespondentMatrix(
  rows: readonly SurveyAssignmentStatusRow[],
  requestedSurveys?: readonly SurveyMatrixSurvey[],
): CrossSurveyRespondentMatrixRow[] {
  const surveys = uniqueSurveyColumns(rows, requestedSurveys);
  const surveysById = new Map(surveys.map((survey) => [survey.survey_id, survey]));
  const groups = new Map<string, MutableRespondentGroup>();

  rows.forEach((row) => {
    const survey = surveysById.get(row.survey_id);
    if (!survey) return;

    const branchId = row.branch_id ?? survey.branch_id ?? null;
    if (survey.branch_id && branchId !== survey.branch_id) return;

    const identityKey = canonicalRespondentIdentity(row);
    const groupKey = JSON.stringify([branchId, identityKey]);
    let group = groups.get(groupKey);

    if (!group) {
      group = {
        identityKey,
        respondentType: row.respondent_type,
        respondentId: row.respondent_id.trim(),
        respondentName: row.respondent_name.replace(WHITESPACE, ' ').trim(),
        branchId,
        branchName: row.branch_name?.replace(WHITESPACE, ' ').trim() || null,
        surveyCells: new Map(),
      };
      groups.set(groupKey, group);
    } else {
      group.respondentName = preferredText(group.respondentName, row.respondent_name) ?? '';
      group.branchName = preferredText(group.branchName, row.branch_name);
    }

    const currentCell = group.surveyCells.get(row.survey_id);
    if (!currentCell) {
      group.surveyCells.set(row.survey_id, {
        status: row.response_status,
        responseDate: row.response_date ?? null,
        lastActivity: row.last_activity ?? null,
        assignmentCount: 1,
      });
      return;
    }

    currentCell.assignmentCount += 1;
    if (STATUS_PRIORITY[row.response_status] > STATUS_PRIORITY[currentCell.status]) {
      currentCell.status = row.response_status;
    }
    currentCell.responseDate = laterTimestamp(currentCell.responseDate, row.response_date);
    currentCell.lastActivity = laterTimestamp(currentCell.lastActivity, row.last_activity);
  });

  return Array.from(groups.values())
    .map((group): CrossSurveyRespondentMatrixRow => {
      const applicableSurveys = surveys.filter((survey) =>
        !survey.branch_id || survey.branch_id === group.branchId
      );
      const cells = applicableSurveys.map((survey): CrossSurveyMatrixCell => {
        const source = group.surveyCells.get(survey.survey_id);
        return {
          surveyId: survey.survey_id,
          surveyName: survey.survey_name,
          assigned: !!source,
          status: source?.status ?? 'not_assigned',
          responseDate: source?.responseDate ?? null,
          lastActivity: source?.lastActivity ?? null,
          assignmentCount: source?.assignmentCount ?? 0,
        };
      });
      const surveysRecord = Object.fromEntries(cells.map((cell) => [cell.surveyId, cell]));
      const completedCount = cells.filter((cell) => cell.status === 'completed').length;
      const incompleteCount = cells.filter((cell) => cell.status === 'incomplete').length;
      const notRespondedCount = cells.filter((cell) => cell.status === 'not_responded').length;
      const notAssignedCount = cells.filter((cell) => cell.status === 'not_assigned').length;

      return {
        identityKey: group.identityKey,
        respondentType: group.respondentType,
        respondentId: group.respondentId,
        respondentName: group.respondentName,
        branchId: group.branchId,
        branchName: group.branchName,
        surveys: surveysRecord,
        completedCount,
        incompleteCount,
        notRespondedCount,
        notAssignedCount,
        completionRate: cells.length > 0 ? completedCount / cells.length : 0,
        filters: deriveCrossSurveyFilters(cells),
      };
    })
    .sort((left, right) => {
      const branchComparison = (left.branchName ?? left.branchId ?? '').localeCompare(
        right.branchName ?? right.branchId ?? '',
      );
      if (branchComparison !== 0) return branchComparison;

      const nameComparison = respondentNameKey(left.respondentName).localeCompare(
        respondentNameKey(right.respondentName),
      );
      return nameComparison || left.identityKey.localeCompare(right.identityKey);
    });
}

export function matchesCrossSurveyRespondentFilter(
  row: CrossSurveyRespondentMatrixRow,
  filter: CrossSurveyRespondentFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed_all') return row.filters.completedAll;
  if (filter === 'missing_any') return row.filters.missingAny;
  if (filter === 'incomplete') return row.filters.incomplete;
  return row.filters.noResponse;
}

export function filterCrossSurveyRespondents(
  rows: readonly CrossSurveyRespondentMatrixRow[],
  filter: CrossSurveyRespondentFilter,
): CrossSurveyRespondentMatrixRow[] {
  return rows.filter((row) => matchesCrossSurveyRespondentFilter(row, filter));
}

function damerauLevenshteinDistance(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;

  const previousPrevious = new Array<number>(right.length + 1).fill(0);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );

      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        current[rightIndex] = Math.min(current[rightIndex], previousPrevious[rightIndex - 2] + 1);
      }
    }

    for (let index = 0; index < previous.length; index += 1) {
      previousPrevious[index] = previous[index];
    }
    previous = current;
  }

  return previous[right.length];
}

function normalizedSimilarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  return 1 - damerauLevenshteinDistance(left, right) / maxLength;
}

function unmatchedNameTokens(left: readonly string[], right: readonly string[]) {
  const rightRemaining = [...right];
  const leftUnmatched: string[] = [];

  left.forEach((token) => {
    const matchIndex = rightRemaining.indexOf(token);
    if (matchIndex >= 0) rightRemaining.splice(matchIndex, 1);
    else leftUnmatched.push(token);
  });

  return { leftUnmatched, rightUnmatched: rightRemaining };
}

interface MutableManualIdentity extends ManualNameReviewIdentity {
  branchId: string | null;
  branchName: string | null;
}

/**
 * Finds exact-normalized-name and conservative one-token-typo candidates among
 * distinct manual IDs. The result is only a review queue: this function never
 * changes canonical keys or merges matrix rows.
 */
export function findUncertainManualNamePairs(
  rows: readonly SurveyAssignmentStatusRow[],
  options: ManualNameReviewOptions = {},
): UncertainManualNamePair[] {
  const requestedThreshold = options.threshold ?? MANUAL_NAME_REVIEW_THRESHOLD;
  const threshold = Number.isFinite(requestedThreshold)
    ? Math.min(1, Math.max(MANUAL_NAME_REVIEW_THRESHOLD, requestedThreshold))
    : MANUAL_NAME_REVIEW_THRESHOLD;
  const identities = new Map<string, MutableManualIdentity>();

  rows.forEach((row) => {
    if (row.respondent_type !== 'manual') return;
    const normalizedNameKey = respondentNameKey(row.respondent_name);
    if (!normalizedNameKey) return;

    const identityKey = canonicalRespondentIdentity(row);
    const branchId = row.branch_id ?? null;
    const aggregateKey = JSON.stringify([branchId, identityKey]);
    const current = identities.get(aggregateKey);
    if (!current) {
      identities.set(aggregateKey, {
        identityKey,
        respondentName: row.respondent_name.replace(WHITESPACE, ' ').trim(),
        normalizedNameKey,
        respondentIds: [row.respondent_id.trim()],
        surveyIds: [row.survey_id],
        branchId,
        branchName: row.branch_name?.replace(WHITESPACE, ' ').trim() || null,
      });
      return;
    }

    current.respondentName = preferredText(current.respondentName, row.respondent_name) ?? '';
    current.branchName = preferredText(current.branchName, row.branch_name);
    if (!current.respondentIds.includes(row.respondent_id.trim())) {
      current.respondentIds.push(row.respondent_id.trim());
      current.respondentIds.sort();
    }
    if (!current.surveyIds.includes(row.survey_id)) {
      current.surveyIds.push(row.survey_id);
      current.surveyIds.sort();
    }
  });

  const identityList = Array.from(identities.values()).sort((left, right) =>
    (left.branchId ?? '').localeCompare(right.branchId ?? '') ||
    left.normalizedNameKey.localeCompare(right.normalizedNameKey) ||
    left.identityKey.localeCompare(right.identityKey)
  );
  const pairs: UncertainManualNamePair[] = [];

  for (let leftIndex = 0; leftIndex < identityList.length; leftIndex += 1) {
    const left = identityList[leftIndex];
    if (!left) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < identityList.length; rightIndex += 1) {
      const right = identityList[rightIndex];
      if (!right || left.branchId !== right.branchId) continue;

      let similarity: number;
      let matchType: ManualNameReviewMatchType;
      if (left.normalizedNameKey === right.normalizedNameKey) {
        similarity = 1;
        matchType = 'exact_normalized_name';
      } else {
        const leftTokens = left.normalizedNameKey.split(' ');
        const rightTokens = right.normalizedNameKey.split(' ');
        if (leftTokens.length !== rightTokens.length) continue;

        const { leftUnmatched, rightUnmatched } = unmatchedNameTokens(leftTokens, rightTokens);
        if (leftUnmatched.length !== 1 || rightUnmatched.length !== 1) continue;

        const leftChangedToken = leftUnmatched[0] ?? '';
        const rightChangedToken = rightUnmatched[0] ?? '';
        const minimumChangedTokenLength = leftTokens.length === 1 ? 8 : 4;
        if (Math.min(leftChangedToken.length, rightChangedToken.length) < minimumChangedTokenLength) continue;
        if (damerauLevenshteinDistance(leftChangedToken, rightChangedToken) > 1) continue;

        similarity = normalizedSimilarity(left.normalizedNameKey, right.normalizedNameKey);
        if (similarity < threshold) continue;
        matchType = 'fuzzy_name';
      }

      const toPublicIdentity = (identity: MutableManualIdentity): ManualNameReviewIdentity => ({
        identityKey: identity.identityKey,
        respondentName: identity.respondentName,
        normalizedNameKey: identity.normalizedNameKey,
        respondentIds: [...identity.respondentIds],
        surveyIds: [...identity.surveyIds],
      });

      pairs.push({
        branchId: left.branchId,
        branchName: left.branchName ?? right.branchName,
        left: toPublicIdentity(left),
        right: toPublicIdentity(right),
        similarity: Number(similarity.toFixed(4)),
        matchType,
      });
    }
  }

  return pairs.sort((left, right) =>
    right.similarity - left.similarity ||
    left.left.normalizedNameKey.localeCompare(right.left.normalizedNameKey) ||
    left.right.normalizedNameKey.localeCompare(right.right.normalizedNameKey)
  );
}
