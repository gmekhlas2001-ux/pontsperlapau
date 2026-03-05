import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui-custom/DataTable';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  createStudent,
  getStudentsList,
  updateStudent,
  deleteStudent,
  updateStudentCredentials,
  type CreateStudentData,
  type UpdateStudentData,
} from '@/services/studentService';
import { getBranches, type Branch } from '@/services/branchService';
import { useAuth } from '@/contexts/AuthContext';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  MoveHorizontal as MoreHorizontal,
  Mail,
  Phone,
  Pencil,
  Trash2,
  Grid3x2 as Grid3X3,
  List,
  Eye,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { formatDate, getFullName } from '@/lib/utils';

interface StudentRecord {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  gradeLevel?: string;
  enrollmentDate: string;
  status: 'active' | 'inactive';
  classes: string[];
  attendanceRate?: number;
  branchId?: string;
  branchName?: string;
  createdAt: string;
  updatedAt: string;
}

export function Students() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentList, setStudentList] = useState<StudentRecord[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [formData, setFormData] = useState<Partial<CreateStudentData>>({
    gender: 'male',
  });
  const [editData, setEditData] = useState<Partial<UpdateStudentData>>({});
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);

  const fetchStudents = useCallback(async () => {
    const result = await getStudentsList();
    if (result.success && result.data) {
      const mapped: StudentRecord[] = (result.data as any[]).map((s) => ({
        id: s.id,
        userId: s.user_id ?? s.user?.id ?? '',
        firstName: s.user?.first_name ?? '',
        lastName: s.user?.last_name ?? '',
        email: s.user?.email ?? '',
        phone: s.user?.phone_number ?? undefined,
        avatar: s.user?.profile_picture_url ?? undefined,
        gradeLevel: s.grade_level ?? undefined,
        enrollmentDate: s.enrollment_date ?? '',
        status: (s.user?.status ?? 'active') as 'active' | 'inactive',
        classes: [],
        attendanceRate: s.attendance_rate ?? undefined,
        branchId: s.branch_id ?? undefined,
        createdAt: s.created_at ?? '',
        updatedAt: s.updated_at ?? '',
      }));
      setStudentList(mapped);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
    getBranches().then((r) => { if (r.success && r.data) setBranches(r.data); });
  }, [fetchStudents]);

  const handleInputChange = (field: keyof CreateStudentData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field: keyof UpdateStudentData, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleViewStudent = (student: StudentRecord) => {
    setSelectedStudent(student);
    setIsViewDialogOpen(true);
  };

  const handleEditStudent = (student: StudentRecord) => {
    setSelectedStudent(student);
    setEditData({
      firstName: student.firstName,
      lastName: student.lastName,
      phone: student.phone ?? '',
      gradeLevel: student.gradeLevel ?? '',
      enrollmentDate: student.enrollmentDate,
      status: student.status,
      branchId: student.branchId ?? '',
    });
    setEditEmail(student.email);
    setEditPassword('');
    setIsEditDialogOpen(true);
  };

  const handleDeleteStudent = (student: StudentRecord) => {
    setSelectedStudent(student);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedStudent) return;
    setIsSubmitting(true);
    try {
      const result = await deleteStudent(selectedStudent.id, selectedStudent.userId);
      if (result.success) {
        toast.success('Student deleted successfully');
        setIsDeleteDialogOpen(false);
        setSelectedStudent(null);
        await fetchStudents();
      } else {
        toast.error(result.error || 'Failed to remove student');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedStudent) return;
    setIsSubmitting(true);
    try {
      const result = await updateStudent(selectedStudent.id, selectedStudent.userId, editData);
      if (!result.success) {
        toast.error(result.error || 'Failed to update student');
        return;
      }

      const emailChanged = editEmail && editEmail !== selectedStudent.email;
      const passwordChanged = !!editPassword;
      if ((emailChanged || passwordChanged) && user?.role === 'superadmin') {
        const credResult = await updateStudentCredentials(
          selectedStudent.userId,
          emailChanged ? editEmail : undefined,
          passwordChanged ? editPassword : undefined
        );
        if (!credResult.success) {
          toast.error(credResult.error || 'Profile updated but credentials failed to update');
          return;
        }
      }

      toast.success('Student updated successfully');
      setIsEditDialogOpen(false);
      setSelectedStudent(null);
      await fetchStudents();
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveStudent = async () => {
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.password ||
      !formData.dateOfBirth ||
      !formData.gender ||
      !formData.enrollmentDate ||
      !formData.branchId
    ) {
      toast.error('Please fill in all required fields including branch');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createStudent(formData as CreateStudentData);
      if (result.success) {
        toast.success('Student created successfully');
        setIsAddDialogOpen(false);
        setFormData({ gender: 'male' });
        await fetchStudents();
      } else {
        toast.error(result.error || 'Failed to create student');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: t('students.fullName'),
      cell: (student: StudentRecord) => (
        <div className="flex items-center gap-3">
          <AvatarWithFallback
            src={student.avatar}
            firstName={student.firstName}
            lastName={student.lastName}
            className="h-8 w-8"
          />
          <span className="font-medium">{getFullName(student.firstName, student.lastName)}</span>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'email',
      header: t('students.email'),
      cell: (student: StudentRecord) => (
        <a href={`mailto:${student.email}`} className="text-primary hover:underline">
          {student.email}
        </a>
      ),
    },
    {
      key: 'phone',
      header: t('students.phone'),
      cell: (student: StudentRecord) => student.phone || '-',
    },
    {
      key: 'gradeLevel',
      header: t('students.gradeLevel'),
      cell: (student: StudentRecord) => student.gradeLevel || '-',
      sortable: true,
    },
    {
      key: 'enrollmentDate',
      header: t('students.enrollmentDate'),
      cell: (student: StudentRecord) => formatDate(student.enrollmentDate),
      sortable: true,
    },
    {
      key: 'branch',
      header: 'Branch',
      cell: (student: StudentRecord) => {
        const branch = branches.find((b) => b.id === student.branchId);
        return branch ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <span>{branch.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      key: 'status',
      header: t('students.status'),
      cell: (student: StudentRecord) => <StatusBadge status={student.status} />,
      sortable: true,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (student: StudentRecord) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewStudent(student)}>
              <Eye className="mr-2 h-4 w-4" />
              {t('common.view')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEditStudent(student)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteStudent(student)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const renderCardView = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {studentList.map((student) => (
        <Card key={student.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <AvatarWithFallback
                  src={student.avatar}
                  firstName={student.firstName}
                  lastName={student.lastName}
                  className="h-16 w-16"
                />
                <div>
                  <h3 className="font-semibold">{getFullName(student.firstName, student.lastName)}</h3>
                  <p className="text-sm text-muted-foreground">{student.gradeLevel || '-'}</p>
                  <StatusBadge status={student.status} />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${student.email}`} className="text-primary hover:underline">
                  {student.email}
                </a>
              </div>
              {student.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${student.phone}`} className="text-primary hover:underline">
                    {student.phone}
                  </a>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                {t('students.enrollmentDate')}: {formatDate(student.enrollmentDate)}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleViewStudent(student)}>
                <Eye className="mr-2 h-4 w-4" />
                {t('common.view')}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEditStudent(student)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.edit')}
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteStudent(student)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('students.title')}</h1>
          <p className="text-muted-foreground">{t('students.studentList')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('card')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('students.addStudent')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('students.addStudent')}</DialogTitle>
                <DialogDescription>Fill in the details to add a new student to the system</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">
                      {t('students.firstName')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="firstName"
                      required
                      value={formData.firstName || ''}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">
                      {t('students.lastName')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="lastName"
                      required
                      value={formData.lastName || ''}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fatherName">
                    Father's Name <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="fatherName"
                    value={formData.fatherName || ''}
                    onChange={(e) => handleInputChange('fatherName', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">
                      Date of Birth <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      required
                      value={formData.dateOfBirth || ''}
                      onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">
                      Gender <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => handleInputChange('gender', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passportNumber">
                    Passport/ID Number <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="passportNumber"
                    value={formData.passportNumber || ''}
                    onChange={(e) => handleInputChange('passportNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    {t('students.email')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Password <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password || ''}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    {t('students.phone')} <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">
                    {t('students.gradeLevel')} <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="gradeLevel"
                    value={formData.gradeLevel || ''}
                    onChange={(e) => handleInputChange('gradeLevel', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enrollmentDate">
                    Enrollment Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="enrollmentDate"
                    type="date"
                    required
                    value={formData.enrollmentDate || ''}
                    onChange={(e) => handleInputChange('enrollmentDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">
                    Branch <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.branchId || ''}
                    onValueChange={(value) => handleInputChange('branchId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>{branch.name} — {branch.province}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSaveStudent} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : t('common.save')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === 'list' ? (
        <DataTable
          data={studentList}
          columns={columns}
          keyExtractor={(student) => student.id}
          searchKeys={['firstName', 'lastName', 'email', 'gradeLevel']}
        />
      ) : (
        renderCardView()
      )}

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Student Profile</DialogTitle>
            <DialogDescription>Full details for this student</DialogDescription>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-4">
                <AvatarWithFallback
                  src={selectedStudent.avatar}
                  firstName={selectedStudent.firstName}
                  lastName={selectedStudent.lastName}
                  className="h-16 w-16 text-lg"
                />
                <div>
                  <h3 className="text-lg font-semibold">
                    {getFullName(selectedStudent.firstName, selectedStudent.lastName)}
                  </h3>
                  <p className="text-sm text-muted-foreground">{selectedStudent.gradeLevel || '-'}</p>
                  <StatusBadge status={selectedStudent.status} />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{selectedStudent.email}</span>
                </div>
                {selectedStudent.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{selectedStudent.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{t('students.gradeLevel')}: {selectedStudent.gradeLevel || '-'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{t('students.enrollmentDate')}: {formatDate(selectedStudent.enrollmentDate)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  {t('common.close')}
                </Button>
                <Button onClick={() => { setIsViewDialogOpen(false); handleEditStudent(selectedStudent); }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.edit')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
            <DialogDescription>Update the details for this student</DialogDescription>
          </DialogHeader>
          {selectedStudent && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">{t('students.firstName')}</Label>
                  <Input
                    id="edit-firstName"
                    value={editData.firstName ?? ''}
                    onChange={(e) => handleEditChange('firstName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">{t('students.lastName')}</Label>
                  <Input
                    id="edit-lastName"
                    value={editData.lastName ?? ''}
                    onChange={(e) => handleEditChange('lastName', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">{t('students.phone')}</Label>
                <Input
                  id="edit-phone"
                  value={editData.phone ?? ''}
                  onChange={(e) => handleEditChange('phone', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-gradeLevel">{t('students.gradeLevel')}</Label>
                  <Input
                    id="edit-gradeLevel"
                    value={editData.gradeLevel ?? ''}
                    onChange={(e) => handleEditChange('gradeLevel', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">{t('students.status')}</Label>
                  <Select
                    value={editData.status ?? ''}
                    onValueChange={(value) => handleEditChange('status', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-enrollmentDate">Enrollment Date</Label>
                <Input
                  id="edit-enrollmentDate"
                  type="date"
                  value={editData.enrollmentDate ?? ''}
                  onChange={(e) => handleEditChange('enrollmentDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-branch">Branch <span className="text-red-500">*</span></Label>
                <Select
                  value={editData.branchId ?? ''}
                  onValueChange={(value) => handleEditChange('branchId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name} — {branch.province}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {user?.role === 'superadmin' && (
                <>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">Credentials (Superadmin only)</p>
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-email">Email</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-password">
                          New Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>
                        </Label>
                        <Input
                          id="edit-password"
                          type="password"
                          placeholder="Enter new password"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSaveEdit} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : t('common.save')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{' '}
              <strong>{selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'this student'}</strong>?
              This will remove their record completely from the database and cannot be undone. To keep the student but disable their access, use the Inactive status in the edit form instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
