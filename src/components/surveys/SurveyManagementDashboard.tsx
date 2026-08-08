import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Download,
  FileQuestion,
  Filter,
  RefreshCw,
  Search,
  Users,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildCrossSurveyRespondentMatrix,
  filterCrossSurveyRespondents,
  findUncertainManualNamePairs,
  type CrossSurveyRespondentFilter,
  type SurveyAssignmentStatusRow,
} from '@/lib/surveyAnalytics';
import { cn } from '@/lib/utils';
import type { Branch } from '@/services/branchService';
import {
  getBranchSurveyDashboard,
  getSurveyManagementOverview,
  type BranchSurveyDashboard,
  type SurveyManagementOverview,
  type SurveyQuestionAnalytics,
  type SurveyResponseStatus,
} from '@/services/surveyManagementService';

interface SurveyManagementDashboardProps {
  branches: Branch[];
}

type RespondentStatusFilter = 'all' | SurveyResponseStatus;

const MATRIX_FILTERS: { value: CrossSurveyRespondentFilter; label: string }[] = [
  { value: 'all', label: 'All people' },
  { value: 'completed_all', label: 'Completed all' },
  { value: 'missing_any', label: 'Missing one or more' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'no_response', label: 'No response' },
];

const CORE_SURVEY_CODES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const;

