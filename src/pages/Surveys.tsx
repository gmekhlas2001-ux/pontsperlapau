/**
 * Surveys page.
 *
 * Three-panel flow:
 *  1. SurveyBuilder  — create/edit survey meta, response scale, and questions.
 *  2. DataEntryDialog — branch staff enter per-question response counts.
 *  3. ResultsDialog   — aggregated charts and a per-branch breakdown table.
 *
 * Admins can create/edit/delete surveys; all authenticated users can enter
 * data and view results. The builder is re-used for both create and edit
 * (distinguished by the `existing` prop).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ClipboardList, Plus, Pencil, Trash2, BarChart3, Send, MoveHorizontal as MoreHorizontal,
  CheckCircle2, Clock, FileText, Users, TrendingUp, ChevronUp, ChevronDown,
  Grip, X, Building2, ArrowLeft, FileSpreadsheet, Copy, Search,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getSurveys, getSurveyListStats, getSurveyFull, getSurveyResults, getBranchSubmission,
  createSurvey, updateSurveyMeta, updateSurveyStructure, deleteSurvey, saveBranchData, saveIndividualResponses, getSurveyRespondentOptions,
  addSurveyRespondent, deleteSurveyRespondent, optionsForQuestion,
  type Survey, type SurveyFull, type BranchResult, type SurveyStatus, type Sentiment,
  type SurveyRespondentType, type SurveyRespondentKind, type SurveyQuestionType,
  type SurveyRespondent, type SurveyIndividualResponse, type SurveyLanguage,
} from '@/services/surveyService';
import { getBranches, type Branch } from '@/services/branchService';
import {
  exportSurveyIndividualExcel,
  exportSurveyIndividualPDF,
  exportSurveyResultsExcel,
  exportSurveyResultsPDF,
  type SurveyIndividualExportTarget,
} from '@/services/exportService';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = [
  { label: 'Yes', sentiment: 'positive' as Sentiment },
  { label: 'Very Much', sentiment: 'positive' as Sentiment },
  { label: 'Not Really', sentiment: 'negative' as Sentiment },
  { label: 'Neutral', sentiment: 'neutral' as Sentiment },
  { label: 'Not at All', sentiment: 'negative' as Sentiment },
  { label: 'No Answer', sentiment: 'neutral' as Sentiment },
];

const RESPONSE_SCALE_TEMPLATES = [
  {
    id: 'yes-no',
    label: 'Yes / No',
    options: [
      { label: 'Yes', sentiment: 'positive' as Sentiment },
      { label: 'No', sentiment: 'negative' as Sentiment },
      { label: 'No Answer', sentiment: 'neutral' as Sentiment },
    ],
  },
  {
    id: 'agreement',
    label: 'Agreement',
    options: [
      { label: 'Strongly Agree', sentiment: 'positive' as Sentiment },
      { label: 'Agree', sentiment: 'positive' as Sentiment },
      { label: 'Neither Agree nor Disagree', sentiment: 'neutral' as Sentiment },
      { label: 'Disagree', sentiment: 'negative' as Sentiment },
      { label: 'Strongly Disagree', sentiment: 'negative' as Sentiment },
      { label: 'No Answer', sentiment: 'neutral' as Sentiment },
    ],
  },
  {
    id: 'satisfaction',
    label: 'Satisfaction',
    options: [
      { label: 'Very Satisfied', sentiment: 'positive' as Sentiment },
      { label: 'Satisfied', sentiment: 'positive' as Sentiment },
      { label: 'Neutral', sentiment: 'neutral' as Sentiment },
      { label: 'Unsatisfied', sentiment: 'negative' as Sentiment },
      { label: 'Very Unsatisfied', sentiment: 'negative' as Sentiment },
      { label: 'No Answer', sentiment: 'neutral' as Sentiment },
    ],
  },
  {
    id: 'frequency',
    label: 'Frequency',
    options: [
      { label: 'Always', sentiment: 'positive' as Sentiment },
      { label: 'Often', sentiment: 'positive' as Sentiment },
      { label: 'Sometimes', sentiment: 'neutral' as Sentiment },
      { label: 'Rarely', sentiment: 'negative' as Sentiment },
      { label: 'Never', sentiment: 'negative' as Sentiment },
      { label: 'No Answer', sentiment: 'neutral' as Sentiment },
    ],
  },
  {
    id: 'nps',
    label: '0-10 Rating',
    options: Array.from({ length: 11 }, (_, score) => ({
      label: String(score),
      sentiment: score >= 9 ? 'positive' as Sentiment : score >= 7 ? 'neutral' as Sentiment : 'negative' as Sentiment,
    })),
  },
];

const STATUS_CONFIG: Record<SurveyStatus, { label: string; className: string; icon: React.ElementType }> = {
  draft:  { label: 'Draft',  className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: FileText },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: CheckCircle2 },
  closed: { label: 'Closed', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400', icon: Clock },
};


const PIE_COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#9333ea'];

const SURVEY_LANGUAGE_OPTIONS: Array<{ value: SurveyLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'ca', label: 'Català' },
  { value: 'fa', label: 'دری (Dari)' },
];

/** Sensible default language for a new survey: the current app language, else Dari. */
function defaultSurveyLanguage(): SurveyLanguage {
  const current = (i18n.language || '').split('-')[0];
  return (['en', 'es', 'ca', 'fa'] as const).includes(current as SurveyLanguage)
    ? (current as SurveyLanguage)
    : 'fa';
}

const QUESTION_TYPES: Array<{ value: SurveyQuestionType; label: string; icon: React.ElementType; usesOptions: boolean; placeholder: string }> = [
  { value: 'short_answer', label: 'Short answer', icon: FileText, usesOptions: false, placeholder: 'Short text response' },
  { value: 'paragraph', label: 'Paragraph', icon: FileText, usesOptions: false, placeholder: 'Long text response' },
  { value: 'multiple_choice', label: 'Multiple choice', icon: CheckCircle2, usesOptions: true, placeholder: 'Select one option' },
  { value: 'checkboxes', label: 'Checkboxes', icon: ClipboardList, usesOptions: true, placeholder: 'Select one or more options' },
  { value: 'dropdown', label: 'Dropdown', icon: ChevronDown, usesOptions: true, placeholder: 'Choose from a list' },
  { value: 'linear_scale', label: 'Linear scale', icon: BarChart3, usesOptions: true, placeholder: 'Rate on a scale' },
  { value: 'rating', label: 'Rating', icon: TrendingUp, usesOptions: true, placeholder: 'Star or numeric rating' },
  { value: 'multiple_choice_grid', label: 'Multiple choice grid', icon: Building2, usesOptions: true, placeholder: 'Grid with one answer per row' },
  { value: 'checkbox_grid', label: 'Checkbox grid', icon: Building2, usesOptions: true, placeholder: 'Grid with multiple answers per row' },
  { value: 'date', label: 'Date', icon: Clock, usesOptions: false, placeholder: 'Date response' },
  { value: 'time', label: 'Time', icon: Clock, usesOptions: false, placeholder: 'Time response' },
];

const DEFAULT_QUESTION_OPTIONS: BuilderOption[] = [
  { label: 'Option 1', sentiment: 'neutral' },
  { label: 'Option 2', sentiment: 'neutral' },
];

function questionTypeConfig(type?: SurveyQuestionType) {
  return QUESTION_TYPES.find((item) => item.value === type) ?? QUESTION_TYPES[2];
}

function questionUsesOptions(type?: SurveyQuestionType) {
  return questionTypeConfig(type).usesOptions;
}

function cloneOptions(options: BuilderOption[]) {
  return options.map((option) => ({ label: option.label, sentiment: option.sentiment }));
}

function createBlankQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    text: '',
    sectionIndex: null,
    questionType: 'multiple_choice',
    sentimentEnabled: false,
    options: cloneOptions(DEFAULT_QUESTION_OPTIONS),
    ...overrides,
  };
}

// ─── Survey Builder ───────────────────────────────────────────────────────────

interface BuilderSection { title: string; description: string }
interface BuilderQuestion {
  text: string;
  sectionIndex: number | null;
  questionType?: SurveyQuestionType;
  sentimentEnabled?: boolean;
  options?: BuilderOption[];
}
interface BuilderOption { label: string; sentiment: Sentiment }

interface SurveyBuilderProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: SurveyFull | null;
}

function normalizedBuilderStructure(
  sections: BuilderSection[],
  questions: BuilderQuestion[],
  options: BuilderOption[],
) {
  return {
    sections: sections
      .filter((section) => section.title.trim())
      .map((section) => ({ title: section.title.trim(), description: section.description.trim() || undefined })),
    questions: questions
      .filter((question) => question.text.trim())
      .map((question) => ({
        text: question.text.trim(),
        sectionIndex: question.sectionIndex,
        questionType: question.questionType ?? 'multiple_choice',
        sentimentEnabled: question.sentimentEnabled ?? false,
        options: questionUsesOptions(question.questionType)
          ? (question.options ?? options).filter((option) => option.label.trim()).map((option) => ({
              label: option.label.trim(),
              sentiment: question.sentimentEnabled ? option.sentiment : 'neutral',
            }))
          : [],
      })),
    options: options
      .filter((option) => option.label.trim())
      .map((option) => ({ label: option.label.trim(), sentiment: option.sentiment })),
  };
}

function normalizedExistingStructure(existing: SurveyFull) {
  const orderedSections = [...existing.sections].sort((a, b) => a.order_index - b.order_index);
  const sectionIndexById = new Map(orderedSections.map((section, index) => [section.id, index]));
  const orderedQuestions = [...existing.questions].sort((a, b) => a.order_index - b.order_index);
  const orderedOptions = [...existing.options].sort((a, b) => a.order_index - b.order_index);

  return {
    sections: orderedSections.map((section) => ({
      title: section.title.trim(),
      description: section.description?.trim() || undefined,
    })),
    questions: orderedQuestions.map((question) => ({
      text: question.question_text.trim(),
      sectionIndex: question.section_id ? sectionIndexById.get(question.section_id) ?? null : null,
      questionType: question.question_type ?? 'multiple_choice',
      sentimentEnabled: question.sentiment_enabled ?? false,
      options: questionUsesOptions(question.question_type)
        ? optionsForQuestion(existing, question.id)
            .filter((option) => option.label.trim())
            .map((option) => ({
              label: option.label.trim(),
              sentiment: question.sentiment_enabled ? option.sentiment : 'neutral',
            }))
        : [],
    })),
    options: orderedOptions
      .filter((option) => option.label.trim())
      .map((option) => ({ label: option.label.trim(), sentiment: option.sentiment })),
  };
}

interface SurveyCardStats {
  totalRespondents: number;
  submittedBranches: number;
}

