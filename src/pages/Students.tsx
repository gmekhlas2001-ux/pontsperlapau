import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type LucideIcon,
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
  UserCheck,
  UserX,
  MapPin,
  User,
  Users,
  Heart,
  FileText,
  Hash,
  GraduationCap,
  Building2,
  Shield,
} from 'lucide-react';
import { formatDate, getFullName } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

function calculateAge(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ProfileField({ icon: Icon, label, value, className }: { icon: LucideIcon; label: string; value?: string | null; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5${className ? ' ' + className : ''}`}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">{label}</p>
        {value ? (
          <p className="text-sm break-words">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground/40 italic">Not provided</p>
        )}
      </div>
    </div>
  );
}

interface StudentRecord {
  id: string;
  userId: string;
  studentId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: string;
  gender?: string;
  fatherName?: string;
  passportNumber?: string;
  nationality?: string;
  address?: string;
  gradeLevel?: string;
  enrollmentDate: string;
  status: 'active' | 'inactive';
  classes: string[];
  attendanceRate?: number;
  parentGuardianName?: string;
  parentGuardianEmail?: string;
  parentGuardianPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  medicalNotes?: string;
  allergies?: string;
  branchId?: string;
  createdAt: string;
  updatedAt: string;
}

export function Students() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    (searchParams.get('status') as 'active' | 'inactive') || 'all'
  );
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
  const [branches, setBranches] = useState<Branch[]>([]);

  const fetchStudents = useCallback(async () => {
    const result = await getStudentsList();
    if (result.success && result.data) {
      const mapped: StudentRecord[] = (result.data as any[]).map((s) => ({
        id: s.id,
        userId: s.user_id ?? s.user?.id ?? '',
        studentId: s.student_id ?? undefined,
        firstName: s.user?.first_name ?? '',
        lastName: s.user?.last_name ?? '',
        email: s.user?.email ?? '',
        phone: s.user?.phone_number ?? undefined,
        avatar: s.user?.profile_picture_url ?? undefined,
        dateOfBirth: s.user?.date_of_birth ?? undefined,
        gender: s.user?.gender ?? undefined,
        fatherName: s.user?.father_name ?? undefined,
        passportNumber: s.user?.passport_number ?? undefined,
        nationality: s.nationality ?? undefined,
        address: s.address ?? undefined,
        gradeLevel: s.grade_level ?? undefined,
        enrollmentDate: s.enrollment_date ?? '',
        status: (s.user?.status ?? 'active') as 'active' | 'inactive',
        classes: [],
        attendanceRate: s.attendance_rate ?? undefined,
        parentGuardianName: s.parent_guardian_name ?? undefined,
        parentGuardianEmail: s.parent_guardian_email ?? undefined,
        parentGuardianPhone: s.parent_guardian_phone ?? undefined,
        emergencyContactName: s.emergency_contact_name ?? undefined,
        emergencyContactPhone: s.emergency_contact_phone ?? undefined,
        emergencyContactRelationship: s.emergency_contact_relationship ?? undefined,
        medicalNotes: s.medical_notes ?? undefined,
        allergies: s.allergies ?? undefined,
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

  const handleStatusFilterChange = (filter: 'all' | 'active' | 'inactive') => {
    setStatusFilter(filter);
    if (filter === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', filter);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const handleQuickActivate = async (student: StudentRecord) => {
    const result = await updateStudent(student.id, student.userId, { status: 'active' });
    if (result.success) {
      toast.success(`${student.firstName} ${student.lastName} has been activated`);
      await fetchStudents();
    } else {
      toast.error(result.error || 'Failed to activate student');
    }
  };

  const filteredStudents = statusFilter === 'all'
    ? studentList
    : studentList.filter((s) => s.status === statusFilter);

  const activeCount = studentList.filter((s) => s.status === 'active').length;
  const inactiveCount = studentList.filter((s) => s.status === 'inactive').length;

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
      fatherName: student.fatherName ?? '',
      phone: student.phone ?? '',
      nationality: student.nationality ?? '',
      address: student.address ?? '',
      gradeLevel: student.gradeLevel ?? '',
      enrollmentDate: student.enrollmentDate,
      status: student.status,
      branchId: student.branchId ?? '',
      parentGuardianName: student.parentGuardianName ?? '',
      parentGuardianEmail: student.parentGuardianEmail ?? '',
      parentGuardianPhone: student.parentGuardianPhone ?? '',
      emergencyContactName: student.emergencyContactName ?? '',
      emergencyContactPhone: student.emergencyContactPhone ?? '',
      emergencyContactRelationship: student.emergencyContactRelationship ?? '',
      medicalNotes: student.medicalNotes ?? '',
      allergies: student.allergies ?? '',
    });
    setEditEmail(student.email);
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

      const emailChanged = editEmail !== selectedStudent.email;
      if (emailChanged && user?.role === 'superadmin') {
        const credResult = await updateStudentCredentials(
          selectedStudent.userId,
          editEmail || undefined,
          undefined
        );
        if (!credResult.success) {
          toast.error(credResult.error || 'Profile updated but email failed to update');
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
      cell: (student: StudentRecord) => student.email ? (
        <a href={`mailto:${student.email}`} className="text-primary hover:underline">
          {student.email}
        </a>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
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
            {student.status === 'inactive' && (
              <DropdownMenuItem className="text-emerald-600" onClick={() => handleQuickActivate(student)}>
                <UserCheck className="mr-2 h-4 w-4" />
                Activate
              </DropdownMenuItem>
            )}
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
      {filteredStudents.map((student) => (
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
              {student.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${student.email}`} className="text-primary hover:underline">
                    {student.email}
                  </a>
                </div>
              )}
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

                {/* Personal Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('students.firstName')} <span className="text-red-500">*</span></Label>
                    <Input id="firstName" required value={formData.firstName || ''} onChange={(e) => handleInputChange('firstName', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('students.lastName')} <span className="text-red-500">*</span></Label>
                    <Input id="lastName" required value={formData.lastName || ''} onChange={(e) => handleInputChange('lastName', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fatherName">Father's Name</Label>
                    <Input id="fatherName" value={formData.fatherName || ''} onChange={(e) => handleInputChange('fatherName', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input id="nationality" value={formData.nationality || ''} onChange={(e) => handleInputChange('nationality', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth <span className="text-red-500">*</span></Label>
                    <Input id="dateOfBirth" type="date" required value={formData.dateOfBirth || ''} onChange={(e) => handleInputChange('dateOfBirth', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender <span className="text-red-500">*</span></Label>
                    <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                      <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
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
                  <Label htmlFor="passportNumber">Passport / ID Number</Label>
                  <Input id="passportNumber" value={formData.passportNumber || ''} onChange={(e) => handleInputChange('passportNumber', e.target.value)} />
                </div>

                {/* Contact */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-3">Contact</p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('students.email')} <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input id="email" type="email" value={formData.email || ''} onChange={(e) => handleInputChange('email', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t('students.phone')} <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input id="phone" value={formData.phone || ''} onChange={(e) => handleInputChange('phone', e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Textarea id="address" rows={2} value={formData.address || ''} onChange={(e) => handleInputChange('address', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Academic */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-3">Academic</p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="gradeLevel">{t('students.gradeLevel')}</Label>
                        <Input id="gradeLevel" value={formData.gradeLevel || ''} onChange={(e) => handleInputChange('gradeLevel', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="enrollmentDate">Enrollment Date <span className="text-red-500">*</span></Label>
                        <Input id="enrollmentDate" type="date" required value={formData.enrollmentDate || ''} onChange={(e) => handleInputChange('enrollmentDate', e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branch">Branch <span className="text-red-500">*</span></Label>
                      <Select value={formData.branchId || ''} onValueChange={(value) => handleInputChange('branchId', value)}>
                        <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>{branch.name} — {branch.province}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Parent / Guardian */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-1">Parent / Guardian</p>
                  <p className="text-xs text-muted-foreground mb-3">Optional — used for communication and emergency purposes</p>
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="parentGuardianName">Full Name</Label>
                      <Input id="parentGuardianName" value={formData.parentGuardianName || ''} onChange={(e) => handleInputChange('parentGuardianName', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="parentGuardianPhone">Phone</Label>
                        <Input id="parentGuardianPhone" value={formData.parentGuardianPhone || ''} onChange={(e) => handleInputChange('parentGuardianPhone', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parentGuardianEmail">Email</Label>
                        <Input id="parentGuardianEmail" type="email" value={formData.parentGuardianEmail || ''} onChange={(e) => handleInputChange('parentGuardianEmail', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-1">Emergency Contact</p>
                  <p className="text-xs text-muted-foreground mb-3">Optional — person to contact in case of emergency</p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="emergencyContactName">Full Name</Label>
                        <Input id="emergencyContactName" value={formData.emergencyContactName || ''} onChange={(e) => handleInputChange('emergencyContactName', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emergencyContactPhone">Phone</Label>
                        <Input id="emergencyContactPhone" value={formData.emergencyContactPhone || ''} onChange={(e) => handleInputChange('emergencyContactPhone', e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactRelationship">Relationship</Label>
                      <Input id="emergencyContactRelationship" placeholder="e.g. Parent, Sibling, Uncle" value={formData.emergencyContactRelationship || ''} onChange={(e) => handleInputChange('emergencyContactRelationship', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Health Notes */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-1">Health Notes</p>
                  <p className="text-xs text-muted-foreground mb-3">Optional — helps staff respond appropriately in emergencies</p>
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="allergies">Allergies</Label>
                      <Input id="allergies" placeholder="e.g. Peanuts, Penicillin, Latex" value={formData.allergies || ''} onChange={(e) => handleInputChange('allergies', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="medicalNotes">Medical Notes</Label>
                      <Textarea id="medicalNotes" rows={3} placeholder="Any relevant medical conditions, medications, or special requirements..." value={formData.medicalNotes || ''} onChange={(e) => handleInputChange('medicalNotes', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={handleSaveStudent} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : t('common.save')}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border rounded-lg p-1 w-fit">
        <Button
          variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => handleStatusFilterChange('all')}
        >
          All <span className="ml-1.5 text-xs opacity-70">{studentList.length}</span>
        </Button>
        <Button
          variant={statusFilter === 'active' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => handleStatusFilterChange('active')}
          className={statusFilter === 'active' ? '' : 'text-emerald-600'}
        >
          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
          Active <span className="ml-1.5 text-xs opacity-70">{activeCount}</span>
        </Button>
        <Button
          variant={statusFilter === 'inactive' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => handleStatusFilterChange('inactive')}
          className={statusFilter === 'inactive' ? '' : 'text-red-500'}
        >
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          Inactive <span className="ml-1.5 text-xs opacity-70">{inactiveCount}</span>
        </Button>
      </div>

      {viewMode === 'list' ? (
        <DataTable
          data={filteredStudents}
          columns={columns}
          keyExtractor={(student) => student.id}
          searchKeys={['firstName', 'lastName', 'email', 'gradeLevel']}
        />
      ) : (
        renderCardView()
      )}

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Student Profile</DialogTitle>
          <DialogDescription className="sr-only">Full details for this student</DialogDescription>
          {selectedStudent && (
            <div className="flex flex-col max-h-[88vh] overflow-hidden">
              {/* Gradient header */}
              <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-700 px-6 pt-7 pb-5 text-white shrink-0">
                <div className="flex items-start gap-4">
                  <AvatarWithFallback
                    src={selectedStudent.avatar}
                    firstName={selectedStudent.firstName}
                    lastName={selectedStudent.lastName}
                    className="h-20 w-20 text-xl ring-4 ring-white/30 shrink-0"
                  />
                  <div className="flex-1 min-w-0 pt-1">
                    <h2 className="text-xl font-bold leading-tight">
                      {getFullName(selectedStudent.firstName, selectedStudent.lastName)}
                    </h2>
                    {selectedStudent.studentId && (
                      <p className="text-blue-100/80 text-xs font-mono mt-0.5">{selectedStudent.studentId}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {selectedStudent.gradeLevel && (
                        <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                          {selectedStudent.gradeLevel}
                        </span>
                      )}
                      <StatusBadge status={selectedStudent.status} />
                      {selectedStudent.attendanceRate !== undefined && (
                        <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                          {selectedStudent.attendanceRate}% Attendance
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabbed content */}
              <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
                <TabsList className="rounded-none border-b px-4 h-11 bg-background justify-start gap-1 shrink-0 w-full">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
                  <TabsTrigger value="family" className="text-xs">Family & Health</TabsTrigger>
                </TabsList>
                <div className="flex-1 overflow-y-auto">
                  <TabsContent value="overview" className="p-6 m-0 space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</p>
                      <div className="grid grid-cols-2 gap-4">
                        <ProfileField icon={Mail} label="Email" value={selectedStudent.email} />
                        <ProfileField icon={Phone} label="Phone" value={selectedStudent.phone} />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Academic</p>
                      <div className="grid grid-cols-2 gap-4">
                        <ProfileField icon={GraduationCap} label="Grade Level" value={selectedStudent.gradeLevel} />
                        <ProfileField icon={Calendar} label="Enrolled" value={formatDate(selectedStudent.enrollmentDate)} />
                        <ProfileField icon={Building2} label="Branch" value={branches.find(b => b.id === selectedStudent.branchId)?.name} />
                        <ProfileField icon={Hash} label="Student ID" value={selectedStudent.studentId} />
                      </div>
                    </div>
                    {selectedStudent.attendanceRate !== undefined && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Attendance</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Attendance Rate</span>
                              <span className="font-semibold">{selectedStudent.attendanceRate}%</span>
                            </div>
                            <Progress value={selectedStudent.attendanceRate} className="h-2" />
                          </div>
                        </div>
                      </>
                    )}
                    <Separator />
                    <p className="text-xs text-muted-foreground">Enrolled since {formatDate(selectedStudent.createdAt)}</p>
                  </TabsContent>

                  <TabsContent value="personal" className="p-6 m-0">
                    <div className="grid grid-cols-2 gap-4">
                      <ProfileField
                        icon={Calendar}
                        label="Date of Birth"
                        value={selectedStudent.dateOfBirth
                          ? `${formatDate(selectedStudent.dateOfBirth)} · Age ${calculateAge(selectedStudent.dateOfBirth)}`
                          : undefined}
                      />
                      <ProfileField
                        icon={User}
                        label="Gender"
                        value={selectedStudent.gender
                          ? selectedStudent.gender.charAt(0).toUpperCase() + selectedStudent.gender.slice(1)
                          : undefined}
                      />
                      <ProfileField icon={User} label="Father's Name" value={selectedStudent.fatherName} />
                      <ProfileField icon={Shield} label="Nationality" value={selectedStudent.nationality} />
                      <ProfileField icon={FileText} label="Passport / ID No." value={selectedStudent.passportNumber} />
                      <ProfileField icon={MapPin} label="Address" value={selectedStudent.address} />
                    </div>
                  </TabsContent>

                  <TabsContent value="family" className="p-6 m-0 space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Parent / Guardian</p>
                      <div className="grid grid-cols-2 gap-4">
                        <ProfileField icon={Users} label="Full Name" value={selectedStudent.parentGuardianName} />
                        <ProfileField icon={Phone} label="Phone" value={selectedStudent.parentGuardianPhone} />
                        <ProfileField icon={Mail} label="Email" value={selectedStudent.parentGuardianEmail} />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Emergency Contact</p>
                      <div className="grid grid-cols-2 gap-4">
                        <ProfileField icon={Users} label="Full Name" value={selectedStudent.emergencyContactName} />
                        <ProfileField icon={Phone} label="Phone" value={selectedStudent.emergencyContactPhone} />
                        <ProfileField icon={Heart} label="Relationship" value={selectedStudent.emergencyContactRelationship} />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Health Notes</p>
                      <div className="space-y-4">
                        <ProfileField icon={Heart} label="Allergies" value={selectedStudent.allergies} />
                        <ProfileField icon={FileText} label="Medical Notes" value={selectedStudent.medicalNotes} />
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>

              {/* Footer */}
              <div className="border-t px-6 py-4 flex justify-end gap-2 shrink-0 bg-background">
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

              {/* Personal */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">{t('students.firstName')}</Label>
                  <Input id="edit-firstName" value={editData.firstName ?? ''} onChange={(e) => handleEditChange('firstName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">{t('students.lastName')}</Label>
                  <Input id="edit-lastName" value={editData.lastName ?? ''} onChange={(e) => handleEditChange('lastName', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-fatherName">Father's Name</Label>
                  <Input id="edit-fatherName" value={editData.fatherName ?? ''} onChange={(e) => handleEditChange('fatherName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">{t('students.phone')}</Label>
                  <Input id="edit-phone" value={editData.phone ?? ''} onChange={(e) => handleEditChange('phone', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nationality">Nationality</Label>
                  <Input id="edit-nationality" value={editData.nationality ?? ''} onChange={(e) => handleEditChange('nationality', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-gradeLevel">{t('students.gradeLevel')}</Label>
                  <Input id="edit-gradeLevel" value={editData.gradeLevel ?? ''} onChange={(e) => handleEditChange('gradeLevel', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Address</Label>
                <Textarea id="edit-address" rows={2} value={editData.address ?? ''} onChange={(e) => handleEditChange('address', e.target.value)} />
              </div>

              {/* Academic */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Academic</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-status">{t('students.status')}</Label>
                    <Select value={editData.status ?? ''} onValueChange={(value) => handleEditChange('status', value)}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-enrollmentDate">Enrollment Date</Label>
                    <Input id="edit-enrollmentDate" type="date" value={editData.enrollmentDate ?? ''} onChange={(e) => handleEditChange('enrollmentDate', e.target.value)} />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="edit-branch">Branch <span className="text-red-500">*</span></Label>
                  <Select value={editData.branchId ?? ''} onValueChange={(value) => handleEditChange('branchId', value)}>
                    <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>{branch.name} — {branch.province}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Parent / Guardian */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Parent / Guardian</p>
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-parentGuardianName">Full Name</Label>
                    <Input id="edit-parentGuardianName" value={editData.parentGuardianName ?? ''} onChange={(e) => handleEditChange('parentGuardianName', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-parentGuardianPhone">Phone</Label>
                      <Input id="edit-parentGuardianPhone" value={editData.parentGuardianPhone ?? ''} onChange={(e) => handleEditChange('parentGuardianPhone', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-parentGuardianEmail">Email</Label>
                      <Input id="edit-parentGuardianEmail" type="email" value={editData.parentGuardianEmail ?? ''} onChange={(e) => handleEditChange('parentGuardianEmail', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Emergency Contact</p>
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-emergencyContactName">Full Name</Label>
                      <Input id="edit-emergencyContactName" value={editData.emergencyContactName ?? ''} onChange={(e) => handleEditChange('emergencyContactName', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-emergencyContactPhone">Phone</Label>
                      <Input id="edit-emergencyContactPhone" value={editData.emergencyContactPhone ?? ''} onChange={(e) => handleEditChange('emergencyContactPhone', e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-emergencyContactRelationship">Relationship</Label>
                    <Input id="edit-emergencyContactRelationship" placeholder="e.g. Parent, Sibling, Uncle" value={editData.emergencyContactRelationship ?? ''} onChange={(e) => handleEditChange('emergencyContactRelationship', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Health Notes */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Health Notes</p>
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-allergies">Allergies</Label>
                    <Input id="edit-allergies" placeholder="e.g. Peanuts, Penicillin, Latex" value={editData.allergies ?? ''} onChange={(e) => handleEditChange('allergies', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-medicalNotes">Medical Notes</Label>
                    <Textarea id="edit-medicalNotes" rows={3} placeholder="Any relevant medical conditions or notes..." value={editData.medicalNotes ?? ''} onChange={(e) => handleEditChange('medicalNotes', e.target.value)} />
                  </div>
                </div>
              </div>

              {user?.role === 'superadmin' && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Contact Email (optional)</p>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleSaveEdit} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : t('common.save')}</Button>
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
