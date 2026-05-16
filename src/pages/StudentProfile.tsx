/**
 * Student Profile page.
 *
 * Full-screen profile accessible at /students/:id
 * Tabs:
 *   Overview    — contact info, academic summary, quick stats
 *   Academic    — per-class grade cards with every assessment entry
 *   Attendance  — per-class attendance breakdown (present/absent/late/excused)
 *   Personal    — personal details, family & emergency contacts, medical notes
 *
 * All data is fetched in a single getStudentProfile() call which composes
 * the student row, class enrollments, grade_entries, and attendance records.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  getStudentProfile,
  type StudentProfileData,
  type StudentProfileClass,
} from '@/services/studentService';
import { getMyChildren } from '@/services/parentService';
import { useAuth } from '@/contexts/AuthContext';
import { exportReportCardPDF, exportGradesExcel, exportCertificatePDF } from '@/services/exportService';
import type { GradeStudent } from '@/services/gradesService';
import { DocumentsManager } from '@/components/DocumentsManager';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, GraduationCap, BookOpen, ClipboardCheck, User,
  Phone, Mail, MapPin, Calendar, Hash, Building2, Shield,
  Users, Heart, FileText, TrendingUp, Award, FileDown, AlertCircle, Paperclip, Medal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── helpers ─────────────────────────────────────────────────────────────────

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) age--;
  return age;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return d; }
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  B: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  C: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  F: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

function gradeColor(g: string | null) {
  if (!g) return 'bg-muted text-muted-foreground';
  return GRADE_COLORS[g.charAt(0).toUpperCase()] ?? 'bg-muted text-muted-foreground';
}

// ─── small components ─────────────────────────────────────────────────────────

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className={cn('text-sm mt-0.5', value ? 'font-medium' : 'text-muted-foreground italic')}>{value ?? '—'}</p>
      </div>
    </div>
  );
}

function AttendancePill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-2 rounded-xl border text-center', color)}>
      <p className="text-xl font-bold">{count}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ student }: { student: StudentProfileData }) {
  const totalSessions = student.classes.reduce(
    (sum, c) => sum + c.totalPresent + c.totalAbsent + c.totalLate + c.totalExcused, 0
  );
  const presentSessions = student.classes.reduce((sum, c) => sum + c.totalPresent, 0);
  const overallAttendance = totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 100) : null;

  const gradedClasses = student.classes.filter((c) => c.averageScore !== null);
  const overallAvg = gradedClasses.length > 0
    ? Math.round(gradedClasses.reduce((sum, c) => sum + c.averageScore!, 0) / gradedClasses.length * 10) / 10
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{student.classes.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Classes enrolled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className={cn('text-2xl font-bold', overallAvg === null ? 'text-muted-foreground' : overallAvg >= 80 ? 'text-emerald-600' : overallAvg >= 60 ? 'text-amber-600' : 'text-red-600')}>
              {overallAvg !== null ? `${overallAvg}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Overall average</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardCheck className="h-5 w-5 text-blue-500 mx-auto mb-1" />
            <p className={cn('text-2xl font-bold', overallAttendance === null ? 'text-muted-foreground' : overallAttendance >= 80 ? 'text-emerald-600' : overallAttendance >= 60 ? 'text-amber-600' : 'text-red-600')}>
              {overallAttendance !== null ? `${overallAttendance}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Attendance rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Award className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">
              {student.classes.filter((c) => c.finalGrade).length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Graded classes</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field icon={Mail} label="Email" value={student.email} />
          <Field icon={Phone} label="Phone" value={student.phone} />
          <Field icon={MapPin} label="Address" value={student.address} />
          <Field icon={Building2} label="Branch" value={student.branchName ?? student.branchId ?? undefined} />
        </div>
      </div>

      <Separator />

      {/* Academic summary */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Academic</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field icon={GraduationCap} label="Grade Level" value={student.gradeLevel ?? undefined} />
          <Field icon={Calendar} label="Enrolled" value={formatDate(student.enrollmentDate)} />
          <Field icon={Hash} label="Student ID" value={student.studentCode} />
          <Field icon={Shield} label="Nationality" value={student.nationality ?? undefined} />
        </div>
      </div>

      {/* Class overview mini-table */}
      {student.classes.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Enrolled Classes</p>
            <div className="space-y-2">
              {student.classes.map((c) => (
                <div key={c.classId} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.className}</p>
                    <p className="text-xs text-muted-foreground">{c.teacherFirstName} {c.teacherLastName}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.averageScore !== null && (
                      <span className={cn('text-xs font-semibold', c.averageScore >= 80 ? 'text-emerald-600' : c.averageScore >= 60 ? 'text-amber-600' : 'text-red-600')}>
                        {c.averageScore}%
                      </span>
                    )}
                    {c.finalGrade && (
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', gradeColor(c.finalGrade))}>
                        {c.finalGrade}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{c.attendancePct}% att.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Academic tab ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  midterm:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  final:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  assignment: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  quiz:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  project:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  other:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function AcademicTab({ student }: { student: StudentProfileData }) {
  if (student.classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <BookOpen className="h-12 w-12 mb-3 opacity-20" />
        <p>Not enrolled in any classes yet.</p>
      </div>
    );
  }

  const handleExportReportCard = (cls: StudentProfileClass) => {
    // Convert to GradeStudent shape for the export function
    const gs: GradeStudent = {
      enrollmentId: cls.enrollmentId,
      studentId: student.id,
      userId: student.userId,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      finalGrade: cls.finalGrade,
      attendancePct: cls.attendancePct,
      entries: cls.gradeEntries.map((e) => ({
        id: e.id,
        class_id: cls.classId,
        student_id: student.id,
        assessment_name: e.assessmentName,
        assessment_type: e.assessmentType as any,
        score: e.score,
        max_score: e.maxScore,
        grade_letter: e.gradeLetter,
        notes: null,
        assessment_date: e.assessmentDate,
        recorded_by: null,
        created_at: '',
      })),
      average: cls.averageScore,
    };
    exportReportCardPDF({ name: cls.className, teacherName: `${cls.teacherFirstName} ${cls.teacherLastName}` }, gs);
  };

  const handleExportExcel = (cls: StudentProfileClass) => {
    const gs: GradeStudent = {
      enrollmentId: cls.enrollmentId,
      studentId: student.id,
      userId: student.userId,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      finalGrade: cls.finalGrade,
      attendancePct: cls.attendancePct,
      entries: cls.gradeEntries.map((e) => ({
        id: e.id,
        class_id: cls.classId,
        student_id: student.id,
        assessment_name: e.assessmentName,
        assessment_type: e.assessmentType as any,
        score: e.score,
        max_score: e.maxScore,
        grade_letter: e.gradeLetter,
        notes: null,
        assessment_date: e.assessmentDate,
        recorded_by: null,
        created_at: '',
      })),
      average: cls.averageScore,
    };
    exportGradesExcel({ name: cls.className }, [gs]);
  };

  return (
    <div className="p-6 space-y-4">
      {student.classes.map((cls) => (
        <Card key={cls.classId} className="overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-muted/20">
            <div>
              <p className="font-semibold">{cls.className}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cls.teacherFirstName} {cls.teacherLastName}
                {cls.subject && <> · {cls.subject}</>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {cls.averageScore !== null && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Avg</p>
                  <p className={cn('text-sm font-bold', cls.averageScore >= 80 ? 'text-emerald-600' : cls.averageScore >= 60 ? 'text-amber-600' : 'text-red-600')}>
                    {cls.averageScore}%
                  </p>
                </div>
              )}
              {cls.finalGrade && (
                <div className={cn('px-3 py-1 rounded-full text-sm font-bold', gradeColor(cls.finalGrade))}>
                  {cls.finalGrade}
                </div>
              )}
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => handleExportReportCard(cls)}>
                  <FileDown className="h-3 w-3" /> PDF
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => handleExportExcel(cls)}>
                  <FileDown className="h-3 w-3" /> XLS
                </Button>
              </div>
            </div>
          </div>
          <CardContent className="p-4">
            {cls.gradeEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No assessments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {cls.gradeEntries.map((e) => {
                  const pct = e.score !== null ? Math.round((e.score / e.maxScore) * 100) : null;
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{e.assessmentName}</p>
                          <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium', TYPE_COLORS[e.assessmentType] ?? TYPE_COLORS.other)}>
                            {e.assessmentType.charAt(0).toUpperCase() + e.assessmentType.slice(1)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.assessmentDate)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {e.score !== null ? (
                          <>
                            <p className="font-bold text-sm">{e.score} / {e.maxScore}</p>
                            <p className={cn('text-xs font-semibold', pct! >= 80 ? 'text-emerald-600' : pct! >= 60 ? 'text-amber-600' : 'text-red-600')}>
                              {pct}%
                            </p>
                          </>
                        ) : <p className="text-sm text-muted-foreground">—</p>}
                      </div>
                      {e.gradeLetter && (
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0', gradeColor(e.gradeLetter))}>
                          {e.gradeLetter}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Attendance tab ───────────────────────────────────────────────────────────

function AttendanceTab({ student }: { student: StudentProfileData }) {
  if (student.classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ClipboardCheck className="h-12 w-12 mb-3 opacity-20" />
        <p>No attendance data available.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {student.classes.map((cls) => {
        const total = cls.totalPresent + cls.totalAbsent + cls.totalLate + cls.totalExcused;
        const pct = total > 0 ? Math.round((cls.totalPresent / total) * 100) : null;

        return (
          <Card key={cls.classId}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{cls.className}</span>
                {pct !== null && (
                  <span className={cn('text-sm font-bold', pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600')}>
                    {pct}% rate
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{cls.teacherFirstName} {cls.teacherLastName}</p>
            </CardHeader>
            <CardContent className="pb-4">
              {total === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No attendance recorded yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <AttendancePill label="Present" count={cls.totalPresent} color="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" />
                    <AttendancePill label="Absent" count={cls.totalAbsent} color="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400" />
                    <AttendancePill label="Late" count={cls.totalLate} color="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400" />
                    <AttendancePill label="Excused" count={cls.totalExcused} color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Attendance rate</span>
                      <span>{pct ?? '—'}% ({cls.totalPresent} of {total} sessions)</span>
                    </div>
                    <Progress value={pct ?? 0} className="h-2" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Personal tab ─────────────────────────────────────────────────────────────

function PersonalTab({ student }: { student: StudentProfileData }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Personal Information</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field icon={Calendar} label="Date of Birth" value={student.dateOfBirth ? `${formatDate(student.dateOfBirth)} · Age ${calculateAge(student.dateOfBirth)}` : null} />
          <Field icon={User} label="Gender" value={student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1).replace('_', ' ') : null} />
          <Field icon={User} label="Father's Name" value={student.fatherName} />
          <Field icon={Shield} label="Nationality" value={student.nationality} />
          <Field icon={FileText} label="Passport / ID No." value={student.passportNumber} />
          <Field icon={MapPin} label="Address" value={student.address} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Parent / Guardian</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field icon={Users} label="Full Name" value={student.parentGuardianName} />
          <Field icon={Phone} label="Phone" value={student.parentGuardianPhone} />
          <Field icon={Mail} label="Email" value={student.parentGuardianEmail} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Emergency Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field icon={Users} label="Name" value={student.emergencyContactName} />
          <Field icon={Phone} label="Phone" value={student.emergencyContactPhone} />
          <Field icon={User} label="Relationship" value={student.emergencyContactRelationship} />
        </div>
      </div>

      {(student.medicalNotes || student.allergies) && (
        <>
          <Separator />
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Medical</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field icon={Heart} label="Medical Notes" value={student.medicalNotes} />
              <Field icon={AlertCircle} label="Allergies" value={student.allergies} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [student, setStudent] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadProfile() {
      if (!id) return;
      setLoading(true);

      if (user?.role === 'parent') {
        const children = await getMyChildren(user.id);
        if (cancelled) return;
        const canView = children.success && children.data?.some((child) => child.studentId === id);
        if (!canView) {
          navigate('/parent-portal', { replace: true });
          return;
        }
      }

      const res = await getStudentProfile(id);
      if (cancelled) return;
      if (res.success && res.data) {
        if (user?.role === 'student' && res.data.userId !== user.id) {
          navigate('/', { replace: true });
          return;
        }
        setStudent(res.data);
      } else {
        toast.error(res.error ?? 'Could not load student profile');
      }
      setLoading(false);
    }

    loadProfile();
    return () => { cancelled = true; };
  }, [id, user?.id, user?.role, navigate]);

  const backTarget = user?.role === 'parent' ? '/parent-portal' : '/students';
  const backLabel = user?.role === 'parent' ? 'Parent Portal' : 'Students';

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
        <GraduationCap className="h-12 w-12 mb-3 opacity-20" />
        <p className="font-medium">Student not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(backTarget)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to {backLabel}
        </Button>
      </div>
    );
  }

  const fullName = `${student.firstName} ${student.lastName}`.trim();
  const canExportCertificates = user?.role !== 'student' && user?.role !== 'parent';
  const canSeeDocuments = user?.role === 'superadmin' || user?.role === 'admin';

  return (
    <div className="flex flex-col h-full">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-muted/20">
        <Button variant="ghost" size="sm" onClick={() => navigate(backTarget)} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{fullName}</span>
      </div>

      {/* Profile hero */}
      <div className="shrink-0 border-b bg-gradient-to-br from-primary/10 via-card to-accent/50 px-6 pt-7 pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
          <AvatarWithFallback
            src={student.profilePictureUrl ?? undefined}
            firstName={student.firstName}
            lastName={student.lastName}
            className="h-20 w-20 text-xl ring-4 ring-background shadow-md shrink-0"
          />
          <div className="flex-1 min-w-0 pt-1">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{fullName}</h1>
            {student.studentCode && (
              <p className="mt-1 text-xs font-mono text-muted-foreground">{student.studentCode}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {student.gradeLevel && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {student.gradeLevel}
                </span>
              )}
              <StatusBadge status={student.status as any} />
              <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {student.classes.length} class{student.classes.length !== 1 ? 'es' : ''}
              </span>
            </div>
            {canExportCertificates && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-border/70 bg-background/80 text-xs"
                  onClick={() => exportCertificatePDF({
                    studentFirstName: student.firstName,
                    studentLastName: student.lastName,
                    studentCode: student.studentCode ?? '',
                    type: 'enrollment',
                  })}
                >
                  <Medal className="h-3.5 w-3.5" /> Enrollment Certificate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-border/70 bg-background/80 text-xs"
                  onClick={() => exportCertificatePDF({
                    studentFirstName: student.firstName,
                    studentLastName: student.lastName,
                    studentCode: student.studentCode ?? '',
                    type: 'completion',
                  })}
                >
                  <Medal className="h-3.5 w-3.5" /> Completion Certificate
                </Button>
              </div>
            )}
          </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:min-w-[320px]">
            <div className="rounded-lg border border-border/70 bg-background/75 p-3 shadow-xs">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Branch</p>
              <p className="mt-1 truncate text-sm font-semibold">{student.branchName || '—'}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/75 p-3 shadow-xs">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Enrolled</p>
              <p className="mt-1 truncate text-sm font-semibold">{formatDate(student.enrollmentDate)}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/75 p-3 shadow-xs">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Classes</p>
              <p className="mt-1 truncate text-sm font-semibold">{student.classes.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="flex flex-col h-full">
          <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b bg-muted/35 px-4 py-2">
            <TabsTrigger value="overview" className="text-xs gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="academic" className="text-xs gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> Academic
            </TabsTrigger>
            <TabsTrigger value="attendance" className="text-xs gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" /> Attendance
            </TabsTrigger>
            <TabsTrigger value="personal" className="text-xs gap-1.5">
              <User className="h-3.5 w-3.5" /> Personal
            </TabsTrigger>
            {canSeeDocuments && (
              <TabsTrigger value="documents" className="text-xs gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Documents
              </TabsTrigger>
            )}
          </TabsList>
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="overview" className="mt-0">
              <OverviewTab student={student} />
            </TabsContent>
            <TabsContent value="academic" className="mt-0">
              <AcademicTab student={student} />
            </TabsContent>
            <TabsContent value="attendance" className="mt-0">
              <AttendanceTab student={student} />
            </TabsContent>
            <TabsContent value="personal" className="mt-0">
              <PersonalTab student={student} />
            </TabsContent>
            {canSeeDocuments && (
              <TabsContent value="documents" className="mt-0 p-6">
                <DocumentsManager userId={student.userId} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