function SurveyBuilder({ open, onClose, onSaved, existing }: SurveyBuilderProps) {
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);

  // Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [status, setStatus] = useState<SurveyStatus>('draft');
  const [language, setLanguage] = useState<SurveyLanguage>('fa');

  // Options (response scale)
  const [options, setOptions] = useState<BuilderOption[]>(DEFAULT_OPTIONS);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionSentiment, setNewOptionSentiment] = useState<Sentiment>('neutral');

  // Sections + Questions
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [questions, setQuestions] = useState<BuilderQuestion[]>([createBlankQuestion()]);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  useEffect(() => {
    if (open) {
      setTab('details');
      if (existing) {
        setTitle(existing.title);
        setDescription(existing.description ?? '');
        setPeriod(existing.period ?? '');
        setSurveyDate(existing.survey_date ?? '');
        setStatus(existing.status);
        setLanguage(existing.language ?? 'fa');
        setOptions(existing.options.map((o) => ({ label: o.label, sentiment: o.sentiment })));
        setSections(existing.sections.map((s) => ({ title: s.title, description: s.description ?? '' })));
        setQuestions(
          existing.questions.length > 0
            ? existing.questions.map((q) => {
                const sec = existing.sections.findIndex((s) => s.id === q.section_id);
                return {
                  text: q.question_text,
                  sectionIndex: sec >= 0 ? sec : null,
                  questionType: q.question_type,
                  sentimentEnabled: q.sentiment_enabled,
                  options: cloneOptions(optionsForQuestion(existing, q.id)),
                };
              })
            : [createBlankQuestion()]
        );
      } else {
        setTitle(''); setDescription(''); setPeriod(''); setSurveyDate(''); setStatus('draft');
        setLanguage(defaultSurveyLanguage());
        setOptions(DEFAULT_OPTIONS);
        setSections([]); setQuestions([createBlankQuestion()]);
      }
    }
  }, [open, existing]);

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = [...questions];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setQuestions(next);
  };

  const moveOption = (idx: number, dir: -1 | 1) => {
    const next = [...options];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setOptions(next);
  };

  const updateQuestion = (index: number, patch: Partial<BuilderQuestion>) => {
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )));
  };

  const updateQuestionOption = (questionIndex: number, optionIndex: number, patch: Partial<BuilderOption>) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const nextOptions = cloneOptions(question.options ?? DEFAULT_QUESTION_OPTIONS);
      nextOptions[optionIndex] = { ...nextOptions[optionIndex], ...patch };
      return { ...question, options: nextOptions };
    }));
  };

  const addQuestionOption = (questionIndex: number) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const nextOptions = cloneOptions(question.options ?? DEFAULT_QUESTION_OPTIONS);
      nextOptions.push({ label: `Option ${nextOptions.length + 1}`, sentiment: 'neutral' });
      return { ...question, options: nextOptions };
    }));
  };

  const removeQuestionOption = (questionIndex: number, optionIndex: number) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const nextOptions = cloneOptions(question.options ?? DEFAULT_QUESTION_OPTIONS).filter((_, itemIndex) => itemIndex !== optionIndex);
      return { ...question, options: nextOptions.length > 0 ? nextOptions : cloneOptions(DEFAULT_QUESTION_OPTIONS) };
    }));
  };

  const applyAnswerBankToQuestion = (questionIndex: number) => {
    updateQuestion(questionIndex, { options: cloneOptions(options.filter((option) => option.label.trim())) });
  };

  const changeQuestionType = (questionIndex: number, questionType: SurveyQuestionType) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      return {
        ...question,
        questionType,
        options: questionUsesOptions(questionType)
          ? cloneOptions(question.options?.length ? question.options : DEFAULT_QUESTION_OPTIONS)
          : [],
      };
    }));
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Survey title is required'); setTab('details'); return; }
    const filledQuestions = questions.filter((q) => q.text.trim());
    if (filledQuestions.length === 0) { toast.error('Add at least one question'); setTab('questions'); return; }
    const missingOptions = filledQuestions.find((q) =>
      questionUsesOptions(q.questionType) && !(q.options ?? options).some((option) => option.label.trim()),
    );
    if (missingOptions) {
      toast.error('Choice questions need at least one answer option');
      setTab('questions');
      return;
    }

    setSaving(true);
    try {
      const structure = normalizedBuilderStructure(sections, filledQuestions, options);
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        period: period.trim() || null,
        surveyDate: surveyDate || null,
        language,
        status,
        ...structure,
      };

      if (existing) {
        const structureChanged = JSON.stringify(structure) !== JSON.stringify(normalizedExistingStructure(existing));
        const res = structureChanged
          ? await updateSurveyStructure(existing.id, payload)
          : await updateSurveyMeta(existing.id, {
              title: payload.title,
              description: payload.description,
              period: payload.period,
              survey_date: payload.surveyDate,
              status: payload.status,
              language: payload.language,
            });
        if (!res.success) { toast.error(res.error); return; }
        toast.success('Survey updated');
      } else {
        const res = await createSurvey({
          ...payload,
          description: payload.description || undefined,
          period: payload.period || undefined,
          surveyDate: payload.surveyDate || undefined,
          branchId: undefined,
          respondentType: 'students',
          respondentIds: [],
        });
        if (!res.success) { toast.error(res.error); return; }
        toast.success('Survey created successfully');
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const questionCount = questions.filter((q) => q.text.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="!fixed !inset-0 !left-0 !top-0 z-50 flex !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none border-0 p-0 shadow-none sm:!max-w-none"
      >
        <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 text-left sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg font-semibold">
                  {existing ? 'Edit Survey' : 'Create Survey'}
                </DialogTitle>
                <DialogDescription className="truncate">
                  {existing ? 'Update the survey details.' : 'Build sections, questions, and response options in one workspace.'}
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close survey builder">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="shrink-0 border-b bg-muted/20 px-4 sm:px-6 lg:px-8">
            <TabsList className="mx-auto flex h-auto w-full max-w-7xl justify-start gap-1 rounded-none bg-transparent p-0">
              <TabsTrigger value="details" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">
                Details
              </TabsTrigger>
              <TabsTrigger value="scale" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">
                Response Scale
              </TabsTrigger>
              <TabsTrigger value="questions" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">
                Questions
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto bg-muted/10">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <p className="mt-1 text-lg font-semibold capitalize">{status}</p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium text-muted-foreground">Response Options</p>
                  <p className="mt-1 text-lg font-semibold">{options.length}</p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium text-muted-foreground">Questions</p>
                  <p className="mt-1 text-lg font-semibold">{questionCount}</p>
                </div>
              </div>

              <div className="rounded-lg border bg-background shadow-sm">
                <TabsContent value="details" className="m-0 space-y-5 p-4 sm:p-6 lg:p-8">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label>Survey Title <span className="text-red-500">*</span></Label>
                        <Input placeholder="e.g. Psychosocial Support Survey 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea rows={6} placeholder="Brief description of this survey's purpose..." value={description} onChange={(e) => setDescription(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-5 rounded-lg border bg-muted/20 p-4">
                      <div className="space-y-2">
                        <Label>Survey Period</Label>
                        <Input placeholder="e.g. December 2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Survey Date</Label>
                        <Input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as SurveyStatus)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Report Language</Label>
                        <Select value={language} onValueChange={(v) => setLanguage(v as SurveyLanguage)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SURVEY_LANGUAGE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">PDF &amp; Excel exports are generated in this language.</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="scale" className="m-0 space-y-5 p-4 sm:p-6 lg:p-8">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">Answer Options</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Define the answer options respondents can choose from and tag each option so results can calculate satisfaction.
                        </p>
                      </div>
                      {options.map((opt, idx) => (
                        <div key={idx} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center">
                          <Grip className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              className="h-9 text-sm"
                              value={opt.label}
                              onChange={(e) => {
                                const next = [...options];
                                next[idx] = { ...next[idx], label: e.target.value };
                                setOptions(next);
                              }}
                            />
                            <Select value={opt.sentiment} onValueChange={(v) => {
                              const next = [...options];
                              next[idx] = { ...next[idx], sentiment: v as Sentiment };
                              setOptions(next);
                            }}>
                              <SelectTrigger className="h-9 w-full text-xs sm:w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="positive">Positive</SelectItem>
                                <SelectItem value="negative">Negative</SelectItem>
                                <SelectItem value="neutral">Neutral</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveOption(idx, -1)} disabled={idx === 0}><ChevronUp className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveOption(idx, 1)} disabled={idx === options.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setOptions(options.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="h-fit rounded-lg border bg-muted/20 p-4">
                      <h3 className="text-sm font-semibold">Add Option</h3>
                      <div className="mt-4 space-y-3">
                        <Input placeholder="New option label..." value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} />
                        <Select value={newOptionSentiment} onValueChange={(v) => setNewOptionSentiment(v as Sentiment)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="positive">Positive</SelectItem>
                            <SelectItem value="negative">Negative</SelectItem>
                            <SelectItem value="neutral">Neutral</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button className="w-full" variant="outline" onClick={() => {
                          if (!newOptionLabel.trim()) return;
                          setOptions([...options, { label: newOptionLabel.trim(), sentiment: newOptionSentiment }]);
                          setNewOptionLabel('');
                        }}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Add Option
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="questions" className="m-0 space-y-6 p-4 sm:p-6 lg:p-8">
                  <section className="rounded-lg border bg-muted/20 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-sm font-semibold">Sections <span className="text-xs font-normal text-muted-foreground">(optional grouping)</span></Label>
                    </div>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                      <Input placeholder="Section title..." value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} />
                      <Button variant="outline" size="sm" onClick={() => {
                        if (!newSectionTitle.trim()) return;
                        setSections([...sections, { title: newSectionTitle.trim(), description: '' }]);
                        setNewSectionTitle('');
                      }}>Add</Button>
                    </div>
                    {sections.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {sections.map((s, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {s.title}
                            <button onClick={() => {
                              setSections(sections.filter((_, j) => j !== i));
                              setQuestions(questions.map((q) => q.sectionIndex === i ? { ...q, sectionIndex: null } : q.sectionIndex !== null && q.sectionIndex > i ? { ...q, sectionIndex: q.sectionIndex - 1 } : q));
                            }}>
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <Separator />

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Questions</h3>
                        <p className="text-xs text-muted-foreground">Edit the question text, type, section, and answer choices.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setQuestions([...questions, createBlankQuestion({ options: cloneOptions(options.filter((option) => option.label.trim())) })])}>
                        <Plus className="mr-2 h-3.5 w-3.5" /> Add Question
                      </Button>
                    </div>

                    {questions.map((q, idx) => {
                      const config = questionTypeConfig(q.questionType);
                      const TypeIcon = config.icon;
                      const optionRows = q.options?.length ? q.options : DEFAULT_QUESTION_OPTIONS;

                      return (
                        <div key={idx} className="rounded-lg border bg-muted/20 p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                            <div className="flex shrink-0 items-center rounded-md border bg-background">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} aria-label="Move question up">
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <span className="min-w-10 text-center text-xs font-semibold text-muted-foreground">Q{idx + 1}</span>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1} aria-label="Move question down">
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-col gap-2 xl:flex-row">
                                <Textarea
                                  rows={2}
                                  placeholder={`Question ${idx + 1}...`}
                                  value={q.text}
                                  onChange={(event) => updateQuestion(idx, { text: event.target.value })}
                                  className="min-h-20 resize-none text-sm"
                                />
                                <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:w-[28rem]">
                                  <Select value={q.questionType ?? 'multiple_choice'} onValueChange={(value) => changeQuestionType(idx, value as SurveyQuestionType)}>
                                    <SelectTrigger className="h-9 bg-background sm:w-56">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {QUESTION_TYPES.map((type) => {
                                        const Icon = type.icon;
                                        return (
                                          <SelectItem key={type.value} value={type.value}>
                                            <span className="flex items-center gap-2">
                                              <Icon className="h-3.5 w-3.5" />
                                              {type.label}
                                            </span>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  {sections.length > 0 && (
                                    <Select
                                      value={q.sectionIndex !== null ? String(q.sectionIndex) : 'none'}
                                      onValueChange={(value) => updateQuestion(idx, { sectionIndex: value === 'none' ? null : Number(value) })}
                                    >
                                      <SelectTrigger className="h-9 bg-background sm:w-44"><SelectValue placeholder="Section" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">No section</SelectItem>
                                        {sections.map((s, i) => <SelectItem key={i} value={String(i)}>{s.title}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500" onClick={() => setQuestions(questions.filter((_, i) => i !== idx))} disabled={questions.length === 1} aria-label="Remove question">
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              {questionUsesOptions(q.questionType) ? (
                                <div className="space-y-3 rounded-lg border bg-background p-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <TypeIcon className="h-4 w-4 shrink-0 text-primary" />
                                      <div>
                                        <p className="text-sm font-semibold">Answer choices</p>
                                        <p className="text-xs text-muted-foreground">{config.placeholder}</p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button type="button" variant="outline" size="sm" onClick={() => applyAnswerBankToQuestion(idx)}>
                                        Use Answer Bank
                                      </Button>
                                      <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-1.5 text-xs font-medium">
                                        <Checkbox
                                          checked={q.sentimentEnabled ?? false}
                                          onCheckedChange={(checked) => updateQuestion(idx, { sentimentEnabled: Boolean(checked) })}
                                        />
                                        Result tags
                                      </label>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    {optionRows.map((option, optionIndex) => (
                                      <div key={optionIndex} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-2 sm:flex-row sm:items-center">
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground">
                                            {optionIndex + 1}
                                          </span>
                                          <Input
                                            className="h-9 text-sm"
                                            placeholder={`Option ${optionIndex + 1}`}
                                            value={option.label}
                                            onChange={(event) => updateQuestionOption(idx, optionIndex, { label: event.target.value })}
                                          />
                                        </div>
                                        {q.sentimentEnabled && (
                                          <Select value={option.sentiment} onValueChange={(value) => updateQuestionOption(idx, optionIndex, { sentiment: value as Sentiment })}>
                                            <SelectTrigger className="h-9 w-full text-xs sm:w-32">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="positive">Positive</SelectItem>
                                              <SelectItem value="neutral">Neutral</SelectItem>
                                              <SelectItem value="negative">Negative</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8 self-end text-red-500 sm:self-auto" onClick={() => removeQuestionOption(idx, optionIndex)} aria-label="Remove option">
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>

                                  <Button type="button" variant="outline" size="sm" onClick={() => addQuestionOption(idx)}>
                                    <Plus className="mr-2 h-3.5 w-3.5" /> Add Option
                                  </Button>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed bg-background p-4">
                                  <p className="text-sm font-medium">{config.label}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">{config.placeholder}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                </TabsContent>
              </div>
            </div>
          </div>
        </Tabs>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-4 py-3 sm:px-6 lg:px-8">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : existing ? 'Save Changes' : 'Create Survey'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SurveyCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [status, setStatus] = useState<SurveyStatus>('draft');
  const [language, setLanguage] = useState<SurveyLanguage>(defaultSurveyLanguage());
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [respondentType, setRespondentType] = useState<SurveyRespondentType>('students');
  const [studentOptions, setStudentOptions] = useState<Array<{ type: 'student'; id: string; name: string; meta?: string }>>([]);
  const [staffOptions, setStaffOptions] = useState<Array<{ type: 'staff'; id: string; name: string; meta?: string }>>([]);
  const [selectedRespondents, setSelectedRespondents] = useState<Array<{ type: SurveyRespondentKind; id: string; name: string }>>([]);
  const [respondentsLoading, setRespondentsLoading] = useState(false);

  const [options, setOptions] = useState<BuilderOption[]>(DEFAULT_OPTIONS);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionSentiment, setNewOptionSentiment] = useState<Sentiment>('neutral');

  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [questions, setQuestions] = useState<BuilderQuestion[]>([createBlankQuestion()]);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const questionCount = questions.filter((q) => q.text.trim()).length;
  const isSuperadmin = user?.role === 'superadmin';
  const visibleStudentOptions = respondentType === 'students' || respondentType === 'students_staff' ? studentOptions : [];
  const visibleStaffOptions = respondentType === 'staff' || respondentType === 'students_staff' ? staffOptions : [];
  const selectedStudentCount = selectedRespondents.filter((r) => r.type === 'student').length;
  const selectedStaffCount = selectedRespondents.filter((r) => r.type === 'staff').length;

  useEffect(() => {
    getBranches().then((res) => {
      if (res.success && res.data) {
        setBranches(res.data);
        setSelectedBranchId((current) => current || res.data?.[0]?.id || '');
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;
    setRespondentsLoading(true);
    setSelectedRespondents([]);
    getSurveyRespondentOptions(selectedBranchId).then((res) => {
      if (res.success) {
        setStudentOptions(res.students);
        setStaffOptions(res.staff);
      } else {
        toast.error(res.error);
      }
      setRespondentsLoading(false);
    });
  }, [selectedBranchId]);

  useEffect(() => {
    setSelectedRespondents((current) => current.filter((respondent) => {
      if (respondentType === 'students') return respondent.type === 'student';
      if (respondentType === 'staff') return respondent.type === 'staff';
      return true;
    }));
  }, [respondentType]);

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = [...questions];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setQuestions(next);
  };

  const moveOption = (idx: number, dir: -1 | 1) => {
    const next = [...options];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setOptions(next);
  };

  const toggleRespondent = (respondent: { type: SurveyRespondentKind; id: string; name: string }) => {
    setSelectedRespondents((current) => {
      const exists = current.some((item) => item.type === respondent.type && item.id === respondent.id);
      if (exists) return current.filter((item) => !(item.type === respondent.type && item.id === respondent.id));
      return [...current, respondent];
    });
  };

  const selectAllVisibleRespondents = () => {
    const visible = [...visibleStudentOptions, ...visibleStaffOptions].map((r) => ({ type: r.type, id: r.id, name: r.name }));
    setSelectedRespondents(visible);
  };

  const updateQuestion = (index: number, patch: Partial<BuilderQuestion>) => {
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )));
  };

  const updateQuestionOption = (questionIndex: number, optionIndex: number, patch: Partial<BuilderOption>) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const nextOptions = cloneOptions(question.options ?? DEFAULT_QUESTION_OPTIONS);
      nextOptions[optionIndex] = { ...nextOptions[optionIndex], ...patch };
      return { ...question, options: nextOptions };
    }));
  };

  const addQuestionOption = (questionIndex: number) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const nextOptions = cloneOptions(question.options ?? DEFAULT_QUESTION_OPTIONS);
      nextOptions.push({ label: `Option ${nextOptions.length + 1}`, sentiment: 'neutral' });
      return { ...question, options: nextOptions };
    }));
  };

  const removeQuestionOption = (questionIndex: number, optionIndex: number) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const nextOptions = cloneOptions(question.options ?? DEFAULT_QUESTION_OPTIONS).filter((_, itemIndex) => itemIndex !== optionIndex);
      return { ...question, options: nextOptions.length > 0 ? nextOptions : cloneOptions(DEFAULT_QUESTION_OPTIONS) };
    }));
  };

  const applyAnswerBankToQuestion = (questionIndex: number) => {
    updateQuestion(questionIndex, { options: cloneOptions(options) });
  };

  const changeQuestionType = (questionIndex: number, questionType: SurveyQuestionType) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      return {
        ...question,
        questionType,
        options: questionUsesOptions(questionType)
          ? cloneOptions(question.options?.length ? question.options : DEFAULT_QUESTION_OPTIONS)
          : [],
      };
    }));
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Survey title is required'); setTab('details'); return; }
    if (!selectedBranchId) { toast.error('Select a branch for this survey'); setTab('details'); return; }
    if (selectedRespondents.length === 0) { toast.error('Select at least one respondent'); setTab('details'); return; }
    const filledQuestions = questions.filter((q) => q.text.trim());
    if (filledQuestions.length === 0) { toast.error('Add at least one question'); setTab('questions'); return; }
    const missingOptions = filledQuestions.find((q) =>
      questionUsesOptions(q.questionType) && !(q.options ?? []).some((option) => option.label.trim()),
    );
    if (missingOptions) {
      toast.error('Choice questions need at least one answer option');
      setTab('questions');
      return;
    }

    setSaving(true);
    try {
      const res = await createSurvey({
        title: title.trim(),
        description: description.trim() || undefined,
        period: period.trim() || undefined,
        surveyDate: surveyDate || undefined,
        branchId: selectedBranchId,
        respondentType,
        respondentIds: selectedRespondents,
        language,
        status,
        sections: sections.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description.trim() || undefined })),
        questions: filledQuestions.map((q) => ({
          text: q.text.trim(),
          sectionIndex: q.sectionIndex,
          questionType: q.questionType ?? 'multiple_choice',
          sentimentEnabled: q.sentimentEnabled ?? false,
          options: questionUsesOptions(q.questionType)
            ? (q.options ?? []).filter((option) => option.label.trim()).map((option) => ({
                label: option.label.trim(),
                sentiment: q.sentimentEnabled ? option.sentiment : 'neutral',
              }))
            : [],
        })),
        options,
      });
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Survey created successfully');
      navigate('/surveys');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/surveys')} aria-label="Back to surveys">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Create Survey</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Build sections, questions, and response options for branch data collection.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/surveys')}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Create Survey'}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md border bg-background p-1 sm:w-fit">
          <TabsTrigger value="details" className="flex-none px-4">Details</TabsTrigger>
          <TabsTrigger value="scale" className="flex-none px-4">Response Scale</TabsTrigger>
          <TabsTrigger value="questions" className="flex-none px-4">Questions</TabsTrigger>
        </TabsList>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <p className="mt-1 text-2xl font-semibold capitalize">{status}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Respondents</p>
            <p className="mt-1 text-2xl font-semibold">{selectedRespondents.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{selectedStudentCount} students, {selectedStaffCount} staff</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Response Options</p>
            <p className="mt-1 text-2xl font-semibold">{options.length}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Questions</p>
            <p className="mt-1 text-2xl font-semibold">{questionCount}</p>
          </div>
        </div>

        <TabsContent value="details" className="m-0">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="space-y-5">
              <div className="space-y-2">
                <Label>Survey Title <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Psychosocial Support Survey 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={8} placeholder="Brief description of this survey's purpose..." value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </section>
            <aside className="space-y-5 rounded-lg border bg-muted/20 p-4">
	              <div className="space-y-2">
	                <Label>Survey Period</Label>
	                <Input placeholder="e.g. December 2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
	              </div>
	              <div className="space-y-2">
	                <Label>Survey Date</Label>
	                <Input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} />
	              </div>
	              <div className="space-y-2">
	                <Label>Branch</Label>
	                {isSuperadmin ? (
	                  <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
	                    <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
	                    <SelectContent>
	                      {branches.map((branch) => (
	                        <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
	                      ))}
	                    </SelectContent>
	                  </Select>
	                ) : (
	                  <Input value={branches.find((branch) => branch.id === selectedBranchId)?.name ?? 'Your branch'} disabled />
	                )}
	              </div>
	              <div className="space-y-2">
	                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as SurveyStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
	              </div>
	              <div className="space-y-2">
	                <Label>Report Language</Label>
	                <Select value={language} onValueChange={(v) => setLanguage(v as SurveyLanguage)}>
	                  <SelectTrigger><SelectValue /></SelectTrigger>
	                  <SelectContent>
	                    {SURVEY_LANGUAGE_OPTIONS.map((option) => (
	                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
	                    ))}
	                  </SelectContent>
	                </Select>
	                <p className="text-xs text-muted-foreground">PDF &amp; Excel exports are generated in this language.</p>
	              </div>
	            </aside>
	          </div>
	          <section className="mt-6 space-y-4 rounded-lg border bg-background p-4">
	            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
	              <div className="space-y-2">
	                <Label>Respondent Group</Label>
	                <Select value={respondentType} onValueChange={(value) => setRespondentType(value as SurveyRespondentType)}>
	                  <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
	                  <SelectContent>
	                    <SelectItem value="students">Students</SelectItem>
	                    <SelectItem value="staff">Staff</SelectItem>
	                    <SelectItem value="students_staff">Students and Staff</SelectItem>
	                  </SelectContent>
	                </Select>
	              </div>
	              <div className="flex gap-2">
	                <Button type="button" variant="outline" onClick={selectAllVisibleRespondents} disabled={respondentsLoading || !selectedBranchId}>
	                  Select All
	                </Button>
	                <Button type="button" variant="ghost" onClick={() => setSelectedRespondents([])}>
	                  Clear
	                </Button>
	              </div>
	            </div>

	            {respondentsLoading ? (
	              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
	                {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 rounded-md" />)}
	              </div>
	            ) : (
	              <div className="grid gap-4 lg:grid-cols-2">
	                {visibleStudentOptions.length > 0 && (
	                  <div className="space-y-2">
	                    <h3 className="text-sm font-semibold">Students</h3>
	                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
	                      {visibleStudentOptions.map((student) => {
	                        const checked = selectedRespondents.some((item) => item.type === 'student' && item.id === student.id);
	                        return (
	                          <label key={student.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
	                            <Checkbox checked={checked} onCheckedChange={() => toggleRespondent({ type: 'student', id: student.id, name: student.name })} />
	                            <span className="min-w-0">
	                              <span className="block truncate text-sm font-medium">{student.name}</span>
	                              {student.meta && <span className="block truncate text-xs text-muted-foreground">{student.meta}</span>}
	                            </span>
	                          </label>
	                        );
	                      })}
	                    </div>
	                  </div>
	                )}
	                {visibleStaffOptions.length > 0 && (
	                  <div className="space-y-2">
	                    <h3 className="text-sm font-semibold">Staff</h3>
	                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
	                      {visibleStaffOptions.map((member) => {
	                        const checked = selectedRespondents.some((item) => item.type === 'staff' && item.id === member.id);
	                        return (
	                          <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
	                            <Checkbox checked={checked} onCheckedChange={() => toggleRespondent({ type: 'staff', id: member.id, name: member.name })} />
	                            <span className="min-w-0">
	                              <span className="block truncate text-sm font-medium">{member.name}</span>
	                              {member.meta && <span className="block truncate text-xs capitalize text-muted-foreground">{member.meta}</span>}
	                            </span>
	                          </label>
	                        );
	                      })}
	                    </div>
	                  </div>
	                )}
	              </div>
	            )}
	          </section>
	        </TabsContent>

	        <TabsContent value="scale" className="m-0">
	          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
	            <section className="space-y-3">
	              <div>
	                <h2 className="text-base font-semibold">Answer Options</h2>
	                <p className="mt-1 text-sm text-muted-foreground">
	                  Define the choices respondents can select and tag each option for result calculations.
	                </p>
	              </div>
	              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
	                {RESPONSE_SCALE_TEMPLATES.map((template) => (
	                  <Button
	                    key={template.id}
	                    type="button"
	                    variant="outline"
	                    className="h-auto justify-start px-3 py-2 text-left"
	                    onClick={() => setOptions(template.options)}
	                  >
	                    {template.label}
	                  </Button>
	                ))}
	              </div>
	              {options.map((opt, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
                  <Grip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      className="h-9 text-sm"
                      value={opt.label}
                      onChange={(e) => {
                        const next = [...options];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setOptions(next);
                      }}
                    />
                    <Select value={opt.sentiment} onValueChange={(v) => {
                      const next = [...options];
                      next[idx] = { ...next[idx], sentiment: v as Sentiment };
                      setOptions(next);
                    }}>
                      <SelectTrigger className="h-9 w-full text-xs sm:w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="positive">Positive</SelectItem>
                        <SelectItem value="negative">Negative</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveOption(idx, -1)} disabled={idx === 0}><ChevronUp className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveOption(idx, 1)} disabled={idx === options.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setOptions(options.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </section>
            <aside className="h-fit space-y-3 rounded-lg border bg-muted/20 p-4">
              <h2 className="text-base font-semibold">Add Option</h2>
              <Input placeholder="New option label..." value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} />
              <Select value={newOptionSentiment} onValueChange={(v) => setNewOptionSentiment(v as Sentiment)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
              <Button className="w-full" variant="outline" onClick={() => {
                if (!newOptionLabel.trim()) return;
                setOptions([...options, { label: newOptionLabel.trim(), sentiment: newOptionSentiment }]);
                setNewOptionLabel('');
              }}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Option
              </Button>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="questions" className="m-0 space-y-5">
          <section className="rounded-lg border bg-muted/20 p-4">
            <Label className="text-sm font-semibold">Sections <span className="text-xs font-normal text-muted-foreground">(optional grouping)</span></Label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Section title..." value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} />
              <Button variant="outline" onClick={() => {
                if (!newSectionTitle.trim()) return;
                setSections([...sections, { title: newSectionTitle.trim(), description: '' }]);
                setNewSectionTitle('');
              }}>Add Section</Button>
            </div>
            {sections.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sections.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {s.title}
                    <button onClick={() => {
                      setSections(sections.filter((_, j) => j !== i));
                      setQuestions(questions.map((q) => q.sectionIndex === i ? { ...q, sectionIndex: null } : q.sectionIndex !== null && q.sectionIndex > i ? { ...q, sectionIndex: q.sectionIndex - 1 } : q));
                    }}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Questions</h2>
                <p className="text-sm text-muted-foreground">Choose a response type for each question and add custom answer choices where needed.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setQuestions([...questions, createBlankQuestion({ options: cloneOptions(options) })])}>
                <Plus className="mr-2 h-3.5 w-3.5" /> Add Question
              </Button>
            </div>
            {questions.map((q, idx) => {
              const config = questionTypeConfig(q.questionType);
              const TypeIcon = config.icon;
              const optionRows = q.options?.length ? q.options : DEFAULT_QUESTION_OPTIONS;

              return (
                <div key={idx} className="rounded-lg border bg-background shadow-sm">
                  <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex items-center rounded-md border bg-muted/40">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} aria-label="Move question up">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-10 text-center text-xs font-semibold text-muted-foreground">Q{idx + 1}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1} aria-label="Move question down">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        <TypeIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{config.label}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Select value={q.questionType ?? 'multiple_choice'} onValueChange={(value) => changeQuestionType(idx, value as SurveyQuestionType)}>
                        <SelectTrigger className="h-9 w-full bg-background sm:w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUESTION_TYPES.map((type) => {
                            const Icon = type.icon;
                            return (
                              <SelectItem key={type.value} value={type.value}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5" />
                                  {type.label}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {sections.length > 0 && (
                        <Select
                          value={q.sectionIndex !== null ? String(q.sectionIndex) : 'none'}
                          onValueChange={(v) => updateQuestion(idx, { sectionIndex: v === 'none' ? null : Number(v) })}
                        >
                          <SelectTrigger className="h-9 w-full bg-background sm:w-44"><SelectValue placeholder="Section" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No section</SelectItem>
                            {sections.map((s, i) => <SelectItem key={i} value={String(i)}>{s.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500" onClick={() => setQuestions(questions.filter((_, i) => i !== idx))} disabled={questions.length === 1} aria-label="Remove question">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <Textarea
                      rows={2}
                      placeholder={`Question ${idx + 1}...`}
                      value={q.text}
                      onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                      className="resize-none text-sm"
                    />

                    {questionUsesOptions(q.questionType) ? (
                      <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Answer choices</p>
                            <p className="text-xs text-muted-foreground">{config.placeholder}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => applyAnswerBankToQuestion(idx)}>
                              Use Answer Bank
                            </Button>
                            <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs font-medium">
                              <Checkbox
                                checked={q.sentimentEnabled ?? false}
                                onCheckedChange={(checked) => updateQuestion(idx, { sentimentEnabled: Boolean(checked) })}
                              />
                              Result tags
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {optionRows.map((option, optionIndex) => (
                            <div key={optionIndex} className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground">
                                  {optionIndex + 1}
                                </span>
                                <Input
                                  className="h-9 text-sm"
                                  placeholder={`Option ${optionIndex + 1}`}
                                  value={option.label}
                                  onChange={(event) => updateQuestionOption(idx, optionIndex, { label: event.target.value })}
                                />
                              </div>
                              {q.sentimentEnabled && (
                                <Select value={option.sentiment} onValueChange={(value) => updateQuestionOption(idx, optionIndex, { sentiment: value as Sentiment })}>
                                  <SelectTrigger className="h-9 w-full text-xs sm:w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="positive">Positive</SelectItem>
                                    <SelectItem value="neutral">Neutral</SelectItem>
                                    <SelectItem value="negative">Negative</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8 self-end text-red-500 sm:self-auto" onClick={() => removeQuestionOption(idx, optionIndex)} aria-label="Remove option">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <Button type="button" variant="outline" size="sm" onClick={() => addQuestionOption(idx)}>
                          <Plus className="mr-2 h-3.5 w-3.5" /> Add Option
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed bg-muted/20 p-4">
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{config.placeholder}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Data Entry Dialog ────────────────────────────────────────────────────────

interface DataEntryProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  survey: SurveyFull;
  branches: Branch[];
  defaultBranchId?: string;
}

type EntryMode = 'individual' | 'aggregate';
type IndividualAnswerValue = string | string[];

const MULTI_ANSWER_TYPES: SurveyQuestionType[] = ['checkboxes', 'checkbox_grid'];

function isMultiAnswerType(type?: SurveyQuestionType) {
  return MULTI_ANSWER_TYPES.includes(type ?? 'multiple_choice');
}

function respondentKey(respondent: Pick<SurveyRespondent, 'respondent_type' | 'respondent_id'>) {
  return `${respondent.respondent_type}:${respondent.respondent_id}`;
}

function isAnswered(value: IndividualAnswerValue | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}

function displayRespondentType(type: SurveyRespondentKind) {
  return type === 'student' ? 'Student' : type === 'staff' ? 'Staff' : 'Manual';
}

function answerTextForResponse(survey: SurveyFull, response: SurveyIndividualResponse) {
  if (response.text_answer) return response.text_answer;
  if (response.option_id) {
    return survey.options.find((option) => option.id === response.option_id)?.label ?? 'Selected option';
  }
  return '';
}

function DataEntryDialog({ open, onClose, onSaved, survey, branches, defaultBranchId }: DataEntryProps) {
  const [entryMode, setEntryMode] = useState<EntryMode>('individual');
  const [branchId, setBranchId] = useState(defaultBranchId ?? '');
  const [totalRespondents, setTotalRespondents] = useState('');
  const [counts, setCounts] = useState<Record<string, Record<string, string>>>({});
  const [individualResponses, setIndividualResponses] = useState<SurveyIndividualResponse[]>([]);
  const [respondents, setRespondents] = useState<SurveyRespondent[]>(survey.respondents);
  const [selectedRespondentKey, setSelectedRespondentKey] = useState('');
  const [individualAnswers, setIndividualAnswers] = useState<Record<string, IndividualAnswerValue>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual respondent form — add a person (name, province, details) directly to
  // this survey when they are not in the student/staff records.
  const [addingRespondent, setAddingRespondent] = useState(false);
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualLastName, setManualLastName] = useState('');
  const [manualProvince, setManualProvince] = useState('');
  const [manualDetails, setManualDetails] = useState('');
  const [savingRespondent, setSavingRespondent] = useState(false);
  const [respondentSearch, setRespondentSearch] = useState('');
  const [respondentToDelete, setRespondentToDelete] = useState<SurveyRespondent | null>(null);
  const [deletingRespondent, setDeletingRespondent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranchId(defaultBranchId ?? branches[0]?.id ?? '');
    setTotalRespondents('');
    setCounts({});
    setIndividualResponses([]);
    setRespondents(survey.respondents);
    setSelectedRespondentKey('');
    setIndividualAnswers({});
    setAddingRespondent(false);
    setManualFirstName('');
    setManualLastName('');
    setManualProvince('');
    setManualDetails('');
    setRespondentSearch('');
    setRespondentToDelete(null);
    setEntryMode('individual');
  }, [open, defaultBranchId, branches, survey.respondents]);

  useEffect(() => {
    if (!branchId || !open) return;
    setLoading(true);
    getBranchSubmission(survey.id, branchId).then(({ submission, responses, individualResponses, error }) => {
      if (error) {
        toast.error(`Failed to load saved responses: ${error}`);
        setLoading(false);
        return;
      }
      setTotalRespondents(submission ? String(submission.total_respondents) : '');
      const c: Record<string, Record<string, string>> = {};
      responses.forEach((r) => {
        if (!c[r.question_id]) c[r.question_id] = {};
        c[r.question_id][r.option_id] = String(r.count);
      });
      setCounts(c);
      setIndividualResponses(individualResponses);
      const branchRespondents = respondents.filter((respondent) => respondent.branch_id === branchId);
      setSelectedRespondentKey((current) => (
        current && branchRespondents.some((respondent) => respondentKey(respondent) === current)
          ? current
          : branchRespondents[0] ? respondentKey(branchRespondents[0]) : ''
      ));
      setLoading(false);
    });
  }, [branchId, open, survey.id, respondents]);

  useEffect(() => {
    if (!open || !branchId) return;
    const branchRespondents = respondents.filter((respondent) => respondent.branch_id === branchId);
    if (branchRespondents.length === 0) setEntryMode('individual');
  }, [branchId, open, respondents]);

  useEffect(() => {
    if (!selectedRespondentKey) {
      setIndividualAnswers({});
      return;
    }
    const selected = respondents.find((respondent) => respondentKey(respondent) === selectedRespondentKey);
    if (!selected) {
      setIndividualAnswers({});
      return;
    }

    const respondentRows = individualResponses.filter((row) =>
      row.respondent_type === selected.respondent_type && row.respondent_id === selected.respondent_id,
    );
    const nextAnswers: Record<string, IndividualAnswerValue> = {};
    survey.questions.forEach((question) => {
      const rows = respondentRows.filter((row) => row.question_id === question.id);
      if (isMultiAnswerType(question.question_type)) {
        nextAnswers[question.id] = rows.map((row) => row.option_id).filter(Boolean) as string[];
      } else if (questionUsesOptions(question.question_type)) {
        nextAnswers[question.id] = rows[0]?.option_id ?? '';
      } else {
        nextAnswers[question.id] = rows[0]?.text_answer ?? '';
      }
    });
    setIndividualAnswers(nextAnswers);
  }, [selectedRespondentKey, individualResponses, survey.questions, respondents]);

  const setCount = (qId: string, oId: string, val: string) => {
    setCounts((prev) => ({ ...prev, [qId]: { ...(prev[qId] ?? {}), [oId]: val } }));
  };

  const setIndividualAnswer = (questionId: string, value: IndividualAnswerValue) => {
    setIndividualAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const toggleMultiAnswer = (questionId: string, optionId: string) => {
    setIndividualAnswers((current) => {
      const selected = Array.isArray(current[questionId]) ? current[questionId] as string[] : [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      return { ...current, [questionId]: next };
    });
  };

  const rowTotal = (qId: string) =>
    optionsForQuestion(survey, qId).reduce((s, o) => s + (parseInt(counts[qId]?.[o.id] ?? '0') || 0), 0);

  const handleAddRespondent = async () => {
    const name = `${manualFirstName.trim()} ${manualLastName.trim()}`.trim();
    if (!name) { toast.error('Enter a first or last name'); return; }
    if (!branchId) { toast.error('Select a branch first'); return; }
    const detail = [manualProvince.trim(), manualDetails.trim()].filter(Boolean).join(' · ');
    setSavingRespondent(true);
    try {
      const res = await addSurveyRespondent(survey.id, branchId, name, detail || undefined);
      if (!res.success || !res.respondent) { toast.error(res.error ?? 'Failed to add person'); return; }
      const added = res.respondent;
      setRespondents((current) => [...current, added]);
      setEntryMode('individual');
      setSelectedRespondentKey(respondentKey(added));
      setManualFirstName('');
      setManualLastName('');
      setManualProvince('');
      setManualDetails('');
      setAddingRespondent(false);
      toast.success('Person added');
    } finally {
      setSavingRespondent(false);
    }
  };

  const handleDeleteRespondent = async () => {
    if (!respondentToDelete || respondentToDelete.respondent_type !== 'manual') return;
    setDeletingRespondent(true);
    try {
      const deletedKey = respondentKey(respondentToDelete);
      const res = await deleteSurveyRespondent(survey.id, respondentToDelete.branch_id, respondentToDelete.id);
      if (!res.success) { toast.error(res.error ?? 'Failed to delete person'); return; }

      const remaining = respondents.filter((respondent) => respondent.id !== respondentToDelete.id);
      setRespondents(remaining);
      setIndividualResponses((current) => current.filter((response) => (
        response.respondent_type !== respondentToDelete.respondent_type ||
        response.respondent_id !== respondentToDelete.respondent_id
      )));
      if (selectedRespondentKey === deletedKey) {
        const next = remaining.find((respondent) => respondent.branch_id === branchId);
        setSelectedRespondentKey(next ? respondentKey(next) : '');
      }
      setRespondentToDelete(null);
      toast.success('Person deleted');
    } finally {
      setDeletingRespondent(false);
    }
  };

  const handleSave = async () => {
    if (!branchId) { toast.error('Please select a branch'); return; }
    const branchRespondents = respondents.filter((respondent) => respondent.branch_id === branchId);
    const selectedRespondent = branchRespondents.find((respondent) => respondentKey(respondent) === selectedRespondentKey);

    setSaving(true);
    try {
      if (entryMode === 'individual') {
        if (!selectedRespondent) { toast.error('Select a respondent'); return; }
        const answers = survey.questions.map((question) => {
          const value = individualAnswers[question.id];
          if (isMultiAnswerType(question.question_type)) {
            return { questionId: question.id, optionIds: Array.isArray(value) ? value : [] };
          }
          if (questionUsesOptions(question.question_type)) {
            return { questionId: question.id, optionId: typeof value === 'string' ? value : null };
          }
          return { questionId: question.id, textAnswer: typeof value === 'string' ? value : null };
        });
        const res = await saveIndividualResponses(
          survey.id,
          branchId,
          { type: selectedRespondent.respondent_type, id: selectedRespondent.respondent_id, name: selectedRespondent.respondent_name },
          answers,
        );
        if (!res.success) { toast.error(res.error); return; }
        const latest = await getBranchSubmission(survey.id, branchId);
        if (latest.error) {
          toast.error(`Responses were saved, but could not be reloaded: ${latest.error}`);
          return;
        }
        setIndividualResponses(latest.individualResponses);
        setTotalRespondents(latest.submission ? String(latest.submission.total_respondents) : totalRespondents);
        toast.success('Individual response saved');
        onSaved();
        onClose();
        return;
      }

      const total = parseInt(totalRespondents) || 0;
      const flatCounts = survey.questions.flatMap((q) =>
        optionsForQuestion(survey, q.id).map((o) => ({ questionId: q.id, optionId: o.id, count: parseInt(counts[q.id]?.[o.id] ?? '0') || 0 }))
      );
      const res = await saveBranchData(survey.id, branchId, total, flatCounts);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Aggregate data saved');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedBranch = branches.find((b) => b.id === branchId);
  const branchRespondents = respondents.filter((respondent) => respondent.branch_id === branchId);
  const normalizedRespondentSearch = respondentSearch.trim().toLocaleLowerCase();
  const filteredBranchRespondents = branchRespondents.filter((respondent) => (
    !normalizedRespondentSearch ||
    respondent.respondent_name.toLocaleLowerCase().includes(normalizedRespondentSearch) ||
    (respondent.respondent_detail ?? '').toLocaleLowerCase().includes(normalizedRespondentSearch) ||
    displayRespondentType(respondent.respondent_type).toLocaleLowerCase().includes(normalizedRespondentSearch)
  ));
  const selectedRespondent = branchRespondents.find((respondent) => respondentKey(respondent) === selectedRespondentKey);
  const respondentsNum = parseInt(totalRespondents) || 0;

  const aggregateFilledCount = survey.questions.filter((q) => rowTotal(q.id) > 0).length;
  const individualFilledCount = survey.questions.filter((q) => isAnswered(individualAnswers[q.id])).length;
  const filledCount = entryMode === 'individual' ? individualFilledCount : aggregateFilledCount;
  const completionPct = survey.questions.length > 0 ? Math.round((filledCount / survey.questions.length) * 100) : 0;
  const maxOptionCount = Math.max(1, ...survey.questions.map((question) => optionsForQuestion(survey, question.id).length));
  const respondentProgress = (respondent: SurveyRespondent) => {
    const rows = individualResponses.filter((row) =>
      row.respondent_type === respondent.respondent_type && row.respondent_id === respondent.respondent_id,
    );
    return new Set(rows.map((row) => row.question_id)).size;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="!fixed !inset-0 !left-0 !top-0 z-50 flex !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none border-0 p-0 shadow-none sm:!max-w-none"
      >
        <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 text-left sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg font-semibold">Enter Survey Data</DialogTitle>
                <DialogDescription className="truncate">
                  {survey.title}{survey.period ? <span className="mx-1.5 opacity-40">·</span> : ''}{survey.period}
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close data entry">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-7xl gap-3 lg:grid-cols-[18rem_1fr_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-3 w-3" /> Branch
              </Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={entryMode === 'individual' ? 'default' : 'outline'}
                onClick={() => setEntryMode('individual')}
              >
                <Users className="mr-2 h-4 w-4" />
                Individual Responses
              </Button>
              <Button
                type="button"
                variant={entryMode === 'aggregate' ? 'default' : 'outline'}
                onClick={() => setEntryMode('aggregate')}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Aggregate Counts
              </Button>
            </div>

            <div className={cn(
              'flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold',
              completionPct === 100 ? 'border-emerald-200 text-emerald-700' : 'text-muted-foreground',
            )}>
              <span className={cn('h-2 w-2 rounded-full', completionPct === 100 ? 'bg-emerald-500' : 'bg-slate-400')} />
              {filledCount}/{survey.questions.length} answered
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/10">
          {loading ? (
            <div className="mx-auto w-full max-w-7xl space-y-3 p-4 sm:p-6 lg:p-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-background p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(maxOptionCount, 6)}, minmax(0, 1fr))` }}>
                    {Array.from({ length: maxOptionCount }).map((_, j) => <Skeleton key={j} className="h-16 rounded-lg" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : entryMode === 'individual' ? (
            <div className="mx-auto grid w-full max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:p-8">
              <aside className="h-fit rounded-lg border bg-background">
                <div className="flex items-start justify-between gap-2 border-b p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Respondents</p>
                    <p className="text-xs text-muted-foreground">{branchRespondents.length} for this branch</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setAddingRespondent((value) => !value)}
                    disabled={!branchId}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add person
                  </Button>
                </div>
                {addingRespondent && (
                  <div className="space-y-2 border-b bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      Add a person manually for this survey. They are not saved to the student or staff records.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="First name"
                        value={manualFirstName}
                        onChange={(e) => setManualFirstName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRespondent(); } }}
                      />
                      <Input
                        placeholder="Last name"
                        value={manualLastName}
                        onChange={(e) => setManualLastName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRespondent(); } }}
                      />
                    </div>
                    <Input
                      placeholder="Province"
                      value={manualProvince}
                      onChange={(e) => setManualProvince(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRespondent(); } }}
                    />
                    <Input
                      placeholder="Other details (optional)"
                      value={manualDetails}
                      onChange={(e) => setManualDetails(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRespondent(); } }}
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1" onClick={handleAddRespondent} disabled={savingRespondent}>
                        {savingRespondent ? 'Adding...' : 'Add person'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddingRespondent(false);
                          setManualFirstName('');
                          setManualLastName('');
                          setManualProvince('');
                          setManualDetails('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <div className="border-b p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={respondentSearch}
                      onChange={(event) => setRespondentSearch(event.target.value)}
                      placeholder="Search respondents..."
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
                <div className="max-h-[62vh] space-y-1 overflow-y-auto p-2">
                  {branchRespondents.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      No students or staff were assigned to this survey branch. Use “Add person” to enter someone manually.
                    </div>
                  ) : filteredBranchRespondents.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No respondents match your search.</div>
                  ) : filteredBranchRespondents.map((respondent) => {
                    const key = respondentKey(respondent);
                    const progress = respondentProgress(respondent);
                    return (
                      <div
                        key={respondent.id}
                        className={cn(
                          'flex w-full items-center rounded-md border transition-colors',
                          selectedRespondentKey === key ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted/50',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedRespondentKey(key)}
                          className="min-w-0 flex-1 px-3 py-2 text-left"
                        >
                          <span className="block truncate text-sm font-medium">{respondent.respondent_name}</span>
                          <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">
                              {displayRespondentType(respondent.respondent_type)}
                              {respondent.respondent_detail ? ` · ${respondent.respondent_detail}` : ''}
                            </span>
                            <span className="shrink-0">{progress}/{survey.questions.length}</span>
                          </span>
                        </button>
                        {respondent.respondent_type === 'manual' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mr-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setRespondentToDelete(respondent)}
                            aria-label={`Delete ${respondent.respondent_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </aside>

              <AlertDialog open={!!respondentToDelete} onOpenChange={(value) => { if (!value && !deletingRespondent) setRespondentToDelete(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this person?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {respondentToDelete?.respondent_name} and their recorded answers will be permanently removed from this survey. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingRespondent}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(event) => { event.preventDefault(); handleDeleteRespondent(); }}
                      disabled={deletingRespondent}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deletingRespondent ? 'Deleting...' : 'Delete person'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <section className="space-y-3">
                {selectedRespondent ? (
                  <>
                    <div className="rounded-lg border bg-background p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recording for</p>
                      <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-lg font-semibold">{selectedRespondent.respondent_name}</p>
                        <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                          {displayRespondentType(selectedRespondent.respondent_type)}
                        </span>
                      </div>
                      {selectedRespondent.respondent_detail && (
                        <p className="mt-1 text-sm text-muted-foreground">{selectedRespondent.respondent_detail}</p>
                      )}
                    </div>

                    {survey.questions.map((question, index) => {
                      const config = questionTypeConfig(question.question_type);
                      const questionOptions = optionsForQuestion(survey, question.id);
                      const value = individualAnswers[question.id];
                      const multi = isMultiAnswerType(question.question_type);

                      return (
                        <div key={question.id} className="rounded-lg border bg-background p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-relaxed">{question.question_text}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{config.label}</p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {questionUsesOptions(question.question_type) ? (
                              question.question_type === 'dropdown' ? (
                                <Select
                                  value={typeof value === 'string' ? value : ''}
                                  onValueChange={(next) => setIndividualAnswer(question.id, next)}
                                >
                                  <SelectTrigger className="bg-background">
                                    <SelectValue placeholder="Choose an answer" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {questionOptions.map((option) => (
                                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                questionOptions.map((option) => {
                                  const selected = multi
                                    ? Array.isArray(value) && value.includes(option.id)
                                    : value === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => multi ? toggleMultiAnswer(question.id, option.id) : setIndividualAnswer(question.id, option.id)}
                                      className={cn(
                                        'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                                        selected ? 'border-primary bg-primary/10 text-foreground' : 'bg-background hover:bg-muted/40',
                                      )}
                                    >
                                      {multi ? (
                                        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
                                          {selected && <CheckCircle2 className="h-3 w-3" />}
                                        </span>
                                      ) : (
                                        <span className={cn('h-4 w-4 rounded-full border', selected ? 'border-primary bg-primary shadow-[inset_0_0_0_4px_hsl(var(--background))]' : 'border-muted-foreground/50')} />
                                      )}
                                      <span className="min-w-0 flex-1 break-words">{option.label}</span>
                                    </button>
                                  );
                                })
                              )
                            ) : question.question_type === 'paragraph' ? (
                              <Textarea
                                rows={4}
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) => setIndividualAnswer(question.id, event.target.value)}
                                placeholder="Write the response..."
                              />
                            ) : question.question_type === 'date' ? (
                              <Input
                                type="date"
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) => setIndividualAnswer(question.id, event.target.value)}
                              />
                            ) : question.question_type === 'time' ? (
                              <Input
                                type="time"
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) => setIndividualAnswer(question.id, event.target.value)}
                              />
                            ) : (
                              <Input
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) => setIndividualAnswer(question.id, event.target.value)}
                                placeholder="Short answer"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="rounded-lg border bg-background p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">No respondent selected</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Choose a respondent from the list or use Add person to create a manual respondent for this branch.</p>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-7xl space-y-3 p-4 sm:p-6 lg:p-8">
              <div className="rounded-lg border bg-background p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_14rem] sm:items-end">
                  <div>
                    <p className="text-sm font-semibold">Aggregate branch counts</p>
                    <p className="text-sm text-muted-foreground">Use this when you only know totals by answer option, not the named respondent choices.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                      <Users className="h-3 w-3" /> Total Respondents
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="h-10 text-center text-base font-semibold tabular-nums"
                      value={totalRespondents}
                      onChange={(e) => setTotalRespondents(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {survey.questions.map((q, qi) => {
              const questionOptions = optionsForQuestion(survey, q.id);
              const total = rowTotal(q.id);
              const over = respondentsNum > 0 && total > respondentsNum;
              const exact = respondentsNum > 0 && total === respondentsNum;

              return (
                <div
                  key={q.id}
                  className={cn(
                    'rounded-lg border bg-background transition-colors',
                    over ? 'border-red-300 dark:border-red-800 shadow-sm shadow-red-100 dark:shadow-red-950/20'
                      : exact ? 'border-emerald-300 dark:border-emerald-800'
                      : 'border-border hover:border-border/80'
                  )}
                >
                  <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                    <span className={cn(
                      'shrink-0 h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center mt-0.5',
                      over ? 'bg-red-100 text-red-600 dark:bg-red-900/40'
                        : exact ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40'
                        : 'bg-primary/10 text-primary'
                    )}>
                      {qi + 1}
                    </span>
                    <p className="text-sm font-medium leading-snug flex-1">{q.question_text}</p>
                    <div className={cn(
                      'shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums',
                      over ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                        : exact ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : total > 0 ? 'bg-muted text-muted-foreground'
                        : 'bg-muted/50 text-muted-foreground/50'
                    )}>
                      {over && '! '}
                      {total}{respondentsNum > 0 ? ` / ${respondentsNum}` : ''}
                    </div>
                  </div>

                  <div className="px-4 pb-3">
                    {questionOptions.length === 0 ? (
                      <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                        This question type is collected in Individual Responses mode.
                      </div>
                    ) : (
                      <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(${Math.min(questionOptions.length || 1, 6)}, minmax(0, 1fr))` }}
                      >
                        {questionOptions.map((opt) => {
                          const val = counts[q.id]?.[opt.id] ?? '';
                          const num = parseInt(val) || 0;
                          return (
                            <div
                              key={opt.id}
                              className={cn(
                                'flex flex-col items-center gap-1.5 rounded-lg border bg-muted/20 p-2.5 transition-colors',
                                num > 0 ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40'
                              )}
                            >
                              <span className="text-center text-[11px] font-semibold leading-tight line-clamp-2">
                                {opt.label}
                              </span>
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={val}
                                onChange={(e) => setCount(q.id, opt.id, e.target.value)}
                                className={cn(
                                  'w-full h-9 rounded-md border bg-background text-center text-base font-bold tabular-nums',
                                  'outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0',
                                  'placeholder:text-muted-foreground/30',
                                  num > 0 ? 'text-foreground' : 'text-muted-foreground'
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selectedBranch && (
              <>
                <Building2 className="h-3.5 w-3.5" />
                <span className="font-medium">{selectedBranch.name}</span>
                {entryMode === 'individual' && selectedRespondent && <span className="opacity-60">- {selectedRespondent.respondent_name}</span>}
                {entryMode === 'aggregate' && respondentsNum > 0 && <span className="opacity-60">- {respondentsNum} respondents</span>}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || loading} className="min-w-[100px]">
              {saving ? (
                <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</span>
              ) : (
                <span className="flex items-center gap-2"><Send className="h-3.5 w-3.5" />Save Data</span>
              )}
            </Button>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Results Dialog ───────────────────────────────────────────────────────────

function ResultsDialog({ open, onClose, survey }: { open: boolean; onClose: () => void; survey: SurveyFull }) {
  const [results, setResults] = useState<BranchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportingGeneralPdf, setExportingGeneralPdf] = useState(false);
  const [exportingGeneralExcel, setExportingGeneralExcel] = useState(false);
  const [exportingIndividualPdf, setExportingIndividualPdf] = useState(false);
  const [exportingIndividualExcel, setExportingIndividualExcel] = useState(false);
  const [selectedExportTargetKey, setSelectedExportTargetKey] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getSurveyResults(survey.id).then((res) => {
      if (res.success && res.data) setResults(res.data);
      setLoading(false);
    });
  }, [open, survey.id]);

  const totalRespondents = results.reduce((s, b) => s + b.totalRespondents, 0);
  const submittedBranches = results.filter((b) => b.submitted).length;

  const hasSentimentAnalytics = survey.questions.some((question) => question.sentiment_enabled);

  // Aggregate per question across all branches
  const questionAggregates = survey.questions.map((q) => {
    let positiveTotal = 0, negativeTotal = 0, neutralTotal = 0, grandTotal = 0;
    const optionTotals = new Map<string, { label: string; count: number }>();
    results.forEach((b) => {
      const qr = b.questionResults.find((r) => r.questionId === q.id);
      if (!qr) return;
      qr.counts.forEach((c) => {
        grandTotal += c.count;
        const current = optionTotals.get(c.optionId) ?? { label: c.label, count: 0 };
        current.count += c.count;
        optionTotals.set(c.optionId, current);
        if (c.sentiment === 'positive') positiveTotal += c.count;
        else if (c.sentiment === 'negative') negativeTotal += c.count;
        else neutralTotal += c.count;
      });
    });
    return {
      question: q,
      positiveRate: grandTotal > 0 ? positiveTotal / grandTotal : 0,
      negativeRate: grandTotal > 0 ? negativeTotal / grandTotal : 0,
      neutralRate: grandTotal > 0 ? neutralTotal / grandTotal : 0,
      grandTotal,
      optionCounts: Array.from(optionTotals.values()),
    };
  });

  const avgSatisfaction = questionAggregates.length > 0
    ? questionAggregates.reduce((s, q) => s + q.positiveRate, 0) / questionAggregates.length
    : 0;

  const optionDistribution = Array.from(
    questionAggregates
      .flatMap((question) => question.optionCounts)
      .reduce((map, option) => {
        map.set(option.label, (map.get(option.label) ?? 0) + option.count);
        return map;
      }, new Map<string, number>()),
    ([name, value]) => ({ name, value }),
  ).sort((a, b) => b.value - a.value).slice(0, 8);

  const pieData = hasSentimentAnalytics
    ? [
        { name: 'Positive', value: Math.round(avgSatisfaction * 100) },
        { name: 'Negative', value: Math.round(questionAggregates.reduce((s, q) => s + q.negativeRate, 0) / (questionAggregates.length || 1) * 100) },
        { name: 'Neutral', value: Math.round(questionAggregates.reduce((s, q) => s + q.neutralRate, 0) / (questionAggregates.length || 1) * 100) },
      ]
    : optionDistribution;

  const branchBarData = results.map((b) => {
    const avg = b.questionResults.length > 0
      ? b.questionResults.reduce((s, q) => s + q.positiveRate, 0) / b.questionResults.length
      : 0;
    return {
      name: b.branchName,
      metric: hasSentimentAnalytics ? Math.round(avg * 100) : b.totalRespondents,
      respondents: b.totalRespondents,
    };
  });
  const individualRows = results.flatMap((branch) =>
    branch.individualResponses.map((response) => ({
      ...response,
      branchName: branch.branchName,
      questionText: survey.questions.find((question) => question.id === response.question_id)?.question_text ?? '',
      answerText: answerTextForResponse(survey, response),
    })),
  );
  const individualExportTargets = useMemo(() => {
    const targets = new Map<string, SurveyIndividualExportTarget & { key: string; answerCount: number }>();
    individualRows.forEach((row) => {
      const key = `${row.branch_id}:${row.respondent_type}:${row.respondent_id}`;
      const current = targets.get(key);
      if (current) {
        current.answerCount += 1;
        return;
      }
      targets.set(key, {
        key,
        branchId: row.branch_id,
        branchName: row.branchName,
        respondentType: row.respondent_type,
        respondentId: row.respondent_id,
        respondentName: row.respondent_name,
        answerCount: 1,
      });
    });
    return Array.from(targets.values()).sort((a, b) =>
      a.respondentName.localeCompare(b.respondentName, i18n.language)
    );
  }, [individualRows]);
  const selectedIndividualExportTarget =
    individualExportTargets.find((target) => target.key === selectedExportTargetKey) ?? individualExportTargets[0];
  const hasResultData = results.length > 0 && (totalRespondents > 0 || questionAggregates.some((q) => q.grandTotal > 0));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="!fixed !inset-0 !left-0 !top-0 z-50 flex !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none border-0 p-0 shadow-none sm:!max-w-none"
      >
        <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 text-left sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg font-semibold">
                  Survey Results
                </DialogTitle>
                <DialogDescription className="truncate">
                  {survey.title}
                  {survey.period ? ` · ${survey.period}` : ''}
                  {survey.survey_date ? ` · ${new Date(`${survey.survey_date}T00:00:00`).toLocaleDateString(i18n.language)}` : ''}
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close survey results">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8">
            <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 border-b bg-muted/20 px-4 sm:px-6 lg:px-8">
              <TabsList className="mx-auto flex h-auto w-full max-w-7xl justify-start gap-1 rounded-none bg-transparent p-0">
                <TabsTrigger value="overview" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">Overview</TabsTrigger>
                <TabsTrigger value="questions" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">By Question</TabsTrigger>
                <TabsTrigger value="branches" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">By Branch</TabsTrigger>
                <TabsTrigger value="individual" className="min-h-12 flex-none rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">Individual</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto bg-muted/10">
              {/* Overview */}
              <TabsContent value="overview" className="m-0 mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
                {/* KPI cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { label: 'Total Respondents', value: totalRespondents.toLocaleString(i18n.language), icon: Users, color: 'text-blue-600' },
                    { label: 'Branches Submitted', value: `${submittedBranches} / ${results.length}`, icon: Building2, color: 'text-emerald-600' },
                    hasSentimentAnalytics
                      ? { label: 'Avg Satisfaction', value: `${Math.round(avgSatisfaction * 100)}%`, icon: TrendingUp, color: avgSatisfaction >= 0.75 ? 'text-emerald-600' : avgSatisfaction >= 0.5 ? 'text-amber-600' : 'text-red-600' }
                      : { label: 'Individual Answers', value: individualRows.length.toLocaleString(i18n.language), icon: FileText, color: 'text-teal-600' },
                  ].map((kpi) => (
                    <Card key={kpi.label} className="border">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={cn('p-2.5 rounded-lg bg-muted', kpi.color)}>
                          <kpi.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{kpi.label}</p>
                          <p className="text-xl font-bold">{kpi.value}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Charts */}
                {hasResultData ? (
                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-lg border bg-background p-4">
                      <p className="mb-3 text-sm font-semibold">{hasSentimentAnalytics ? 'Overall Response Distribution' : 'Answer Distribution'}</p>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={75} outerRadius={115} paddingAngle={3} dataKey="value">
                            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => hasSentimentAnalytics ? `${v}%` : Number(v).toLocaleString(i18n.language)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="rounded-lg border bg-background p-4">
                      <p className="mb-3 text-sm font-semibold">{hasSentimentAnalytics ? 'Satisfaction by Branch' : 'Responses by Branch'}</p>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={branchBarData} layout="vertical" margin={{ left: 12, right: 18 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            domain={hasSentimentAnalytics ? [0, 100] : undefined}
                            tickFormatter={(v) => hasSentimentAnalytics ? `${v}%` : String(v)}
                            tick={{ fontSize: 11 }}
                          />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                          <Tooltip formatter={(v) => hasSentimentAnalytics ? `${v}%` : `${v} respondents`} />
                          <Bar dataKey="metric" fill="#10b981" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-background p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">No results submitted yet</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                      Once a branch enters survey data, this page will show response distribution, satisfaction by branch, question-level results, and export-ready summaries.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* By Question */}
              <TabsContent value="questions" className="m-0 mx-auto w-full max-w-7xl space-y-3 p-4 sm:p-6 lg:p-8">
                {questionAggregates.length > 0 ? questionAggregates.map((qa, idx) => (
                  <div key={qa.question.id} className="space-y-3 rounded-lg border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-snug flex-1">
                        <span className="font-bold text-primary mr-1.5">Q{idx + 1}.</span>
                        {qa.question.question_text}
                      </p>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {qa.grandTotal.toLocaleString(i18n.language)} responses
                      </span>
                    </div>
                    {qa.optionCounts.length > 0 ? (
                      <div className="space-y-2">
                        {qa.optionCounts.map((option) => {
                          const width = qa.grandTotal > 0 ? Math.round((option.count / qa.grandTotal) * 100) : 0;
                          return (
                            <div key={option.label} className="grid gap-2 text-sm sm:grid-cols-[minmax(10rem,16rem)_1fr_5rem] sm:items-center">
                              <span className="truncate font-medium">{option.label}</span>
                              <div className="h-3 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                              </div>
                              <span className="text-right text-xs tabular-nums text-muted-foreground">
                                {option.count.toLocaleString(i18n.language)} ({width}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                        Text, date, or time answers appear in the Individual tab.
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
                    This survey has no questions configured.
                  </div>
                )}
              </TabsContent>

              {/* By Branch */}
              <TabsContent value="branches" className="m-0 mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3 font-semibold text-xs uppercase tracking-wide border-b">Branch</th>
                        <th className="text-center p-3 font-semibold text-xs uppercase tracking-wide border-b">Respondents</th>
                        <th className="text-center p-3 font-semibold text-xs uppercase tracking-wide border-b">{hasSentimentAnalytics ? 'Avg Satisfaction' : 'Answers'}</th>
                        {survey.questions.map((q, i) => (
                          <th key={q.id} className="text-center p-2 font-medium text-xs border-b min-w-[55px]">Q{i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((b) => {
                        const avg = b.questionResults.length > 0
                          ? b.questionResults.reduce((s, q) => s + q.positiveRate, 0) / b.questionResults.length
                          : 0;
                        return (
                          <tr key={b.branchId} className="border-b hover:bg-muted/20">
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-2">
                                {b.branchName}
                                {b.submitted && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                              </div>
                            </td>
                            <td className="p-3 text-center tabular-nums">{b.totalRespondents}</td>
                            <td className="p-3 text-center">
                              <span className={cn(
                                'px-2 py-0.5 rounded-full text-xs font-semibold',
                                hasSentimentAnalytics
                                  ? avg >= 0.75 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                    : avg >= 0.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                {hasSentimentAnalytics ? `${Math.round(avg * 100)}%` : b.individualResponses.length.toLocaleString(i18n.language)}
                              </span>
                            </td>
                            {b.questionResults.map((qr) => (
                              <td key={qr.questionId} className="p-2 text-center tabular-nums text-xs">
                                {hasSentimentAnalytics ? `${Math.round(qr.positiveRate * 100)}%` : qr.total.toLocaleString(i18n.language)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {results.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">No data submitted yet.</div>
                  )}
                </div>
              </TabsContent>

              {/* Individual Responses */}
              <TabsContent value="individual" className="m-0 mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border-b p-3 text-left text-xs font-semibold uppercase tracking-wide">Branch</th>
                        <th className="border-b p-3 text-left text-xs font-semibold uppercase tracking-wide">Respondent</th>
                        <th className="border-b p-3 text-left text-xs font-semibold uppercase tracking-wide">Type</th>
                        <th className="border-b p-3 text-left text-xs font-semibold uppercase tracking-wide">Question</th>
                        <th className="border-b p-3 text-left text-xs font-semibold uppercase tracking-wide">Answer</th>
                        <th className="border-b p-3 text-left text-xs font-semibold uppercase tracking-wide">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {individualRows.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/20">
                          <td className="p-3 font-medium">{row.branchName}</td>
                          <td className="p-3">{row.respondent_name}</td>
                          <td className="p-3">{displayRespondentType(row.respondent_type)}</td>
                          <td className="max-w-[22rem] p-3">
                            <span className="line-clamp-2">{row.questionText}</span>
                          </td>
                          <td className="max-w-[18rem] p-3">
                            <span className="line-clamp-2">{row.answerText || '-'}</span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(row.updated_at).toLocaleString(i18n.language)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {individualRows.length === 0 && (
                    <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No individual student or staff responses have been saved yet.
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:w-20">General</span>
                <Button
                  variant="outline"
                  onClick={async () => {
                    setExportingGeneralPdf(true);
                    try {
                      await exportSurveyResultsPDF(survey, results);
                    } catch {
                      toast.error('PDF export failed. Downloaded an HTML fallback instead.');
                    } finally {
                      setExportingGeneralPdf(false);
                    }
                  }}
                  disabled={loading || exportingGeneralPdf}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {exportingGeneralPdf ? 'Exporting...' : 'General PDF'}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    setExportingGeneralExcel(true);
                    try {
                      await exportSurveyResultsExcel(survey, results);
                    } catch {
                      toast.error('Excel export failed');
                    } finally {
                      setExportingGeneralExcel(false);
                    }
                  }}
                  disabled={loading || exportingGeneralExcel}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {exportingGeneralExcel ? 'Exporting...' : 'General Excel'}
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:w-20">Individual</span>
                <Select
                  value={selectedIndividualExportTarget?.key ?? ''}
                  onValueChange={setSelectedExportTargetKey}
                  disabled={loading || individualExportTargets.length === 0}
                >
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Select student or staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {individualExportTargets.map((target) => (
                      <SelectItem key={target.key} value={target.key}>
                        {target.respondentName} · {displayRespondentType(target.respondentType)} · {target.answerCount}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!selectedIndividualExportTarget) {
                      toast.error('Select a student or staff member first');
                      return;
                    }
                    setExportingIndividualPdf(true);
                    try {
                      await exportSurveyIndividualPDF(survey, results, selectedIndividualExportTarget);
                    } catch {
                      toast.error('Individual PDF export failed. Downloaded an HTML fallback instead.');
                    } finally {
                      setExportingIndividualPdf(false);
                    }
                  }}
                  disabled={loading || exportingIndividualPdf || !selectedIndividualExportTarget}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {exportingIndividualPdf ? 'Exporting...' : 'Person PDF'}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!selectedIndividualExportTarget) {
                      toast.error('Select a student or staff member first');
                      return;
                    }
                    setExportingIndividualExcel(true);
                    try {
                      await exportSurveyIndividualExcel(survey, results, selectedIndividualExportTarget);
                    } catch {
                      toast.error('Individual Excel export failed');
                    } finally {
                      setExportingIndividualExcel(false);
                    }
                  }}
                  disabled={loading || exportingIndividualExcel || !selectedIndividualExportTarget}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {exportingIndividualExcel ? 'Exporting...' : 'Person Excel'}
                </Button>
              </div>
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Duplicate Survey Dialog (superadmin) ───────────────────────────────────────

interface DuplicateSurveyProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  source: SurveyFull;
  branches: Branch[];
}

function DuplicateSurveyDialog({ open, onClose, onSaved, source, branches }: DuplicateSurveyProps) {
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [status, setStatus] = useState<SurveyStatus>('draft');
  const [language, setLanguage] = useState<SurveyLanguage>('fa');
  const [branchId, setBranchId] = useState('');
  const [respondentType, setRespondentType] = useState<SurveyRespondentType>('students');
  const [studentOptions, setStudentOptions] = useState<Array<{ type: 'student'; id: string; name: string; meta?: string }>>([]);
  const [staffOptions, setStaffOptions] = useState<Array<{ type: 'staff'; id: string; name: string; meta?: string }>>([]);
  const [selected, setSelected] = useState<Array<{ type: SurveyRespondentKind; id: string; name: string }>>([]);
  const [respondentsLoading, setRespondentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(`Copy of ${source.title}`);
    setPeriod(source.period ?? '');
    setSurveyDate('');
    setStatus('draft');
    setLanguage(source.language ?? 'fa');
    setRespondentType(source.respondent_type ?? 'students');
    setBranchId(branches[0]?.id ?? '');
    setSelected([]);
  }, [open, source, branches]);

  useEffect(() => {
    if (!open || !branchId) return;
    setRespondentsLoading(true);
    setSelected([]);
    getSurveyRespondentOptions(branchId).then((res) => {
      if (res.success) { setStudentOptions(res.students); setStaffOptions(res.staff); }
      else toast.error(res.error);
      setRespondentsLoading(false);
    });
  }, [open, branchId]);

  useEffect(() => {
    setSelected((current) => current.filter((r) => (
      respondentType === 'students' ? r.type === 'student' : respondentType === 'staff' ? r.type === 'staff' : true
    )));
  }, [respondentType]);

  const visibleStudents = respondentType !== 'staff' ? studentOptions : [];
  const visibleStaff = respondentType !== 'students' ? staffOptions : [];
  const selectedStudentCount = selected.filter((r) => r.type === 'student').length;
  const selectedStaffCount = selected.filter((r) => r.type === 'staff').length;

  const toggle = (r: { type: SurveyRespondentKind; id: string; name: string }) => {
    setSelected((current) => {
      const exists = current.some((i) => i.type === r.type && i.id === r.id);
      return exists ? current.filter((i) => !(i.type === r.type && i.id === r.id)) : [...current, r];
    });
  };
  const selectAll = () => setSelected([...visibleStudents, ...visibleStaff].map((r) => ({ type: r.type, id: r.id, name: r.name })));

  const handleDuplicate = async () => {
    if (!title.trim()) { toast.error('Survey title is required'); return; }
    if (!branchId) { toast.error('Select a branch'); return; }
    if (selected.length === 0) { toast.error('Select at least one respondent'); return; }

    const orderedSections = [...source.sections].sort((a, b) => a.order_index - b.order_index);
    const sectionIndexById = new Map<string, number>();
    orderedSections.forEach((s, i) => sectionIndexById.set(s.id, i));
    const sections = orderedSections.map((s) => ({ title: s.title, description: s.description || undefined }));
    const questions = [...source.questions]
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => ({
        text: q.question_text,
        sectionIndex: q.section_id != null ? (sectionIndexById.get(q.section_id) ?? null) : null,
        questionType: q.question_type,
        sentimentEnabled: q.sentiment_enabled,
        options: questionUsesOptions(q.question_type)
          ? optionsForQuestion(source, q.id).map((o) => ({ label: o.label, sentiment: o.sentiment }))
          : [],
      }));
    const bankOptions = source.options.filter((o) => !o.question_id).map((o) => ({ label: o.label, sentiment: o.sentiment }));

    setSaving(true);
    try {
      const res = await createSurvey({
        title: title.trim(),
        description: source.description || undefined,
        period: period.trim() || undefined,
        surveyDate: surveyDate || undefined,
        branchId,
        respondentType,
        respondentIds: selected,
        language,
        status,
        sections,
        questions,
        options: bankOptions,
      });
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Survey duplicated');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" /> Duplicate Survey
          </DialogTitle>
          <DialogDescription>
            Copies all sections, questions, and answer options. Choose a new branch, respondents, and dates.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-9rem)] space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Copying <span className="font-semibold text-foreground">{source.questions.length}</span> questions ·{' '}
            <span className="font-semibold text-foreground">{source.sections.length}</span> sections ·{' '}
            <span className="font-semibold text-foreground">{source.options.length}</span> answer options from “{source.title}”.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>New Title <span className="text-red-500">*</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Branch <span className="text-red-500">*</span></Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Respondent Group</Label>
              <Select value={respondentType} onValueChange={(v) => setRespondentType(v as SurveyRespondentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="students">Students</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="students_staff">Students and Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Survey Period</Label>
              <Input placeholder="e.g. December 2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Survey Date</Label>
              <Input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SurveyStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Report Language</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as SurveyLanguage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SURVEY_LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-background p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Respondents</p>
                <p className="text-xs text-muted-foreground">{selected.length} selected · {selectedStudentCount} students, {selectedStaffCount} staff</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={respondentsLoading || !branchId}>Select All</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
              </div>
            </div>

            {respondentsLoading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {visibleStudents.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Students</h4>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                      {visibleStudents.map((s) => {
                        const checked = selected.some((i) => i.type === 'student' && i.id === s.id);
                        return (
                          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                            <Checkbox checked={checked} onCheckedChange={() => toggle({ type: 'student', id: s.id, name: s.name })} />
                            <span className="min-w-0 truncate text-sm">{s.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {visibleStaff.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff</h4>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                      {visibleStaff.map((m) => {
                        const checked = selected.some((i) => i.type === 'staff' && i.id === m.id);
                        return (
                          <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                            <Checkbox checked={checked} onCheckedChange={() => toggle({ type: 'staff', id: m.id, name: m.name })} />
                            <span className="min-w-0 truncate text-sm">{m.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {visibleStudents.length === 0 && visibleStaff.length === 0 && (
                  <p className="text-sm text-muted-foreground sm:col-span-2">No active students or staff in this branch.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-background px-6 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDuplicate} disabled={saving}>
            {saving ? 'Duplicating...' : 'Duplicate Survey'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Surveys() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useTranslation(); // ensure i18n is active; translations are inline strings
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';
  const isSuperadmin = user?.role === 'superadmin';

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [surveyStats, setSurveyStats] = useState<Record<string, SurveyCardStats>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | SurveyStatus>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [surveySearch, setSurveySearch] = useState('');

  const [editingSurvey, setEditingSurvey] = useState<SurveyFull | null>(null);
  const [editBuilderOpen, setEditBuilderOpen] = useState(false);

  const [dataEntryOpen, setDataEntryOpen] = useState(false);
  const [dataEntrySurvey, setDataEntrySurvey] = useState<SurveyFull | null>(null);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsSurvey, setResultsSurvey] = useState<SurveyFull | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [duplicateSource, setDuplicateSource] = useState<SurveyFull | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [sRes, bRes] = await Promise.all([getSurveys(), getBranches()]);
    if (bRes.success && bRes.data) setBranches(bRes.data);
    if (sRes.success && sRes.data) {
      setSurveys(sRes.data);
      setSurveyStats({});
      setLoading(false);

      const statsRes = await getSurveyListStats(sRes.data.map((survey) => survey.id));
      if (statsRes.success && statsRes.data) setSurveyStats(statsRes.data);
      return;
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openDataEntry = async (survey: Survey) => {
    const full = await getSurveyFull(survey.id);
    if (full.success && full.data) { setDataEntrySurvey(full.data); setDataEntryOpen(true); }
    else toast.error('Failed to load survey');
  };

  const openResults = async (survey: Survey) => {
    const full = await getSurveyFull(survey.id);
    if (full.success && full.data) { setResultsSurvey(full.data); setResultsOpen(true); }
    else toast.error('Failed to load survey');
  };

  const openEdit = async (survey: Survey) => {
    const full = await getSurveyFull(survey.id);
    if (full.success && full.data) { setEditingSurvey(full.data); setEditBuilderOpen(true); }
    else toast.error('Failed to load survey');
  };

  const openDuplicate = async (survey: Survey) => {
    const full = await getSurveyFull(survey.id);
    if (full.success && full.data) { setDuplicateSource(full.data); setDuplicateOpen(true); }
    else toast.error('Failed to load survey');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteSurvey(deleteTarget.id);
    setDeleting(false);
    if (res.success) { toast.success('Survey deleted'); setDeleteTarget(null); fetchAll(); }
    else toast.error(res.error);
  };

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.name.localeCompare(b.name)),
    [branches],
  );
  const filtered = useMemo(() => {
    const search = surveySearch.trim().toLocaleLowerCase();
    return surveys.filter((survey) => {
      if (statusFilter !== 'all' && survey.status !== statusFilter) return false;
      if (isSuperadmin && branchFilter !== 'all' && survey.branch_id !== branchFilter) return false;
      if (!search) return true;

      const branchName = survey.branch_id ? branchNameById.get(survey.branch_id) ?? '' : '';
      return [survey.title, survey.description, survey.period, branchName]
        .some((value) => value?.toLocaleLowerCase().includes(search));
    });
  }, [branchFilter, branchNameById, isSuperadmin, statusFilter, surveySearch, surveys]);

  const counts = {
    all: surveys.length,
    active: surveys.filter((s) => s.status === 'active').length,
    draft: surveys.filter((s) => s.status === 'draft').length,
    closed: surveys.filter((s) => s.status === 'closed').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" />
            Surveys
          </h1>
          <p className="text-muted-foreground">Manage and collect survey data across branches</p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate('/surveys/new')}>
            <Plus className="mr-2 h-4 w-4" /> Create Survey
          </Button>
        )}
      </div>

      {/* Survey filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit items-center gap-1 rounded-lg border p-1">
          {(['all', 'active', 'draft', 'closed'] as const).map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? 'All' : STATUS_CONFIG[f].label}
              <span className="ml-1.5 text-xs opacity-70">{counts[f]}</span>
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Search surveys or branches..."
              value={surveySearch}
              onChange={(event) => setSurveySearch(event.target.value)}
            />
          </div>
          {isSuperadmin && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-9 sm:w-60">
                <SelectValue placeholder="Filter by branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {sortedBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Survey cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">{surveys.length === 0 ? 'No surveys yet' : 'No matching surveys'}</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            {surveys.length === 0
              ? isAdmin ? 'Create your first survey to start collecting data from branches.' : 'No surveys are active right now.'
              : 'Try another search, branch, or status filter.'}
          </p>
          {isAdmin && surveys.length === 0 && (
            <Button className="mt-4" onClick={() => navigate('/surveys/new')}>
              <Plus className="mr-2 h-4 w-4" /> Create Survey
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((survey) => {
            const cfg = STATUS_CONFIG[survey.status];
            const StatusIcon = cfg.icon;
            const stats = surveyStats[survey.id];
            const responseActivityPct = stats?.totalRespondents
              ? 100
              : stats?.submittedBranches
                ? 45
                : 0;
            const branchName = survey.branch_id ? branchNameById.get(survey.branch_id) : undefined;
            return (
              <Card key={survey.id} className="group overflow-hidden border hover:shadow-md transition-shadow">
                <div className={cn(
                  'h-1.5',
                  survey.status === 'active' ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                    : survey.status === 'draft' ? 'bg-gradient-to-r from-slate-300 to-slate-400'
                    : 'bg-gradient-to-r from-blue-400 to-indigo-500'
                )} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base leading-snug truncate">{survey.title}</h3>
                      {survey.period && <p className="text-xs text-muted-foreground mt-0.5">{survey.period}</p>}
                      {survey.survey_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(`${survey.survey_date}T00:00:00`).toLocaleDateString(i18n.language)}
                        </p>
                      )}
                      {branchName && <p className="text-xs text-muted-foreground mt-0.5">{branchName}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.className)}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(survey)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            {isSuperadmin && (
                              <DropdownMenuItem onClick={() => openDuplicate(survey)}>
                                <Copy className="mr-2 h-4 w-4" /> Duplicate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(survey)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {survey.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{survey.description}</p>
                  )}

                  <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Response activity</span>
                      <span className="font-semibold">{stats?.totalRespondents ?? 0}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${responseActivityPct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{stats?.totalRespondents ?? 0} respondents</span>
                      <span>{stats?.submittedBranches ?? 0} submitted</span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => openResults(survey)}
                    >
                      <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                      Results
                    </Button>
                    {survey.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => openDataEntry(survey)}
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Enter Data
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SurveyBuilder
        open={editBuilderOpen}
        onClose={() => { setEditBuilderOpen(false); setEditingSurvey(null); }}
        onSaved={fetchAll}
        existing={editingSurvey}
      />

      {/* Duplicate dialog (superadmin) */}
      {duplicateSource && (
        <DuplicateSurveyDialog
          open={duplicateOpen}
          onClose={() => { setDuplicateOpen(false); setDuplicateSource(null); }}
          onSaved={fetchAll}
          source={duplicateSource}
          branches={branches}
        />
      )}

      {/* Data entry dialog */}
      {dataEntrySurvey && (
        <DataEntryDialog
          open={dataEntryOpen}
          onClose={() => { setDataEntryOpen(false); setDataEntrySurvey(null); }}
          onSaved={fetchAll}
          survey={dataEntrySurvey}
          branches={dataEntrySurvey.branch_id ? branches.filter((branch) => branch.id === dataEntrySurvey.branch_id) : branches}
          defaultBranchId={dataEntrySurvey.branch_id ?? undefined}
        />
      )}

      {/* Results dialog */}
      {resultsSurvey && (
        <ResultsDialog
          open={resultsOpen}
          onClose={() => { setResultsOpen(false); setResultsSurvey(null); }}
          survey={resultsSurvey}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Survey</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.title}"</strong>? All questions and submitted data will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