function isCheckboxQuestion(questionType: string) {
  return questionType.includes('checkbox');
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusLabel(status: string) {
  if (status === 'not_responded') return 'Not Responded';
  if (status === 'not_assigned') return 'Not Assigned';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusPill({ status }: { status: string }) {
  const Icon = status === 'completed'
    ? CheckCircle2
    : status === 'incomplete'
      ? Clock3
      : status === 'not_responded'
        ? UserX
        : CircleDashed;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
      status === 'completed' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      status === 'incomplete' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      status === 'not_responded' && 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
      status === 'not_assigned' && 'bg-muted text-muted-foreground',
    )}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function metricCard(
  label: string,
  value: string | number,
  description: string,
  icon: typeof Users,
  tone: string,
) {
  const Icon = icon;
  return (
    <Card key={label}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn('rounded-lg p-2.5', tone)}><Icon className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function canonicalSurveyList(data: BranchSurveyDashboard) {
  const byCode = new Map<string, BranchSurveyDashboard['surveys'][number]>();
  data.surveys.forEach((survey) => {
    if (survey.surveyCode && !byCode.has(survey.surveyCode)) byCode.set(survey.surveyCode, survey);
  });
  return Array.from(byCode.values()).sort((a, b) => (a.surveyCode ?? '').localeCompare(b.surveyCode ?? ''));
}

function toAnalyticsRows(data: BranchSurveyDashboard): SurveyAssignmentStatusRow[] {
  const titleById = new Map(data.surveys.map((survey) => [survey.surveyId, survey.title]));
  return data.respondents.map((row) => ({
    survey_id: row.surveyId,
    survey_name: row.surveyCode ?? titleById.get(row.surveyId) ?? row.surveyId,
    branch_id: row.branchId,
    branch_name: data.branch.name,
    respondent_type: row.respondentType,
    respondent_id: row.respondentId,
    respondent_name: row.respondentName,
    response_status: row.responseStatus,
    response_date: row.completedAt,
    last_activity: row.lastActivity,
  }));
}

function withinDateRange(value: string | null, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  if (dateFrom && time < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
  if (dateTo && time > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
  return true;
}

function OptionDistribution({
  title,
  options,
  answerCount,
  questionType,
  respondentDenominator,
  denominatorLabel,
}: {
  title?: string;
  options: SurveyQuestionAnalytics['options'];
  answerCount: number;
  questionType: string;
  respondentDenominator?: number | null;
  denominatorLabel?: string;
}) {
  const optionTotal = options.reduce((sum, option) => sum + option.count, 0);
  const checkboxQuestion = isCheckboxQuestion(questionType);
  if (options.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
      {title && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>}
      {options.map((option) => {
        const denominator = checkboxQuestion ? respondentDenominator : optionTotal || answerCount;
        const percentage = denominator && denominator > 0
          ? Math.round((option.count / denominator) * 100)
          : null;
        return (
          <div key={option.optionId} className="grid gap-1.5 text-sm sm:grid-cols-[minmax(9rem,16rem)_1fr_8.5rem] sm:items-center">
            <span className="truncate font-medium" dir="auto" title={option.label}>{option.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(percentage ?? 0, 100)}%` }} />
            </div>
            <span className="text-right text-xs tabular-nums text-muted-foreground sm:whitespace-nowrap">
              {option.count} {percentage === null ? '(rate unavailable)' : `(${percentage}%)`}
            </span>
          </div>
        );
      })}
      {checkboxQuestion && (
        <p className="text-[11px] text-muted-foreground">
          {respondentDenominator && respondentDenominator > 0
            ? `Percentages use ${denominatorLabel ?? 'respondents'} as the denominator.`
            : 'Percentages are unavailable because no respondent denominator was recorded.'}
        </p>
      )}
    </div>
  );
}

function QuestionCard({ question }: { question: SurveyQuestionAnalytics }) {
  const sourceLabel = question.responseBase === 'named'
    ? 'Named respondent source'
    : question.responseBase === 'aggregate'
      ? 'Aggregate source'
      : question.responseBase === 'mixed'
        ? 'Mixed sources - kept separate'
        : 'No response source';
  return (
    <article className="rounded-xl border bg-background p-4" aria-labelledby={`question-${question.questionId}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{question.surveyCode ?? 'Other'}</Badge>
            {question.sectionTitle && <span>{question.sectionTitle}</span>}
            <span>{question.questionType.replaceAll('_', ' ')}</span>
            <Badge variant={question.responseBase === 'mixed' ? 'destructive' : 'secondary'}>{sourceLabel}</Badge>
            {question.required && <Badge variant="outline">Required</Badge>}
          </div>
          <h3 id={`question-${question.questionId}`} className="mt-2 text-sm font-semibold leading-relaxed" dir="auto">
            {question.question}
          </h3>
        </div>
        <div className="flex shrink-0 gap-2 text-xs">
          <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {question.responseBase === 'mixed'
              ? `${question.namedAnswerCount} named / ${question.aggregateAnswerCount} aggregate`
              : `${question.answerCount ?? 'Unknown'} answered`}
          </span>
          <span className="rounded-md bg-muted px-2 py-1 font-semibold text-muted-foreground">
            {question.skippedCount ?? 'Unknown'} skipped
          </span>
        </div>
      </div>

      {question.responseBase === 'mixed' ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <OptionDistribution title={`Named answers (${question.namedAnswerCount})`} options={question.namedOptions} answerCount={question.namedAnswerCount} questionType={question.questionType} respondentDenominator={question.namedAnswerCount} denominatorLabel="named respondents who answered" />
          <OptionDistribution title={`Aggregate answers (${question.aggregateAnswerCount}; reported total ${question.aggregateRespondentTotal ?? 'unknown'})`} options={question.aggregateOptions} answerCount={question.aggregateAnswerCount} questionType={question.questionType} respondentDenominator={question.aggregateRespondentTotal} denominatorLabel="the reported respondent total" />
        </div>
      ) : (
        <div className="mt-4">
          <OptionDistribution
            options={question.options}
            answerCount={question.answerCount ?? 0}
            questionType={question.questionType}
            respondentDenominator={question.responseBase === 'aggregate'
              ? question.aggregateRespondentTotal
              : question.responseBase === 'named'
                ? question.answerCount
                : null}
            denominatorLabel={question.responseBase === 'aggregate'
              ? 'the reported respondent total'
              : 'named respondents who answered'}
          />
        </div>
      )}

      {question.textResponses.length > 0 && (
        <details className="mt-4 rounded-lg border bg-muted/15 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Written responses ({question.textResponses.length})
          </summary>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {question.textResponses.map((response, index) => (
              <blockquote key={`${response.respondentId}-${index}`} className="rounded-md border bg-background p-3 text-sm">
                <p className="leading-relaxed" dir="auto">{response.answer}</p>
                <footer className="mt-2 text-xs text-muted-foreground">
                  {response.respondentName} - {formatDateTime(response.updatedAt)}
                </footer>
              </blockquote>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

export function SurveyManagementDashboard({ branches }: SurveyManagementDashboardProps) {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [overview, setOverview] = useState<SurveyManagementOverview | null>(null);
  const [detail, setDetail] = useState<BranchSurveyDashboard | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branchId ?? '');
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [respondentSearch, setRespondentSearch] = useState('');
  const [matrixFilter, setMatrixFilter] = useState<CrossSurveyRespondentFilter>('all');
  const [surveyFilter, setSurveyFilter] = useState('all');
  const [responseStatusFilter, setResponseStatusFilter] = useState<RespondentStatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [questionSurveyFilter, setQuestionSurveyFilter] = useState('all');
  const [questionSearch, setQuestionSearch] = useState('');
  const [matrixPage, setMatrixPage] = useState(1);
  const [exportingPdf, setExportingPdf] = useState(false);
  const detailRequest = useRef(0);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError('');
    const result = await getSurveyManagementOverview();
    if (result.success) {
      setOverview(result.data);
      setSelectedBranchId((current) => {
        if (user?.branchId) return user.branchId;
        if (current && result.data.branches.some((branch) => branch.branchId === current)) return current;
        return result.data.branches[0]?.branchId ?? '';
      });
    } else {
      setOverviewError(result.error);
    }
    setLoadingOverview(false);
    return result.success;
  }, [user?.branchId]);

  const loadDetail = useCallback(async (branchId: string) => {
    if (!branchId) {
      detailRequest.current += 1;
      setDetail(null);
      setDetailError('');
      setLoadingDetail(false);
      return false;
    }
    const requestId = ++detailRequest.current;
    setLoadingDetail(true);
    setDetailError('');
    setDetail(null);
    const result = await getBranchSurveyDashboard(branchId);
    if (requestId !== detailRequest.current) return false;
    if (result.success) setDetail(result.data);
    else {
      setDetail(null);
      setDetailError(result.error);
    }
    setLoadingDetail(false);
    return result.success;
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadDetail(selectedBranchId); }, [loadDetail, selectedBranchId]);
  useEffect(() => { setMatrixPage(1); }, [respondentSearch, matrixFilter, surveyFilter, responseStatusFilter, dateFrom, dateTo]);
  useEffect(() => {
    setMatrixPage(1);
    setSurveyFilter('all');
    setResponseStatusFilter('all');
    setQuestionSurveyFilter('all');
  }, [selectedBranchId]);

  const branchOptions = useMemo(() => {
    const source = overview?.branches.length ? overview.branches : branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
    }));
    return [...source].sort((a, b) => a.branchName.localeCompare(b.branchName));
  }, [branches, overview?.branches]);

  useEffect(() => {
    if (!selectedBranchId && branchOptions[0]) setSelectedBranchId(branchOptions[0].branchId);
  }, [branchOptions, selectedBranchId]);

  const canonicalSurveys = useMemo(() => detail ? canonicalSurveyList(detail) : [], [detail]);
  const analyticsRows = useMemo(() => detail ? toAnalyticsRows(detail) : [], [detail]);
  const matrix = useMemo(() => detail ? buildCrossSurveyRespondentMatrix(
    analyticsRows,
    canonicalSurveys.map((survey) => ({
      survey_id: survey.surveyId,
      survey_name: survey.surveyCode ?? survey.title,
      branch_id: detail.branch.id,
    })),
  ) : [], [analyticsRows, canonicalSurveys, detail]);
  const uncertainPairs = useMemo(() => findUncertainManualNamePairs(analyticsRows), [analyticsRows]);

  const filteredMatrix = useMemo(() => {
    const search = respondentSearch.trim().toLocaleLowerCase();
    return filterCrossSurveyRespondents(matrix, matrixFilter).filter((row) => {
      if (search && !`${row.respondentName} ${row.respondentType}`.toLocaleLowerCase().includes(search)) return false;
      const cells = Object.values(row.surveys);
      const relevantCells = surveyFilter === 'all' ? cells : cells.filter((cell) => cell.surveyId === surveyFilter);
      if (surveyFilter !== 'all' && !relevantCells.some((cell) => cell.assigned)) return false;
      if (responseStatusFilter !== 'all' && !relevantCells.some((cell) => cell.status === responseStatusFilter)) return false;
      if ((dateFrom || dateTo) && !relevantCells.some((cell) => withinDateRange(cell.lastActivity ?? cell.responseDate, dateFrom, dateTo))) return false;
      return true;
    });
  }, [dateFrom, dateTo, matrix, matrixFilter, respondentSearch, responseStatusFilter, surveyFilter]);

  const matrixPageSize = 50;
  const matrixPageCount = Math.max(1, Math.ceil(filteredMatrix.length / matrixPageSize));
  const visibleMatrix = filteredMatrix.slice((matrixPage - 1) * matrixPageSize, matrixPage * matrixPageSize);
  useEffect(() => {
    setMatrixPage((page) => Math.min(page, matrixPageCount));
  }, [matrixPageCount]);

  const uniqueParticipants = matrix.filter((row) => !row.filters.noResponse).length;
  const missingCoreCodes = CORE_SURVEY_CODES.filter((code) => (
    !canonicalSurveys.some((survey) => survey.surveyCode === code)
  ));
  const completedAll = canonicalSurveys.length === 6
    ? matrix.filter((row) => row.filters.completedAll).length
    : 0;
  const someSurveys = Math.max(uniqueParticipants - completedAll, 0);
  const selectedBranchSummary = overview?.branches.find((branch) => branch.branchId === selectedBranchId);
  const expectedCoreAssignments = canonicalSurveys.reduce((sum, survey) => sum + survey.expected, 0);
  const completedCoreAssignments = canonicalSurveys.reduce((sum, survey) => sum + survey.completed, 0);
  const missingCoreAssignments = canonicalSurveys.reduce((sum, survey) => sum + survey.notResponded, 0);
  const completionRate = expectedCoreAssignments
    ? completedCoreAssignments / expectedCoreAssignments
    : 0;

  const activityTrend = useMemo(() => {
    const byDay = new Map<string, number>();
    detail?.respondents.forEach((respondent) => {
      const value = respondent.completedAt ?? respondent.lastActivity;
      if (!value || respondent.responseStatus === 'not_responded') return;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    });
    return Array.from(byDay, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [detail?.respondents]);
  const maxTrend = Math.max(1, ...activityTrend.map((item) => item.count));

  const recentResponses = useMemo(() => [...(detail?.respondents ?? [])]
    .filter((respondent) => respondent.lastActivity)
    .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
    .slice(0, 8), [detail?.respondents]);

  const visibleQuestions = useMemo(() => {
    const search = questionSearch.trim().toLocaleLowerCase();
    return (detail?.questions ?? []).filter((question) => {
      if (questionSurveyFilter !== 'all' && question.surveyId !== questionSurveyFilter) return false;
      if (search && !`${question.question} ${question.sectionTitle ?? ''}`.toLocaleLowerCase().includes(search)) return false;
      return true;
    });
  }, [detail?.questions, questionSearch, questionSurveyFilter]);

  const handleRefresh = async () => {
    const [overviewLoaded, detailLoaded] = await Promise.all([loadOverview(), loadDetail(selectedBranchId)]);
    if (overviewLoaded && detailLoaded) toast.success('Survey analytics refreshed');
    else toast.error('Some survey analytics could not be refreshed');
  };

  const handlePdfExport = async () => {
    if (!detail) return;
    setExportingPdf(true);
    try {
      const { exportBranchSurveyManagementPDF } = await import('@/services/surveyManagementReportService');
      await exportBranchSurveyManagementPDF(detail, matrix, uncertainPairs);
      toast.success(`${detail.branch.name} report downloaded`);
    } catch (error) {
      console.error(error);
      toast.error('Branch PDF generation failed');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loadingOverview && !overview) {
    return (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading survey management analytics">
        <span className="sr-only">Loading survey management analytics</span>
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30" role="alert">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
        <h2 className="mt-3 font-semibold">Survey analytics could not load</h2>
        <p className="mt-1 text-sm text-muted-foreground">{overviewError}</p>
        <Button className="mt-4" variant="outline" onClick={() => void loadOverview()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-[minmax(13rem,20rem)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="survey-dashboard-branch">Branch analysis</Label>
            {isSuperadmin ? (
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger id="survey-dashboard-branch" className="min-h-11"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                <SelectContent>
                  {branchOptions.map((branch) => <SelectItem key={branch.branchId} value={branch.branchId}>{branch.branchName}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input id="survey-dashboard-branch" className="min-h-11" value={detail?.branch.name ?? 'Your branch'} disabled />
            )}
          </div>
          {selectedBranchSummary && (
            <p className="pb-2 text-xs text-muted-foreground">
              {selectedBranchSummary.canonicalSurveyCount}/6 core surveys - last activity {formatDateTime(selectedBranchSummary.lastActivity)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant="outline" onClick={() => void handleRefresh()} disabled={loadingOverview || loadingDetail}>
            <RefreshCw className={cn('mr-2 h-4 w-4', (loadingOverview || loadingDetail) && 'animate-spin')} /> Refresh
          </Button>
          <Button className="min-h-11" onClick={() => void handlePdfExport()} disabled={!detail || loadingDetail || exportingPdf}>
            <Download className="mr-2 h-4 w-4" /> {exportingPdf ? 'Building report...' : 'Branch PDF'}
          </Button>
        </div>
      </div>

      {detailError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
          {detailError}
        </div>
      )}
      {overviewError && overview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          The branch comparison could not be refreshed: {overviewError}
        </div>
      )}

      {loadingDetail && !detail ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading branch survey analysis">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div>
      ) : detail ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {metricCard('Tracked participants', uniqueParticipants, 'Stable identities with activity; manual matches remain review-only', Users, 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300')}
            {metricCard('Completed all six', completedAll, 'People completed across every core survey', CheckCircle2, 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')}
            {metricCard('Some surveys', someSurveys, 'Participants missing or incomplete elsewhere', Clock3, 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300')}
            {metricCard('Missing assignments', missingCoreAssignments, 'Core respondent-survey assignments with no activity', UserX, 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300')}
            {metricCard('Completion rate', `${Math.round(completionRate * 100)}%`, 'Completed assignments divided by expected assignments', BarChart3, 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300')}
          </div>

          {(missingCoreCodes.length > 0
            || detail.dataQuality.additionalSurveys.length > 0
            || detail.dataQuality.duplicateSurveyCodes.length > 0
            || detail.dataQuality.titleBranchMismatches.length > 0
            || detail.dataQuality.orphanedRegisteredAssignments.length > 0
            || detail.dataQuality.mixedResponseSources.length > 0
            || uncertainPairs.length > 0) && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="note" aria-labelledby="survey-data-quality-heading">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="space-y-1">
                  <p id="survey-data-quality-heading" className="font-semibold">Data-quality review</p>
                  {missingCoreCodes.length > 0 && <p>Missing core survey {missingCoreCodes.length === 1 ? 'definition' : 'definitions'}: {missingCoreCodes.join(', ')}.</p>}
                  {detail.dataQuality.additionalSurveys.length > 0 && <p>{detail.dataQuality.additionalSurveys.length} additional {detail.dataQuality.additionalSurveys.length === 1 ? 'survey is' : 'surveys are'} excluded from the six-survey matrix.</p>}
                  {detail.dataQuality.duplicateSurveyCodes.length > 0 && <p>Duplicate core survey codes were detected; only the first survey per code is shown in the matrix.</p>}
                  {detail.dataQuality.titleBranchMismatches.length > 0 && <p>{detail.dataQuality.titleBranchMismatches.length} survey {detail.dataQuality.titleBranchMismatches.length === 1 ? 'title references' : 'titles reference'} a different branch and should be reviewed.</p>}
                  {detail.dataQuality.orphanedRegisteredAssignments.length > 0 && <p>{detail.dataQuality.orphanedRegisteredAssignments.length} registered {detail.dataQuality.orphanedRegisteredAssignments.length === 1 ? 'assignment points' : 'assignments point'} to a missing student or staff record. Answers remain preserved.</p>}
                  {detail.dataQuality.mixedResponseSources.length > 0 && <p>{detail.dataQuality.mixedResponseSources.length} {detail.dataQuality.mixedResponseSources.length === 1 ? 'survey contains' : 'surveys contain'} named and positive aggregate answers. Both sources are shown separately and never summed.</p>}
                  {uncertainPairs.length > 0 && <p>{uncertainPairs.length} possible manual-name {uncertainPairs.length === 1 ? 'match requires' : 'matches require'} human review and {uncertainPairs.length === 1 ? 'has' : 'have'} not been merged.</p>}
                  <p className="text-xs opacity-80">{detail.dataQuality.historicalCompletionRule}</p>
                </div>
              </div>
            </div>
          )}

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto p-1 sm:w-fit">
              <TabsTrigger className="min-h-11 shrink-0" value="overview">Overview</TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0" value="respondents">Respondents</TabsTrigger>
              <TabsTrigger className="min-h-11 shrink-0" value="questions">Questions</TabsTrigger>
              {isSuperadmin && <TabsTrigger className="min-h-11 shrink-0" value="branches">All branches</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="m-0 space-y-5">
              <Card>
                <CardHeader><CardTitle className="text-base">Six-survey progress</CardTitle></CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  {CORE_SURVEY_CODES.map((surveyCode) => {
                    const survey = canonicalSurveys.find((candidate) => candidate.surveyCode === surveyCode);
                    if (!survey) {
                      return (
                        <div key={surveyCode} className="rounded-lg border border-dashed bg-muted/15 p-3">
                          <Badge variant="outline">{surveyCode}</Badge>
                          <p className="mt-3 text-sm font-semibold">Survey definition missing</p>
                          <p className="mt-1 text-xs text-muted-foreground">Add this survey to complete the branch's six-survey set.</p>
                        </div>
                      );
                    }
                    const surveyCompletionPercent = Math.round((survey.completionRate ?? 0) * 100);
                    return (
                    <div key={survey.surveyId} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2"><Badge>{survey.surveyCode}</Badge><span className="text-xs text-muted-foreground">{survey.expected} expected</span></div>
                          <p className="mt-2 line-clamp-2 text-sm font-semibold" dir="auto">{survey.title}</p>
                        </div>
                        <span className="text-lg font-bold tabular-nums">{survey.expected > 0 ? `${surveyCompletionPercent}%` : '-'}</span>
                      </div>
                      <Progress className="mt-3" value={(survey.completionRate ?? 0) * 100} aria-label={`${survey.surveyCode}: ${survey.completed} of ${survey.expected} assignments completed, ${surveyCompletionPercent}%`} />
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {survey.expected === 0 && <span className="font-semibold">No target list</span>}
                        <span className="text-emerald-700 dark:text-emerald-300">{survey.completed} completed</span>
                        <span className="text-amber-700 dark:text-amber-300">{survey.incomplete} incomplete</span>
                        <span className="text-rose-700 dark:text-rose-300">{survey.notResponded} not responded</span>
                      </div>
                    </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
                <Card>
                  <CardHeader><CardTitle className="text-base">Response progress over time</CardTitle></CardHeader>
                  <CardContent>
                    {activityTrend.length > 0 ? (
                      <div className="overflow-x-auto pb-1" role="region" aria-label="Scrollable recent response activity chart" tabIndex={0}>
                      <div className="flex h-56 min-w-[34rem] items-end gap-2 border-b border-l px-3 pb-2" role="img" aria-label={`Recent response activity: ${activityTrend.map((item) => `${formatShortDate(item.date)} ${item.count}`).join(', ')}`}>
                        {activityTrend.map((item) => (
                          <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                            <span className="text-[10px] font-semibold">{item.count}</span>
                            <div className="w-full max-w-8 rounded-t bg-primary" style={{ height: `${Math.max(8, (item.count / maxTrend) * 170)}px` }} />
                            <span className="max-w-full truncate text-[10px] text-muted-foreground">{formatShortDate(item.date)}</span>
                          </div>
                        ))}
                      </div>
                      </div>
                    ) : <p className="py-16 text-center text-sm text-muted-foreground">No response activity yet.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Recent responses</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {recentResponses.length > 0 ? recentResponses.map((respondent) => (
                      <div key={respondent.assignmentId} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{respondent.respondentName}</p>
                          <p className="text-xs text-muted-foreground">{respondent.surveyCode ?? 'Other'} - {formatDateTime(respondent.lastActivity)}</p>
                        </div>
                        <StatusPill status={respondent.responseStatus} />
                      </div>
                    )) : <p className="py-12 text-center text-sm text-muted-foreground">No recent responses.</p>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="respondents" className="m-0 space-y-4">
              <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(10rem,13rem))]">
                <div className="space-y-1.5">
                  <Label htmlFor="respondent-search">Search people</Label>
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="respondent-search" className="min-h-11 pl-9" placeholder="Name or type" value={respondentSearch} onChange={(event) => setRespondentSearch(event.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="respondent-participation">Participation</Label><Select value={matrixFilter} onValueChange={(value) => setMatrixFilter(value as CrossSurveyRespondentFilter)}><SelectTrigger id="respondent-participation" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{MATRIX_FILTERS.map((filter) => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="respondent-survey">Survey</Label><Select value={surveyFilter} onValueChange={setSurveyFilter}><SelectTrigger id="respondent-survey" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All core surveys</SelectItem>{canonicalSurveys.map((survey) => <SelectItem key={survey.surveyId} value={survey.surveyId}>{survey.surveyCode}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="respondent-status">Response status</Label><Select value={responseStatusFilter} onValueChange={(value) => setResponseStatusFilter(value as RespondentStatusFilter)}><SelectTrigger id="respondent-status" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="incomplete">Incomplete</SelectItem><SelectItem value="not_responded">Not Responded</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="activity-from">Activity from</Label><Input id="activity-from" className="min-h-11" type="date" max={dateTo || undefined} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="activity-to">Activity to</Label><Input id="activity-to" className="min-h-11" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
                <div className="flex items-end lg:col-span-2"><Button className="min-h-11" variant="ghost" onClick={() => { setRespondentSearch(''); setMatrixFilter('all'); setSurveyFilter('all'); setResponseStatusFilter('all'); setDateFrom(''); setDateTo(''); }}><Filter className="mr-2 h-4 w-4" aria-hidden="true" /> Clear filters</Button></div>
              </div>

              <div className="overflow-x-auto rounded-xl border bg-background" role="region" aria-label="Cross-survey respondent status matrix" tabIndex={0}>
                <table className="min-w-[980px] w-full border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 min-w-44 border-b bg-muted p-3 text-left text-xs font-semibold uppercase tracking-wide sm:min-w-56">Respondent</th>
                      {canonicalSurveys.map((survey) => <th scope="col" key={survey.surveyId} className="min-w-36 border-b p-3 text-center"><span className="font-semibold">{survey.surveyCode}</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">{survey.completed}/{survey.expected} complete</span></th>)}
                      <th scope="col" className="min-w-32 border-b p-3 text-center text-xs font-semibold uppercase tracking-wide">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMatrix.map((row) => (
                      <tr key={`${row.branchId}-${row.identityKey}`} className="border-b hover:bg-muted/20">
                        <th scope="row" className="sticky left-0 z-[1] bg-background p-3 text-left">
                          <p className="font-medium">{row.respondentName}</p>
                          <p className="text-xs capitalize text-muted-foreground">{row.respondentType}</p>
                        </th>
                        {canonicalSurveys.map((survey) => {
                          const cell = row.surveys[survey.surveyId];
                          return <td key={survey.surveyId} className="p-3 text-center"><StatusPill status={cell?.status ?? 'not_assigned'} />{cell?.lastActivity && <span className="mt-1 block text-[10px] text-muted-foreground">{formatShortDate(cell.lastActivity)}</span>}</td>;
                        })}
                        <td className="p-3 text-center"><span className="font-semibold tabular-nums">{row.completedCount}/{canonicalSurveys.length}</span><Progress className="mx-auto mt-2 h-1.5 w-20" value={row.completionRate * 100} aria-label={`${row.respondentName}: ${row.completedCount} of ${canonicalSurveys.length} core surveys completed`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleMatrix.length === 0 && <div className="py-16 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No respondents match these filters.</p></div>}
              </div>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Showing {visibleMatrix.length} of {filteredMatrix.length} people</span>
                <div className="flex items-center gap-2"><Button className="min-h-11" size="sm" variant="outline" disabled={matrixPage <= 1} onClick={() => setMatrixPage((page) => page - 1)}>Previous</Button><span>Page {matrixPage} of {matrixPageCount}</span><Button className="min-h-11" size="sm" variant="outline" disabled={matrixPage >= matrixPageCount} onClick={() => setMatrixPage((page) => page + 1)}>Next</Button></div>
              </div>
            </TabsContent>

            <TabsContent value="questions" className="m-0 space-y-4">
              <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(12rem,16rem)_1fr]">
                <div className="space-y-1.5"><Label htmlFor="question-survey">Survey</Label><Select value={questionSurveyFilter} onValueChange={setQuestionSurveyFilter}><SelectTrigger id="question-survey" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All surveys</SelectItem>{detail.surveys.map((survey) => <SelectItem key={survey.surveyId} value={survey.surveyId}>{survey.surveyCode ?? 'Other'} - {survey.title}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="question-search">Search questions or sections</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="question-search" className="min-h-11 pl-9" value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Search question text" /></div></div>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{visibleQuestions.length} questions</p><p className="text-xs text-muted-foreground">Answered and skipped counts use the expected respondent roster when a denominator is available.</p></div>
              <div className="space-y-3">{visibleQuestions.map((question) => <QuestionCard key={question.questionId} question={question} />)}</div>
              {visibleQuestions.length === 0 && <div className="rounded-xl border py-16 text-center"><FileQuestion className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No questions match these filters.</p></div>}
            </TabsContent>

            {isSuperadmin && (
              <TabsContent value="branches" className="m-0">
                <div className="overflow-x-auto rounded-xl border bg-background" role="region" aria-label="All branches survey completion comparison" tabIndex={0}>
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead className="bg-muted/60"><tr><th scope="col" className="p-3 text-left">Branch</th><th scope="col" className="p-3 text-center">Core surveys</th><th scope="col" className="p-3 text-center">Expected</th><th scope="col" className="p-3 text-center">Completed</th><th scope="col" className="p-3 text-center">Incomplete</th><th scope="col" className="p-3 text-center">Not responded</th><th scope="col" className="p-3 text-center">Rate</th><th scope="col" className="p-3" /></tr></thead>
                    <tbody>{overview?.branches.map((branch) => <tr key={branch.branchId} className={cn('border-t hover:bg-muted/20', branch.branchId === selectedBranchId && 'bg-primary/5')}><th scope="row" className="p-3 text-left font-medium">{branch.branchName}</th><td className="p-3 text-center">{branch.canonicalSurveyCount}/6</td><td className="p-3 text-center tabular-nums">{branch.expectedAssignments || 'No target list'}</td><td className="p-3 text-center tabular-nums text-emerald-700">{branch.completed}</td><td className="p-3 text-center tabular-nums text-amber-700">{branch.incomplete}</td><td className="p-3 text-center tabular-nums text-rose-700">{branch.notResponded}</td><td className="p-3 text-center font-semibold">{branch.expectedAssignments ? `${Math.round((branch.completionRate ?? 0) * 100)}%` : '-'}</td><td className="p-3 text-right"><Button className="min-h-11" size="sm" variant="ghost" onClick={() => setSelectedBranchId(branch.branchId)}>Analyse <ChevronRight className="ml-1 h-4 w-4" /></Button></td></tr>)}</tbody>
                  </table>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
