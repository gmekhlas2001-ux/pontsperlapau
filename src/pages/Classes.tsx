import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getClassesList,
  createClass,
  updateClass,
  deleteClass,
  getTeachers,
  getClassEnrollments,
  getStudentsByBranch,
  enrollStudent,
  unenrollStudent,
  type ClassRecord,
  type ClassTeacher,
  type BranchStudent,
} from '@/services/classService';
import { getBranches, type Branch } from '@/services/branchService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, MoveHorizontal as MoreHorizontal, Users, Clock, MapPin, Pencil, Trash2, Calendar, BookOpen, GraduationCap, Building2, Search, UserPlus, UserMinus, Loader2 } from 'lucide-react';

const DAYS = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const SEMESTERS = [
  { value: 'fall', label: 'Fall' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
];

interface ClassFormData {
  name: string;
  description: string;
  teacherId: string;
  branchId: string;
  location: string;
  maxCapacity: string;
  scheduleDays: string[];
  scheduleTime: string;
  scheduleEndTime: string;
  academicYear: string;
  semester: string;
}

const emptyForm: ClassFormData = {
  name: '',
  description: '',
  teacherId: '',
  branchId: '',
  location: '',
  maxCapacity: '30',
  scheduleDays: [],
  scheduleTime: '',
  scheduleEndTime: '',
  academicYear: '',
  semester: '',
};

export function Classes() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classStatus, setClassStatus] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassRecord | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [branchStudents, setBranchStudents] = useState<BranchStudent[]>([]);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [unenrollingId, setUnenrollingId] = useState<string | null>(null);
  const [classToDelete, setClassToDelete] = useState<ClassRecord | null>(null);

  const [form, setForm] = useState<ClassFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [classRes, teacherRes, branchRes] = await Promise.all([
      getClassesList(),
      getTeachers(),
      getBranches(),
    ]);
    if (classRes.success) setClasses(classRes.data ?? []);
    if (teacherRes.success) setTeachers(teacherRes.data ?? []);
    if (branchRes.success) setBranches(branchRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAddDialog = () => {
    setEditingClass(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditDialog = (cls: ClassRecord) => {
    setEditingClass(cls);
    setForm({
      name: cls.name,
      description: cls.description ?? '',
      teacherId: cls.teacherId,
      branchId: cls.branchId ?? '',
      location: cls.location ?? '',
      maxCapacity: String(cls.maxCapacity),
      scheduleDays: cls.scheduleDays,
      scheduleTime: cls.scheduleTime ?? '',
      scheduleEndTime: cls.scheduleEndTime ?? '',
      academicYear: cls.academicYear ?? '',
      semester: cls.semester ?? '',
    });
    setIsFormOpen(true);
  };

  const openDetailDialog = async (cls: ClassRecord) => {
    setSelectedClass(cls);
    setIsDetailOpen(true);
    setEnrollSearch('');
    setBranchStudents([]);
    setEnrollments([]);

    const [enrollRes, studentsRes] = await Promise.all([
      getClassEnrollments(cls.id),
      cls.branchId
        ? getStudentsByBranch(cls.branchId)
        : Promise.resolve({ success: true, data: [] as BranchStudent[] }),
    ]);

    if (enrollRes.success) setEnrollments(enrollRes.data ?? []);
    if (studentsRes.success) setBranchStudents(studentsRes.data ?? []);
  };

  const handleEnroll = async (studentId: string) => {
    if (!selectedClass) return;
    setEnrollingId(studentId);
    const res = await enrollStudent(selectedClass.id, studentId);
    if (res.success) {
      toast.success('Student enrolled successfully');
      const enrollRes = await getClassEnrollments(selectedClass.id);
      if (enrollRes.success) setEnrollments(enrollRes.data ?? []);
    } else {
      toast.error(res.error || 'Failed to enroll student');
    }
    setEnrollingId(null);
  };

  const handleUnenroll = async (enrollmentId: string) => {
    setUnenrollingId(enrollmentId);
    const res = await unenrollStudent(enrollmentId);
    if (res.success) {
      toast.success('Student removed from class');
      setEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId));
    } else {
      toast.error(res.error || 'Failed to remove student');
    }
    setUnenrollingId(null);
  };

  const confirmDelete = (cls: ClassRecord) => {
    setClassToDelete(cls);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!classToDelete) return;
    const res = await deleteClass(classToDelete.id);
    if (res.success) {
      toast.success('Class deleted successfully');
      setClasses((prev) => prev.filter((c) => c.id !== classToDelete.id));
    } else {
      toast.error(res.error || 'Failed to delete class');
    }
    setIsDeleteOpen(false);
    setClassToDelete(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Class name is required');
      return;
    }
    if (!form.teacherId) {
      toast.error('Please select a teacher');
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      teacherId: form.teacherId,
      branchId: (form.branchId && form.branchId !== 'none') ? form.branchId : null,
      location: form.location.trim() || undefined,
      maxCapacity: parseInt(form.maxCapacity) || 30,
      scheduleDays: form.scheduleDays,
      scheduleTime: form.scheduleTime || undefined,
      scheduleEndTime: form.scheduleEndTime || undefined,
      academicYear: form.academicYear.trim() || undefined,
      semester: (form.semester as 'fall' | 'spring' | 'summer') || undefined,
      createdBy: user?.id,
    };

    let res;
    if (editingClass) {
      res = await updateClass(editingClass.id, payload);
    } else {
      res = await createClass(payload);
    }

    setSaving(false);

    if (res.success) {
      toast.success(editingClass ? 'Class updated successfully' : 'Class created successfully');
      setIsFormOpen(false);
      loadData();
    } else {
      toast.error(res.error || 'Failed to save class');
    }
  };

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      scheduleDays: prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter((d) => d !== day)
        : [...prev.scheduleDays, day],
    }));
  };

  const getDayLabel = (day: string) => {
    const found = DAYS.find((d) => d.value === day);
    return found?.label ?? day;
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time.slice(0, 5);
  };

  const filteredClasses = classes.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      `${c.teacherFirstName} ${c.teacherLastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (c.branchName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = classStatus === 'all' || c.status === classStatus;
    return matchesSearch && matchesStatus;
  });

  const enrolledStudentIds = new Set(enrollments.map((e) => e.student_id));
  const availableStudents = branchStudents.filter((s) => !enrolledStudentIds.has(s.id));
  const filteredAvailable = availableStudents.filter((s) =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(enrollSearch.toLowerCase()) ||
    s.studentId.toLowerCase().includes(enrollSearch.toLowerCase())
  );

  const selectedTeacher = teachers.find((t) => t.id === form.teacherId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('classes.title')}</h1>
          <p className="text-muted-foreground">{t('classes.classList')}</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t('classes.addClass')}
        </Button>
      </div>

      {/* Search + Status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search classes, teachers, branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-1">
          {(['all', 'active', 'inactive', 'archived'] as const).map((s) => (
            <Button
              key={s}
              variant={classStatus === s ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setClassStatus(s)}
            >
              <span className="capitalize">{s}</span>
              <span className="ml-1.5 text-xs opacity-60">
                {s === 'all' ? classes.length : classes.filter((c) => c.status === s).length}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Classes Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-8 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <GraduationCap className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            {search ? 'No classes match your search' : 'No classes yet'}
          </p>
          {!search && (
            <Button className="mt-4" onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add your first class
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClasses.map((cls) => (
            <Card key={cls.id} className="hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{cls.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {cls.teacherFirstName} {cls.teacherLastName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <StatusBadge status={cls.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(cls)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => confirmDelete(cls)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {cls.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{cls.description}</p>
                )}

                <div className="space-y-1.5">
                  {cls.scheduleDays.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">
                        {cls.scheduleDays.map(getDayLabel).join(' · ')}
                        {cls.scheduleTime && ` · ${formatTime(cls.scheduleTime)}`}
                        {cls.scheduleEndTime && `–${formatTime(cls.scheduleEndTime)}`}
                      </span>
                    </div>
                  )}
                  {cls.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{cls.location}</span>
                    </div>
                  )}
                  {cls.branchName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{cls.branchName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Capacity: {cls.maxCapacity}
                    </span>
                  </div>
                </div>

                {(cls.academicYear || cls.semester) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {cls.academicYear && (
                      <Badge variant="secondary" className="text-xs">
                        {cls.academicYear}
                      </Badge>
                    )}
                    {cls.semester && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {cls.semester}
                      </Badge>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1"
                  onClick={() => openDetailDialog(cls)}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t('common.view')} Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? t('common.edit') + ' Class' : t('classes.addClass')}
            </DialogTitle>
            <DialogDescription>
              {editingClass ? 'Update class details below.' : 'Fill in the details to create a new class.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name & Description */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  {t('classes.className')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Mathematics 101"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">{t('classes.description')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Brief description of the class..."
                  rows={2}
                />
              </div>
            </div>

            {/* Teacher */}
            <div className="space-y-1.5">
              <Label>
                {t('classes.teacher')} <span className="text-red-500">*</span>
              </Label>
              {teachers.length === 0 ? (
                <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
                  No teachers found. Add a staff member with the teacher role first.
                </p>
              ) : (
                <Select
                  value={form.teacherId}
                  onValueChange={(v) => {
                    const t = teachers.find((x) => x.id === v);
                    setForm((p) => ({
                      ...p,
                      teacherId: v,
                      branchId: t?.branchId ?? p.branchId,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a teacher..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        <div className="flex flex-col">
                          <span>
                            {teacher.firstName} {teacher.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {teacher.position}
                            {teacher.branchName && ` · ${teacher.branchName}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedTeacher?.branchName && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Teacher is from <strong>{selectedTeacher.branchName}</strong>
                </p>
              )}
            </div>

            {/* Branch */}
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={form.branchId}
                onValueChange={(v) => setForm((p) => ({ ...p, branchId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a branch..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} — {b.province}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location & Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="location">{t('classes.room')}</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="e.g. Room 204"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxCapacity">{t('classes.maxCapacity')}</Label>
                <Input
                  id="maxCapacity"
                  type="number"
                  min="1"
                  value={form.maxCapacity}
                  onChange={(e) => setForm((p) => ({ ...p, maxCapacity: e.target.value }))}
                />
              </div>
            </div>

            {/* Schedule Days */}
            <div className="space-y-2">
              <Label>Schedule Days</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                      form.scheduleDays.includes(day.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={form.scheduleTime}
                  onChange={(e) => setForm((p) => ({ ...p, scheduleTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={form.scheduleEndTime}
                  onChange={(e) => setForm((p) => ({ ...p, scheduleEndTime: e.target.value }))}
                />
              </div>
            </div>

            {/* Academic Year & Semester */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="academicYear">Academic Year</Label>
                <Input
                  id="academicYear"
                  value={form.academicYear}
                  onChange={(e) => setForm((p) => ({ ...p, academicYear: e.target.value }))}
                  placeholder="e.g. 2024-2025"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Semester</Label>
                <Select
                  value={form.semester}
                  onValueChange={(v) => setForm((p) => ({ ...p, semester: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Class Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedClass && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedClass.name}</DialogTitle>
                <DialogDescription>
                  {selectedClass.teacherFirstName} {selectedClass.teacherLastName}
                  {selectedClass.branchName && ` · ${selectedClass.branchName}`}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="info" className="mt-2">
                <TabsList>
                  <TabsTrigger value="info">{t('classes.classDetails')}</TabsTrigger>
                  <TabsTrigger value="students">
                    {t('classes.studentsEnrolled')}
                    {enrollments.length > 0 && (
                      <span className="ml-1.5 bg-primary/10 text-primary text-xs rounded-full px-1.5 py-0.5">
                        {enrollments.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="schedule">{t('classes.schedule')}</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Teacher</Label>
                      <p className="font-medium mt-0.5">
                        {selectedClass.teacherFirstName} {selectedClass.teacherLastName}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Branch</Label>
                      <p className="font-medium mt-0.5">{selectedClass.branchName ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{t('classes.room')}</Label>
                      <p className="font-medium mt-0.5">{selectedClass.location ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{t('classes.maxCapacity')}</Label>
                      <p className="font-medium mt-0.5">{selectedClass.maxCapacity}</p>
                    </div>
                    {selectedClass.academicYear && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Academic Year</Label>
                        <p className="font-medium mt-0.5">{selectedClass.academicYear}</p>
                      </div>
                    )}
                    {selectedClass.semester && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Semester</Label>
                        <p className="font-medium mt-0.5 capitalize">{selectedClass.semester}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
                      <div className="mt-1">
                        <StatusBadge status={selectedClass.status} />
                      </div>
                    </div>
                  </div>
                  {selectedClass.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Description</Label>
                      <p className="mt-1 text-sm">{selectedClass.description}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="students" className="mt-4 space-y-5">
                  {/* Enrolled students */}
                  <div>
                    <p className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">
                      Enrolled ({enrollments.length})
                    </p>
                    {enrollments.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground border rounded-lg">
                        <Users className="h-7 w-7 mx-auto mb-1.5 opacity-40" />
                        <p className="text-sm">No students enrolled yet</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {enrollments.map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                          >
                            <div>
                              <p className="font-medium text-sm">
                                {e.student?.user?.first_name} {e.student?.user?.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ID: {e.student?.student_id || '—'}
                                {e.attendance_percentage != null && ` · ${e.attendance_percentage}% attendance`}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                              disabled={unenrollingId === e.id}
                              onClick={() => handleUnenroll(e.id)}
                            >
                              {unenrollingId === e.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <UserMinus className="h-4 w-4" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add students from branch */}
                  {selectedClass.branchId ? (
                    <div>
                      <p className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">
                        Add from {selectedClass.branchName}
                      </p>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search students by name or ID..."
                          value={enrollSearch}
                          onChange={(e) => setEnrollSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      {filteredAvailable.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground border rounded-lg">
                          <GraduationCap className="h-7 w-7 mx-auto mb-1.5 opacity-40" />
                          <p className="text-sm">
                            {availableStudents.length === 0
                              ? 'All students from this branch are enrolled'
                              : 'No students match your search'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                          {filteredAvailable.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                            >
                              <div>
                                <p className="font-medium text-sm">{s.firstName} {s.lastName}</p>
                                {s.studentId && (
                                  <p className="text-xs text-muted-foreground">ID: {s.studentId}</p>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={enrollingId === s.id}
                                onClick={() => handleEnroll(s.id)}
                              >
                                {enrollingId === s.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <><UserPlus className="h-4 w-4 mr-1.5" />Enroll</>}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                      <Building2 className="h-7 w-7 mx-auto mb-1.5 opacity-40" />
                      <p className="text-sm">Assign a branch to this class to enroll students</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="schedule" className="mt-4">
                  <div className="space-y-3">
                    {selectedClass.scheduleDays.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p>No schedule set</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg divide-y">
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Weekly Schedule
                        </div>
                        {selectedClass.scheduleDays.map((day) => (
                          <div key={day} className="flex items-center gap-4 px-4 py-3">
                            <Calendar className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="font-medium capitalize">{day}</p>
                              {(selectedClass.scheduleTime || selectedClass.scheduleEndTime) && (
                                <p className="text-sm text-muted-foreground">
                                  {formatTime(selectedClass.scheduleTime)}
                                  {selectedClass.scheduleEndTime && ` – ${formatTime(selectedClass.scheduleEndTime)}`}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{classToDelete?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
