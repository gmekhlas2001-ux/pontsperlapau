/**
 * Attendance page.
 *
 * Two-panel flow:
 *  1. Select a class from the list (left panel / top on mobile).
 *  2. Pick a date, mark each enrolled student as present / absent / late /
 *     excused, and save.
 *
 * The "History" tab shows all previously recorded sessions for the selected
 * class with per-student colour-coded status pills.
 *
 * Teachers see only their own classes; admins/superadmins see all.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  getAttendanceForClass,
  getAttendanceDates,
  saveAttendance,
  type AttendanceStudent,
  type AttendanceStatus,
} from '@/services/attendanceService';
import { getClassesList, type ClassRecord } from '@/services/classService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ClipboardCheck, BookOpen, Users, Calendar, Save, RefreshCw,
  CheckCircle2, XCircle, Clock, FileText, ChevronRight, History,
} from 'lucide-react';
import { cn, getFullName } from '@/lib/utils';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AttendanceStatus, {
  label: string;
  icon: React.ElementType;
  bg: string;
  text: string;
  border: string;
}> = {
  present:  { label: 'Present',  icon: CheckCircle2, bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700' },
  absent:   { label: 'Absent',   icon: XCircle,      bg: 'bg-red-100 dark:bg-red-900/30',          text: 'text-red-700 dark:text-red-400',         border: 'border-red-300 dark:border-red-700' },
  late:     { label: 'Late',     icon: Clock,        bg: 'bg-amber-100 dark:bg-amber-900/30',      text: 'text-amber-700 dark:text-amber-400',     border: 'border-amber-300 dark:border-amber-700' },
  excused:  { label: 'Excused',  icon: FileText,     bg: 'bg-blue-100 dark:bg-blue-900/30',        text: 'text-blue-700 dark:text-blue-400',       border: 'border-blue-300 dark:border-blue-700' },
};

// ─── Mark sheet row ───────────────────────────────────────────────────────────

function StudentRow({
  student,
  status,
  notes,
  onStatus,
  onNotes,
}: {
  student: AttendanceStudent;
  status: AttendanceStatus;
  notes: string;
  onStatus: (s: AttendanceStatus) => void;
  onNotes: (n: string) => void;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      cfg.bg, cfg.border,
    )}>
      <div className="flex items-center gap-3 flex-wrap">
        <AvatarWithFallback
          firstName={student.firstName}
          lastName={student.lastName}
          className="h-9 w-9 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">
            {getFullName(student.firstName, student.lastName)}
          </p>
          <p className="text-xs text-muted-foreground">{student.studentCode}</p>
        </div>

        {/* Status buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
            const c = STATUS_CONFIG[s];
            const SIcon = c.icon;
            return (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                  status === s
                    ? cn(c.bg, c.text, c.border, 'ring-2 ring-offset-1 ring-current')
                    : 'bg-background text-muted-foreground border-border hover:border-current',
                )}
              >
                <SIcon className="h-3 w-3" />
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Status pill */}
        <div className={cn('flex items-center gap-1 shrink-0 px-2 py-1 rounded-full text-xs font-bold', cfg.text)}>
          <Icon className="h-3.5 w-3.5" />
          {cfg.label}
        </div>
      </div>

      {/* Notes */}
      {(status === 'late' || status === 'excused' || notes) && (
        <div className="mt-3">
          <Textarea
            rows={1}
            placeholder="Optional note..."
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            className="text-xs resize-none bg-background/70"
          />
        </div>
      )}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ classId }: { classId: string }) {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAttendanceDates(classId).then((d) => {
      setDates(d);
      if (d.length > 0) setSelectedDate(d[0]);
    });
  }, [classId]);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    getAttendanceForClass(classId, selectedDate).then((res) => {
      if (res.success && res.data) setStudents(res.data);
      setLoading(false);
    });
  }, [classId, selectedDate]);

  if (dates.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground text-sm">
        <History className="h-10 w-10 mb-3 opacity-30" />
        <p>No sessions recorded yet.</p>
      </div>
    );
  }

  // Summary counts for selected date
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  students.forEach((s) => { if (s.record) counts[s.record.status]++; });

  return (
    <div className="space-y-4">
      {/* Date selector */}
      <Select value={selectedDate} onValueChange={setSelectedDate}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Select session date" />
        </SelectTrigger>
        <SelectContent>
          {dates.map((d) => (
            <SelectItem key={d} value={d}>
              {format(new Date(d), 'EEE, MMM d yyyy')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Summary pills */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
          const c = STATUS_CONFIG[s];
          return (
            <div key={s} className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border', c.bg, c.text, c.border)}>
              {c.label}: {counts[s]}
            </div>
          );
        })}
      </div>

      {/* Student list */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {students.map((s) => {
            const status = s.record?.status ?? 'absent';
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            return (
              <div key={s.studentId} className={cn('flex items-center gap-3 p-3 rounded-xl border', cfg.bg, cfg.border)}>
                <AvatarWithFallback firstName={s.firstName} lastName={s.lastName} className="h-8 w-8 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{getFullName(s.firstName, s.lastName)}</p>
                  <p className="text-xs text-muted-foreground">{s.studentCode}</p>
                </div>
                <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.text)}>
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </div>
                {s.record?.notes && (
                  <p className="text-xs text-muted-foreground italic max-w-[120px] truncate">{s.record.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Attendance() {
  useTranslation();
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassRecord | null>(null);

  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-student draft state: { [studentId]: { status, notes } }
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; notes: string }>>({});

  // Load classes
  const fetchClasses = useCallback(async () => {
    setClassesLoading(true);
    const res = await getClassesList();
    if (res.success && res.data) {
      // Teachers only see their own classes
      const filtered = user?.role === 'teacher'
        ? res.data.filter((c) => c.teacherId === user?.id)
        : res.data.filter((c) => c.status === 'active');
      setClasses(filtered);
      if (filtered.length > 0 && !selectedClass) setSelectedClass(filtered[0]);
    }
    setClassesLoading(false);
  }, [user]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // Load mark-sheet whenever class or date changes
  useEffect(() => {
    if (!selectedClass) return;
    setSheetLoading(true);
    setDraft({});
    getAttendanceForClass(selectedClass.id, date).then((res) => {
      if (res.success && res.data) {
        setStudents(res.data);
        // Pre-fill draft from existing records
        const initial: Record<string, { status: AttendanceStatus; notes: string }> = {};
        res.data.forEach((s) => {
          initial[s.studentId] = {
            status: s.record?.status ?? 'present',
            notes: s.record?.notes ?? '',
          };
        });
        setDraft(initial);
      }
      setSheetLoading(false);
    });
  }, [selectedClass, date]);

  const handleSave = async () => {
    if (!selectedClass) return;
    setSaving(true);
    const entries = students.map((s) => ({
      studentId: s.studentId,
      status: draft[s.studentId]?.status ?? 'present',
      notes: draft[s.studentId]?.notes ?? '',
    }));
    const res = await saveAttendance(selectedClass.id, date, entries);
    if (res.success) {
      toast.success('Attendance saved successfully');
    } else {
      toast.error(res.error ?? 'Failed to save attendance');
    }
    setSaving(false);
  };

  // Summary counts for current draft
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  students.forEach((s) => {
    const st = draft[s.studentId]?.status ?? 'present';
    counts[st]++;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Attendance
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Mark and track student attendance per class session
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchClasses} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Class list (left panel) ── */}
        <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">Classes</p>
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
                      <p className={cn(
                        'text-xs truncate mt-0.5',
                        selectedClass?.id === c.id ? 'text-primary-foreground/70' : 'text-muted-foreground',
                      )}>
                        {c.teacherFirstName} {c.teacherLastName}
                      </p>
                      {c.scheduleDays.length > 0 && (
                        <p className={cn(
                          'text-xs mt-0.5',
                          selectedClass?.id === c.id ? 'text-primary-foreground/60' : 'text-muted-foreground/70',
                        )}>
                          {c.scheduleDays.slice(0, 3).join(', ')}{c.scheduleDays.length > 3 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight className={cn(
                      'h-4 w-4 shrink-0 mt-0.5',
                      selectedClass?.id === c.id ? 'text-primary-foreground' : 'text-muted-foreground',
                    )} />
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
              <ClipboardCheck className="h-12 w-12 mb-3 opacity-20" />
              <p>Select a class to take attendance</p>
            </div>
          ) : (
            <div className="p-6">
              {/* Class header */}
              <div className="mb-5">
                <h2 className="text-xl font-bold">{selectedClass.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {selectedClass.teacherFirstName} {selectedClass.teacherLastName}
                  {selectedClass.location && <> · {selectedClass.location}</>}
                </p>
              </div>

              <Tabs defaultValue="mark">
                <TabsList className="mb-5">
                  <TabsTrigger value="mark" className="flex items-center gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Mark Attendance
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" /> History
                  </TabsTrigger>
                </TabsList>

                {/* ── Mark sheet ── */}
                <TabsContent value="mark" className="space-y-5">
                  {/* Date picker + summary */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-44"
                      />
                    </div>

                    {/* Quick summary pills */}
                    {students.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
                          const c = STATUS_CONFIG[s];
                          return (
                            <div key={s} className={cn('flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border', c.bg, c.text, c.border)}>
                              {c.label}: {counts[s]}
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                          <Users className="h-3 w-3" /> Total: {students.length}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick-select all buttons */}
                  {students.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Mark all as:</span>
                      {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
                        const c = STATUS_CONFIG[s];
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              const next = { ...draft };
                              students.forEach((st) => { next[st.studentId] = { ...next[st.studentId], status: s }; });
                              setDraft(next);
                            }}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all',
                              c.bg, c.text, c.border, 'hover:opacity-90',
                            )}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Student rows */}
                  {sheetLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                    </div>
                  ) : students.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                        <Users className="h-10 w-10 mb-3 opacity-30" />
                        <p className="font-medium">No students enrolled</p>
                        <p className="text-sm mt-1">Enroll students from the Classes page first.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {students.map((s) => (
                          <StudentRow
                            key={s.studentId}
                            student={s}
                            status={draft[s.studentId]?.status ?? 'present'}
                            notes={draft[s.studentId]?.notes ?? ''}
                            onStatus={(status) => setDraft((prev) => ({ ...prev, [s.studentId]: { ...prev[s.studentId], status } }))}
                            onNotes={(notes) => setDraft((prev) => ({ ...prev, [s.studentId]: { ...prev[s.studentId], notes } }))}
                          />
                        ))}
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button onClick={handleSave} disabled={saving} className="min-w-[130px]">
                          {saving ? (
                            <span className="flex items-center gap-2">
                              <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              Saving…
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Save className="h-4 w-4" /> Save Attendance
                            </span>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* ── History ── */}
                <TabsContent value="history">
                  <HistoryTab classId={selectedClass.id} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
