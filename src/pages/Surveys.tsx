import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Grip, X, Building2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getSurveys, getSurveyFull, getSurveyResults, getBranchSubmission,
  createSurvey, updateSurveyMeta, deleteSurvey, saveBranchData,
  type Survey, type SurveyFull, type BranchResult, type SurveyStatus, type Sentiment,
} from '@/services/surveyService';
import { getBranches, type Branch } from '@/services/branchService';
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

const STATUS_CONFIG: Record<SurveyStatus, { label: string; className: string; icon: React.ElementType }> = {
  draft:  { label: 'Draft',  className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: FileText },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: CheckCircle2 },
  closed: { label: 'Closed', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400', icon: Clock },
};


const PIE_COLORS = ['#10b981', '#ef4444', '#94a3b8'];

// ─── Survey Builder ───────────────────────────────────────────────────────────

interface BuilderSection { title: string; description: string }
interface BuilderQuestion { text: string; sectionIndex: number | null }
interface BuilderOption { label: string; sentiment: Sentiment }

interface SurveyBuilderProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: SurveyFull | null;
}

function SurveyBuilder({ open, onClose, onSaved, existing }: SurveyBuilderProps) {
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);

  // Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState<SurveyStatus>('draft');

  // Options (response scale)
  const [options, setOptions] = useState<BuilderOption[]>(DEFAULT_OPTIONS);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionSentiment, setNewOptionSentiment] = useState<Sentiment>('neutral');

  // Sections + Questions
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [questions, setQuestions] = useState<BuilderQuestion[]>([{ text: '', sectionIndex: null }]);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  useEffect(() => {
    if (open) {
      setTab('details');
      if (existing) {
        setTitle(existing.title);
        setDescription(existing.description ?? '');
        setPeriod(existing.period ?? '');
        setStatus(existing.status);
        setOptions(existing.options.map((o) => ({ label: o.label, sentiment: o.sentiment })));
        setSections(existing.sections.map((s) => ({ title: s.title, description: s.description ?? '' })));
        setQuestions(
          existing.questions.length > 0
            ? existing.questions.map((q) => {
                const sec = existing.sections.findIndex((s) => s.id === q.section_id);
                return { text: q.question_text, sectionIndex: sec >= 0 ? sec : null };
              })
            : [{ text: '', sectionIndex: null }]
        );
      } else {
        setTitle(''); setDescription(''); setPeriod(''); setStatus('draft');
        setOptions(DEFAULT_OPTIONS);
        setSections([]); setQuestions([{ text: '', sectionIndex: null }]);
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

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Survey title is required'); setTab('details'); return; }
    if (options.length === 0) { toast.error('Add at least one response option'); setTab('scale'); return; }
    const filledQuestions = questions.filter((q) => q.text.trim());
    if (filledQuestions.length === 0) { toast.error('Add at least one question'); setTab('questions'); return; }

    setSaving(true);
    try {
      if (existing) {
        // Update meta only (questions/sections rebuild is complex — for now update meta)
        const res = await updateSurveyMeta(existing.id, { title: title.trim(), description: description.trim() || undefined, period: period.trim() || undefined, status });
        if (!res.success) { toast.error(res.error); return; }
        toast.success('Survey updated');
      } else {
        const res = await createSurvey({
          title: title.trim(),
          description: description.trim() || undefined,
          period: period.trim() || undefined,
          status,
          sections: sections.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description.trim() || undefined })),
          questions: filledQuestions.map((q) => ({ text: q.text.trim(), sectionIndex: q.sectionIndex })),
          options,
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-primary" />
            {existing ? 'Edit Survey' : 'Create Survey'}
          </DialogTitle>
          <DialogDescription>
            {existing ? 'Update the survey details.' : 'Build your survey with sections, questions, and a response scale.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="rounded-none border-b h-11 bg-background justify-start gap-1 px-4 shrink-0 w-full">
            <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
            <TabsTrigger value="scale" className="text-xs">Response Scale</TabsTrigger>
            {!existing && <TabsTrigger value="questions" className="text-xs">Questions</TabsTrigger>}
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {/* ── Details ── */}
            <TabsContent value="details" className="p-6 m-0 space-y-4">
              <div className="space-y-2">
                <Label>Survey Title <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Psychosocial Support Survey 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={2} placeholder="Brief description of this survey's purpose..." value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Survey Period</Label>
                  <Input placeholder="e.g. December 2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
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
              </div>
            </TabsContent>

            {/* ── Response Scale ── */}
            <TabsContent value="scale" className="p-6 m-0 space-y-4">
              <div className="text-sm text-muted-foreground">
                Define the answer options respondents can choose from. Each option should be tagged with its sentiment so the system can calculate satisfaction rates.
              </div>
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
                    <Grip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <Input
                        className="h-7 text-sm"
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
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="positive">✅ Positive</SelectItem>
                          <SelectItem value="negative">❌ Negative</SelectItem>
                          <SelectItem value="neutral">➖ Neutral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveOption(idx, -1)} disabled={idx === 0}><ChevronUp className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveOption(idx, 1)} disabled={idx === options.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => setOptions(options.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Input placeholder="New option label..." value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} className="flex-1" />
                <Select value={newOptionSentiment} onValueChange={(v) => setNewOptionSentiment(v as Sentiment)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">✅ Positive</SelectItem>
                    <SelectItem value="negative">❌ Negative</SelectItem>
                    <SelectItem value="neutral">➖ Neutral</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => {
                  if (!newOptionLabel.trim()) return;
                  setOptions([...options, { label: newOptionLabel.trim(), sentiment: newOptionSentiment }]);
                  setNewOptionLabel('');
                }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TabsContent>

            {/* ── Questions ── */}
            {!existing && (
              <TabsContent value="questions" className="p-6 m-0 space-y-5">
                {/* Sections */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Sections <span className="text-muted-foreground font-normal text-xs">(optional grouping)</span></Label>
                  </div>
                  <div className="flex gap-2 mb-2">
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
                        <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-full text-xs font-medium text-primary">
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
                </div>

                <Separator />

                {/* Questions */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Questions</Label>
                  {questions.map((q, idx) => (
                    <div key={idx} className="flex items-start gap-2 group">
                      <div className="flex flex-col items-center gap-0.5 pt-2">
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}><ChevronUp className="h-3 w-3" /></Button>
                        <span className="text-xs font-mono text-muted-foreground">Q{idx + 1}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                      </div>
                      <div className="flex-1 flex items-start gap-2">
                        <Textarea
                          rows={2}
                          placeholder={`Question ${idx + 1}...`}
                          value={q.text}
                          onChange={(e) => {
                            const next = [...questions];
                            next[idx] = { ...next[idx], text: e.target.value };
                            setQuestions(next);
                          }}
                          className="text-sm resize-none"
                        />
                        {sections.length > 0 && (
                          <Select
                            value={q.sectionIndex !== null ? String(q.sectionIndex) : 'none'}
                            onValueChange={(v) => {
                              const next = [...questions];
                              next[idx] = { ...next[idx], sectionIndex: v === 'none' ? null : Number(v) };
                              setQuestions(next);
                            }}
                          >
                            <SelectTrigger className="w-32 h-9 text-xs shrink-0"><SelectValue placeholder="Section" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No section</SelectItem>
                              {sections.map((s, i) => <SelectItem key={i} value={String(i)}>{s.title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 mt-1 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => setQuestions(questions.filter((_, i) => i !== idx))} disabled={questions.length === 1}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setQuestions([...questions, { text: '', sectionIndex: null }])}>
                    <Plus className="mr-2 h-3.5 w-3.5" /> Add Question
                  </Button>
                </div>
              </TabsContent>
            )}
          </div>
        </Tabs>

        <div className="border-t px-6 py-4 flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : existing ? 'Save Changes' : 'Create Survey'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

const OPTION_ACCENT: Record<Sentiment, string> = {
  positive: 'border-t-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20',
  negative: 'border-t-red-400 bg-red-50/60 dark:bg-red-950/20',
  neutral:  'border-t-slate-300 bg-slate-50/60 dark:bg-slate-800/20',
};
const OPTION_INPUT_FOCUS: Record<Sentiment, string> = {
  positive: 'focus-visible:ring-emerald-400',
  negative: 'focus-visible:ring-red-400',
  neutral:  'focus-visible:ring-slate-400',
};
const OPTION_DOT: Record<Sentiment, string> = {
  positive: 'bg-emerald-400',
  negative: 'bg-red-400',
  neutral:  'bg-slate-400',
};

function DataEntryDialog({ open, onClose, onSaved, survey, branches, defaultBranchId }: DataEntryProps) {
  const [branchId, setBranchId] = useState(defaultBranchId ?? '');
  const [totalRespondents, setTotalRespondents] = useState('');
  const [counts, setCounts] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranchId(defaultBranchId ?? branches[0]?.id ?? '');
    setTotalRespondents('');
    setCounts({});
  }, [open]);

  useEffect(() => {
    if (!branchId || !open) return;
    setLoading(true);
    getBranchSubmission(survey.id, branchId).then(({ submission, responses }) => {
      setTotalRespondents(submission ? String(submission.total_respondents) : '');
      const c: Record<string, Record<string, string>> = {};
      responses.forEach((r) => {
        if (!c[r.question_id]) c[r.question_id] = {};
        c[r.question_id][r.option_id] = String(r.count);
      });
      setCounts(c);
      setLoading(false);
    });
  }, [branchId, open]);

  const setCount = (qId: string, oId: string, val: string) => {
    setCounts((prev) => ({ ...prev, [qId]: { ...(prev[qId] ?? {}), [oId]: val } }));
  };

  const rowTotal = (qId: string) =>
    survey.options.reduce((s, o) => s + (parseInt(counts[qId]?.[o.id] ?? '0') || 0), 0);

  const handleSave = async () => {
    if (!branchId) { toast.error('Please select a branch'); return; }
    const total = parseInt(totalRespondents) || 0;
    setSaving(true);
    const flatCounts = survey.questions.flatMap((q) =>
      survey.options.map((o) => ({ questionId: q.id, optionId: o.id, count: parseInt(counts[q.id]?.[o.id] ?? '0') || 0 }))
    );
    const res = await saveBranchData(survey.id, branchId, total, flatCounts);
    setSaving(false);
    if (!res.success) { toast.error(res.error); return; }
    toast.success('Data saved successfully');
    onSaved();
    onClose();
  };

  const selectedBranch = branches.find((b) => b.id === branchId);
  const respondentsNum = parseInt(totalRespondents) || 0;

  // overall completion: how many questions have a non-zero row total
  const filledCount = survey.questions.filter((q) => rowTotal(q.id) > 0).length;
  const completionPct = survey.questions.length > 0 ? Math.round((filledCount / survey.questions.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">

        {/* ── Header ── */}
        <div className="relative px-6 pt-6 pb-5 shrink-0 overflow-hidden">
          {/* Subtle gradient backdrop */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold leading-tight">Enter Survey Data</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                  {survey.title}{survey.period ? <span className="mx-1.5 opacity-40">·</span> : ''}{survey.period}
                </DialogDescription>
              </div>
            </div>
            {/* Completion pill */}
            <div className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border',
              completionPct === 100
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-muted text-muted-foreground border-border'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', completionPct === 100 ? 'bg-emerald-500' : 'bg-slate-400')} />
              {filledCount}/{survey.questions.length} filled
            </div>
          </div>

          {/* Branch + Respondents row */}
          <div className="relative mt-4 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Branch
              </label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-10 bg-background border-border shadow-sm">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Total Respondents
              </label>
              <Input
                type="number" min="0" placeholder="0"
                className="h-10 bg-background border-border shadow-sm text-center font-semibold text-base tabular-nums"
                value={totalRespondents}
                onChange={(e) => setTotalRespondents(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-border shrink-0" />

        {/* ── Question cards ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${survey.options.length}, 1fr)` }}>
                  {survey.options.map((_, j) => <Skeleton key={j} className="h-20 rounded-lg" />)}
                </div>
              </div>
            ))
          ) : (
            survey.questions.map((q, qi) => {
              const total = rowTotal(q.id);
              const over = respondentsNum > 0 && total > respondentsNum;
              const exact = respondentsNum > 0 && total === respondentsNum;
              const positiveCount = survey.options
                .filter((o) => o.sentiment === 'positive')
                .reduce((s, o) => s + (parseInt(counts[q.id]?.[o.id] ?? '0') || 0), 0);
              const negativeCount = survey.options
                .filter((o) => o.sentiment === 'negative')
                .reduce((s, o) => s + (parseInt(counts[q.id]?.[o.id] ?? '0') || 0), 0);
              const posW = total > 0 ? (positiveCount / total) * 100 : 0;
              const negW = total > 0 ? (negativeCount / total) * 100 : 0;

              return (
                <div
                  key={q.id}
                  className={cn(
                    'rounded-xl border bg-card transition-all duration-200',
                    over ? 'border-red-300 dark:border-red-800 shadow-sm shadow-red-100 dark:shadow-red-950/20'
                      : exact ? 'border-emerald-300 dark:border-emerald-800'
                      : 'border-border hover:border-border/80'
                  )}
                >
                  {/* Question header */}
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
                    {/* Row total badge */}
                    <div className={cn(
                      'shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums',
                      over ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                        : exact ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : total > 0 ? 'bg-muted text-muted-foreground'
                        : 'bg-muted/50 text-muted-foreground/50'
                    )}>
                      {over && '⚠ '}
                      {total}{respondentsNum > 0 ? ` / ${respondentsNum}` : ''}
                    </div>
                  </div>

                  {/* Option tiles */}
                  <div className="px-4 pb-3">
                    <div
                      className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${Math.min(survey.options.length, 6)}, 1fr)` }}
                    >
                      {survey.options.map((opt) => {
                        const val = counts[q.id]?.[opt.id] ?? '';
                        const num = parseInt(val) || 0;
                        return (
                          <div
                            key={opt.id}
                            className={cn(
                              'flex flex-col items-center gap-1.5 rounded-lg border-t-2 p-2.5 transition-all',
                              OPTION_ACCENT[opt.sentiment],
                              num > 0 ? 'opacity-100' : 'opacity-70 hover:opacity-90'
                            )}
                          >
                            <div className="flex items-center gap-1">
                              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', OPTION_DOT[opt.sentiment])} />
                              <span className="text-[11px] font-semibold text-center leading-tight line-clamp-2">
                                {opt.label}
                              </span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={val}
                              onChange={(e) => setCount(q.id, opt.id, e.target.value)}
                              className={cn(
                                'w-full h-9 text-center text-base font-bold tabular-nums rounded-md border bg-background',
                                'outline-none focus-visible:ring-2 focus-visible:ring-offset-0 transition-colors',
                                'placeholder:text-muted-foreground/30',
                                OPTION_INPUT_FOCUS[opt.sentiment],
                                num > 0 ? 'text-foreground' : 'text-muted-foreground'
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mini distribution bar */}
                  {total > 0 && (
                    <div className="px-4 pb-3">
                      <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                        <div className="bg-emerald-400 rounded-full transition-all duration-300" style={{ width: `${posW}%` }} />
                        <div className="bg-red-400 rounded-full transition-all duration-300" style={{ width: `${negW}%` }} />
                        <div className="bg-slate-300 dark:bg-slate-600 rounded-full flex-1" />
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>✓ {Math.round(posW)}% positive</span>
                        <span>✗ {Math.round(negW)}% negative</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-6 py-4 flex items-center justify-between shrink-0 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selectedBranch && (
              <>
                <Building2 className="h-3.5 w-3.5" />
                <span className="font-medium">{selectedBranch.name}</span>
                {respondentsNum > 0 && <span className="opacity-60">· {respondentsNum} respondents</span>}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || loading} className="min-w-[100px]">
              {saving ? (
                <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</span>
              ) : (
                <span className="flex items-center gap-2"><Send className="h-3.5 w-3.5" />Save Data</span>
              )}
            </Button>
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

  // Aggregate per question across all branches
  const questionAggregates = survey.questions.map((q) => {
    let positiveTotal = 0, negativeTotal = 0, neutralTotal = 0, grandTotal = 0;
    results.forEach((b) => {
      const qr = b.questionResults.find((r) => r.questionId === q.id);
      if (!qr) return;
      qr.counts.forEach((c) => {
        grandTotal += c.count;
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
    };
  });

  const avgSatisfaction = questionAggregates.length > 0
    ? questionAggregates.reduce((s, q) => s + q.positiveRate, 0) / questionAggregates.length
    : 0;

  const pieData = [
    { name: 'Positive', value: Math.round(avgSatisfaction * 100) },
    { name: 'Negative', value: Math.round(questionAggregates.reduce((s, q) => s + q.negativeRate, 0) / (questionAggregates.length || 1) * 100) },
    { name: 'Neutral', value: Math.round(questionAggregates.reduce((s, q) => s + q.neutralRate, 0) / (questionAggregates.length || 1) * 100) },
  ];

  const branchBarData = results.map((b) => {
    const avg = b.questionResults.length > 0
      ? b.questionResults.reduce((s, q) => s + q.positiveRate, 0) / b.questionResults.length
      : 0;
    return { name: b.branchName, satisfaction: Math.round(avg * 100), respondents: b.totalRespondents };
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Survey Results
          </DialogTitle>
          <DialogDescription>{survey.title}{survey.period ? ` · ${survey.period}` : ''}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="rounded-none border-b h-11 bg-background justify-start gap-1 px-4 shrink-0 w-full">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="questions" className="text-xs">By Question</TabsTrigger>
              <TabsTrigger value="branches" className="text-xs">By Branch</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              {/* Overview */}
              <TabsContent value="overview" className="p-6 m-0 space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Total Respondents', value: totalRespondents.toLocaleString(i18n.language), icon: Users, color: 'text-blue-600' },
                    { label: 'Branches Submitted', value: `${submittedBranches} / ${results.length}`, icon: Building2, color: 'text-emerald-600' },
                    { label: 'Avg Satisfaction', value: `${Math.round(avgSatisfaction * 100)}%`, icon: TrendingUp, color: avgSatisfaction >= 0.75 ? 'text-emerald-600' : avgSatisfaction >= 0.5 ? 'text-amber-600' : 'text-red-600' },
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
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-semibold mb-3">Overall Response Distribution</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-3">Satisfaction by Branch</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={branchBarData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Bar dataKey="satisfaction" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              {/* By Question */}
              <TabsContent value="questions" className="p-6 m-0 space-y-3">
                {questionAggregates.map((qa, idx) => (
                  <div key={qa.question.id} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-snug flex-1">
                        <span className="font-bold text-primary mr-1.5">Q{idx + 1}.</span>
                        {qa.question.question_text}
                      </p>
                      <div className={cn(
                        'shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold',
                        qa.positiveRate >= 0.75 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                          : qa.positiveRate >= 0.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                      )}>
                        {Math.round(qa.positiveRate * 100)}% positive
                      </div>
                    </div>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${qa.positiveRate * 100}%` }} />
                      <div className="bg-red-400 transition-all" style={{ width: `${qa.negativeRate * 100}%` }} />
                      <div className="bg-slate-300 dark:bg-slate-600 flex-1" />
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Positive {Math.round(qa.positiveRate * 100)}%</span>
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" />Negative {Math.round(qa.negativeRate * 100)}%</span>
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />Neutral {Math.round(qa.neutralRate * 100)}%</span>
                      <span className="ml-auto">{qa.grandTotal.toLocaleString(i18n.language)} responses</span>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* By Branch */}
              <TabsContent value="branches" className="p-6 m-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3 font-semibold text-xs uppercase tracking-wide border-b">Branch</th>
                        <th className="text-center p-3 font-semibold text-xs uppercase tracking-wide border-b">Respondents</th>
                        <th className="text-center p-3 font-semibold text-xs uppercase tracking-wide border-b">Avg Satisfaction</th>
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
                                avg >= 0.75 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                  : avg >= 0.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                              )}>
                                {Math.round(avg * 100)}%
                              </span>
                            </td>
                            {b.questionResults.map((qr) => (
                              <td key={qr.questionId} className="p-2 text-center tabular-nums text-xs">
                                {Math.round(qr.positiveRate * 100)}%
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
            </div>
          </Tabs>
        )}

        <div className="border-t px-6 py-4 shrink-0 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Surveys() {
  const { user } = useAuth();
  useTranslation(); // ensure i18n is active; translations are inline strings
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | SurveyStatus>('all');

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<SurveyFull | null>(null);
  const [editBuilderOpen, setEditBuilderOpen] = useState(false);

  const [dataEntryOpen, setDataEntryOpen] = useState(false);
  const [dataEntrySurvey, setDataEntrySurvey] = useState<SurveyFull | null>(null);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsSurvey, setResultsSurvey] = useState<SurveyFull | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [sRes, bRes] = await Promise.all([getSurveys(), getBranches()]);
    if (sRes.success && sRes.data) setSurveys(sRes.data);
    if (bRes.success && bRes.data) setBranches(bRes.data);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteSurvey(deleteTarget.id);
    setDeleting(false);
    if (res.success) { toast.success('Survey deleted'); setDeleteTarget(null); fetchAll(); }
    else toast.error(res.error);
  };

  const filtered = statusFilter === 'all' ? surveys : surveys.filter((s) => s.status === statusFilter);

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
          <Button onClick={() => setBuilderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Survey
          </Button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1 border rounded-lg p-1 w-fit">
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
          <h3 className="font-semibold text-lg">No surveys yet</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            {isAdmin ? 'Create your first survey to start collecting data from branches.' : 'No surveys are active right now.'}
          </p>
          {isAdmin && (
            <Button className="mt-4" onClick={() => setBuilderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Survey
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((survey) => {
            const cfg = STATUS_CONFIG[survey.status];
            const StatusIcon = cfg.icon;
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

      {/* Builder dialog */}
      <SurveyBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onSaved={fetchAll}
      />
      <SurveyBuilder
        open={editBuilderOpen}
        onClose={() => { setEditBuilderOpen(false); setEditingSurvey(null); }}
        onSaved={fetchAll}
        existing={editingSurvey}
      />

      {/* Data entry dialog */}
      {dataEntrySurvey && (
        <DataEntryDialog
          open={dataEntryOpen}
          onClose={() => { setDataEntryOpen(false); setDataEntrySurvey(null); }}
          onSaved={fetchAll}
          survey={dataEntrySurvey}
          branches={branches}
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
