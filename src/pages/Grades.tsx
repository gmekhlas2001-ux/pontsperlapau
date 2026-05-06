/**
 * Grades page.
 *
 * Two-panel layout:
 *  Left  — class list (teachers see only their classes)
 *  Right — student roster with expandable grade cards per student
 *
 * Each student card shows:
 *  - Average score (computed), final letter grade, attendance %
 *  - All grade entries (assessment name, type, score/max, letter, date)
 *  - Add / edit / delete individual entries
 *  - Quick "Set Final Grade" override
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  getGradesForClass,
  addGradeEntry,
  updateGradeEntry,
  deleteGradeEntry,
  setFinalGrade,
  type GradeStudent,
  type GradeEntry,
  type AssessmentType,
} from '@/services/gradesService';
import { getClassesList, type ClassRecord } from '@/services/classService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  GraduationCap, BookOpen, ChevronRight, ChevronDown, Plus, Pencil,
  Trash2, RefreshCw, Award, TrendingUp, ClipboardCheck, FileDown,
} from 'lucide-react';
import {
  exportClassRosterPDF,
  exportReportCardPDF,
  exportGradesExcel,
} from '@/services/exportService';
import { cn, getFullName } from '@/lib/utils';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSESSMENT_TYPES: { value: AssessmentType; label: string }[] = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz',       label: 'Quiz' },
  { value: 'midterm',    label: 'Midterm' },
  { value: 'final',      label: 'Final Exam' },
  { value: 'project',    label: 'Project' },
  { value: 'other',      label: 'Other' },
];

const TYPE_COLORS: Record<AssessmentType, string> = {
  midterm:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  final:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  assignment: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  quiz:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  project:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  other:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  B: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  C: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  F: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

function gradeColor(g: string | null) {
  if (!g) return 'bg-muted text-muted-foreground';
  const letter = g.charAt(0).toUpperCase();
  return GRADE_COLORS[letter] ?? 'bg-muted text-muted-foreground';
}

// ─── Add / Edit Entry Dialog ──────────────────────────────────────────────────

interface EntryDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  classId: string;
  studentId: string;
  existing?: GradeEntry | null;
}

function EntryDialog({ open, onClose, onSaved, classId, studentId, existing }: EntryDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AssessmentType>('assignment');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [letter, setLetter] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.assessment_name);
        setType(existing.assessment_type);
        setScore(existing.score !== null ? String(existing.score) : '');
        setMaxScore(String(existing.max_score));
        setLetter(existing.grade_letter ?? '');
        setNotes(existing.notes ?? '');
        setDate(existing.assessment_date);
      } else {
        setName(''); setType('assignment'); setScore('');
        setMaxScore('100'); setLetter(''); setNotes('');
        setDate(format(new Date(), 'yyyy-MM-dd'));
      }
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Assessment name is required'); return; }
    setSaving(true);
    const payload = {
      assessmentName: name.trim(),
      assessmentType: type,
      score: score !== '' ? parseFloat(score) : null,
      maxScore: parseFloat(maxScore) || 100,
      gradeLetter: letter.trim() || undefined,
      notes: notes.trim() || undefined,
      assessmentDate: date,
    };
    const res = existing
      ? await updateGradeEntry(existing.id, {
          assessment_name: payload.assessmentName,
          assessment_type: payload.assessmentType,
          score: payload.score,
          max_score: payload.maxScore,
          grade_letter: payload.gradeLetter ?? null,
          notes: payload.notes ?? null,
          assessment_date: payload.assessmentDate,
        })
      : await addGradeEntry({ classId, studentId, ...payload });

    setSaving(false);
    if (res.success) {
      toast.success(existing ? 'Grade updated' : 'Grade added');
      onSaved(); onClose();
    } else {
      toast.error(res.error ?? 'Failed to save grade');
    }
  };

  const scoreNum = parseFloat(score);
  const maxNum = parseFloat(maxScore) || 100;
  const pct = score !== '' && !isNaN(scoreNum) ? Math.round((scoreNum / maxNum) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Grade Entry' : 'Add Grade Entry'}</DialogTitle>
          <DialogDescription>
            {existing ? 'Update this assessment record.' : 'Record a new assessment score for this student.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assessment Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Midterm Exam" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AssessmentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Score</Label>
              <Input
                type="number" min="0" placeholder="—"
                value={score} onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Out of</Label>
              <Input
                type="number" min="1" placeholder="100"
                value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Letter</Label>
              <Input
                placeholder="A, B+…"
                value={letter} onChange={(e) => setLetter(e.target.value)}
                maxLength={5}
              />
            </div>
          </div>

          {/* Live percentage preview */}
          {pct !== null && (
            <div className={cn(
              'text-center py-2 rounded-lg text-sm font-semibold',
              pct >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : pct >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            )}>
              {pct}%
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} placeholder="Optional teacher comment…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Grade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Student Grade Card ───────────────────────────────────────────────────────

function StudentGradeCard({
  student,
  classInfo,
  onRefresh,
}: {
  student: GradeStudent;
  classInfo: { name: string; teacherName?: string };
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<GradeEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<GradeEntry | null>(null);
  const [finalGradeInput, setFinalGradeInput] = useState(student.finalGrade ?? '');
  const [savingFinal, setSavingFinal] = useState(false);

  const handleDeleteEntry = async () => {
    if (!deleteEntry) return;
    const res = await deleteGradeEntry(deleteEntry.id);
    if (res.success) { toast.success('Entry deleted'); onRefresh(); }
    else toast.error(res.error ?? 'Failed to delete');
    setDeleteEntry(null);
  };

  const handleSetFinal = async () => {
    if (!finalGradeInput.trim()) return;
    setSavingFinal(true);
    const res = await setFinalGrade(student.enrollmentId.split(',')[0], student.studentId, finalGradeInput.trim().toUpperCase());
    setSavingFinal(false);
    if (res.success) { toast.success('Final grade saved'); onRefresh(); }
    else toast.error(res.error ?? 'Failed');
  };

  return (
    <Card className="border overflow-hidden">
      {/* Card header — always visible */}
      <button
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <AvatarWithFallback firstName={student.firstName} lastName={student.lastName} className="h-9 w-9 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{getFullName(student.firstName, student.lastName)}</p>
          <p className="text-xs text-muted-foreground">{student.studentCode}</p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 shrink-0">
          {student.average !== null && (
            <div className="text-center hidden sm:block">
              <p className="text-xs text-muted-foreground">Average</p>
              <p className={cn(
                'text-sm font-bold',
                student.average >= 80 ? 'text-emerald-600' : student.average >= 60 ? 'text-amber-600' : 'text-red-600',
              )}>{student.average}%</p>
            </div>
          )}
          <div className="text-center hidden sm:block">
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="text-sm font-bold">{student.attendancePct}%</p>
          </div>
          {student.finalGrade && (
            <div className={cn('px-3 py-1 rounded-full text-sm font-bold', gradeColor(student.finalGrade))}>
              {student.finalGrade}
            </div>
          )}
          <div className="text-xs text-muted-foreground">{student.entries.length} entries</div>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Final grade setter */}
          <div className="flex items-end gap-2 p-3 bg-muted/30 rounded-xl">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Final / Overall Grade</Label>
              <Input
                placeholder="A, B+, C…"
                value={finalGradeInput}
                onChange={(e) => setFinalGradeInput(e.target.value)}
                maxLength={5}
                className="w-28 text-center font-bold text-lg h-10"
              />
            </div>
            <Button size="sm" onClick={handleSetFinal} disabled={savingFinal || !finalGradeInput.trim()}>
              <Award className="h-3.5 w-3.5 mr-1" />
              {savingFinal ? 'Saving…' : 'Set Final'}
            </Button>
            {student.average !== null && (
              <p className="text-xs text-muted-foreground pb-1">
                Calculated avg: <strong>{student.average}%</strong>
              </p>
            )}
          </div>

          {/* Grade entries */}
          {student.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No entries yet — add the first one.</p>
          ) : (
            <div className="space-y-2">
              {student.entries.map((entry) => {
                const pct = entry.score !== null ? Math.round((entry.score / entry.max_score) * 100) : null;
                return (
                  <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{entry.assessment_name}</p>
                        <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium', TYPE_COLORS[entry.assessment_type])}>
                          {ASSESSMENT_TYPES.find((t) => t.value === entry.assessment_type)?.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(entry.assessment_date), 'MMM d, yyyy')}
                        {entry.notes && <> · <span className="italic">{entry.notes}</span></>}
                      </p>
                    </div>
                    {/* Score display */}
                    <div className="text-right shrink-0">
                      {entry.score !== null ? (
                        <>
                          <p className="font-bold text-sm">{entry.score} / {entry.max_score}</p>
                          <p className={cn(
                            'text-xs font-semibold',
                            pct! >= 80 ? 'text-emerald-600' : pct! >= 60 ? 'text-amber-600' : 'text-red-600',
                          )}>{pct}%</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </div>
                    {entry.grade_letter && (
                      <div className={cn('px-2 py-0.5 rounded-full text-xs font-bold shrink-0', gradeColor(entry.grade_letter))}>
                        {entry.grade_letter}
                      </div>
                    )}
                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditEntry(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteEntry(entry)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Assessment
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => exportReportCardPDF(classInfo, student)}
              title="Download report card PDF"
            >
              <FileDown className="h-3.5 w-3.5" /> Report Card
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <EntryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={onRefresh}
        classId={student.entries[0]?.class_id ?? ''}
        studentId={student.studentId}
      />
      <EntryDialog
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={onRefresh}
        classId={editEntry?.class_id ?? ''}
        studentId={student.studentId}
        existing={editEntry}
      />
      <AlertDialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Grade Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>"{deleteEntry?.assessment_name}"</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Grades() {
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassRecord | null>(null);

  const [students, setStudents] = useState<GradeStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const fetchClasses = useCallback(async () => {
    setClassesLoading(true);
    const res = await getClassesList();
    if (res.success && res.data) {
      const filtered = user?.role === 'teacher'
        ? res.data.filter((c) => c.teacherId === user?.id)
        : res.data.filter((c) => c.status === 'active');
      setClasses(filtered);
      if (filtered.length > 0 && !selectedClass) setSelectedClass(filtered[0]);
    }
    setClassesLoading(false);
  }, [user]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const fetchGrades = useCallback(async () => {
    if (!selectedClass) return;
    setStudentsLoading(true);
    const res = await getGradesForClass(selectedClass.id);
    if (res.success && res.data) setStudents(res.data);
    setStudentsLoading(false);
  }, [selectedClass]);

  useEffect(() => { fetchGrades(); }, [fetchGrades]);

  // Class-level summary
  const classAvg = students.length > 0
    ? (() => {
        const with_avg = students.filter((s) => s.average !== null);
        return with_avg.length > 0
          ? Math.round(with_avg.reduce((s, st) => s + st.average!, 0) / with_avg.length * 10) / 10
          : null;
      })()
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Grades
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Record and manage student assessment grades per class
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedClass && students.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => exportClassRosterPDF(
                  { name: selectedClass.name, teacherName: `${selectedClass.teacherFirstName} ${selectedClass.teacherLastName}` },
                  students,
                )}
              >
                <FileDown className="h-4 w-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => exportGradesExcel(
                  { name: selectedClass.name },
                  students,
                )}
              >
                <FileDown className="h-4 w-4" />
                Excel
              </Button>
            </>
          )}
          <Button variant="outline" size="icon" onClick={fetchGrades} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Class list ── */}
        <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">Classes</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {classesLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
            ) : classes.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No classes found
              </div>
            ) : (
              classes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClass(c)}
                  className={cn(
                    'w-full text-left rounded-lg p-3 transition-all border',
                    selectedClass?.id === c.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-accent border-transparent',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{c.name}</p>
                      <p className={cn('text-xs truncate mt-0.5', selectedClass?.id === c.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {c.teacherFirstName} {c.teacherLastName}
                      </p>
                    </div>
                    <ChevronRight className={cn('h-4 w-4 shrink-0 mt-0.5', selectedClass?.id === c.id ? 'text-primary-foreground' : 'text-muted-foreground')} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedClass ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <GraduationCap className="h-12 w-12 mb-3 opacity-20" />
              <p>Select a class to manage grades</p>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              {/* Class header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedClass.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedClass.teacherFirstName} {selectedClass.teacherLastName}
                    {selectedClass.location && <> · {selectedClass.location}</>}
                  </p>
                </div>
                {/* Class avg */}
                {classAvg !== null && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Class Average</p>
                      <p className={cn(
                        'text-lg font-bold',
                        classAvg >= 80 ? 'text-emerald-600' : classAvg >= 60 ? 'text-amber-600' : 'text-red-600',
                      )}>{classAvg}%</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Grade distribution */}
              {students.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {(['A', 'B', 'C', 'D', 'F'] as const).map((g) => {
                    const count = students.filter((s) => s.finalGrade?.startsWith(g)).length;
                    return (
                      <div key={g} className={cn('text-center p-3 rounded-xl border', gradeColor(g))}>
                        <p className="text-xl font-bold">{g}</p>
                        <p className="text-xs font-medium">{count} student{count !== 1 ? 's' : ''}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Student cards */}
              {studentsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
              ) : students.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                    <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
                    <p className="font-medium">No students enrolled</p>
                    <p className="text-sm mt-1">Enroll students from the Classes page first.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {students.map((s) => (
                    <StudentGradeCard
                      key={s.studentId}
                      student={{
                        ...s,
                        entries: s.entries.map((e) => ({ ...e, class_id: selectedClass.id })),
                      }}
                      classInfo={{ name: selectedClass.name, teacherName: `${selectedClass.teacherFirstName} ${selectedClass.teacherLastName}` }}
                      onRefresh={fetchGrades}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
