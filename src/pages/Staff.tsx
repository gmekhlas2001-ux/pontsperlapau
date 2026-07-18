import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { DataTable } from '@/components/ui-custom/DataTable';
import { BirthDateInput } from '@/components/ui-custom/BirthDateInput';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { createStaff, getStaffList, updateStaff, deleteStaff, updateUserCredentials, type CreateStaffData, type UpdateStaffData } from '@/services/staffService';
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
import { type LucideIcon, Plus, MoveHorizontal as MoreHorizontal, Mail, Phone, Pencil, Trash2, Grid3x2 as Grid3X3, List, Eye, Calendar, Briefcase, Building2, UserCheck, UserX, User, FileText, Hash, IdCard } from 'lucide-react';
import { formatDate, getFullName } from '@/lib/utils';
import type { Staff } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { DocumentsManager, flushPendingDocuments } from '@/components/DocumentsManager';
import { useRef } from 'react';

function calculateAge(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ProfileField({ icon: Icon, label, value, className }: { icon: LucideIcon; label: string; value?: string | null; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex min-h-[76px] items-start gap-3 rounded-lg border border-border/70 bg-card/80 p-3 shadow-xs transition-colors hover:border-primary/25${className ? ' ' + className : ''}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-semibold uppercase leading-none text-muted-foreground">{label}</p>
        {value ? (
          <p className="break-words text-sm font-medium text-foreground">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground/40 italic">{t('common.notProvided')}</p>
        )}
      </div>
    </div>
  );
}

interface StaffRecord extends Staff {
  userId: string;
  branchId?: string;
  fatherName?: string;
  passportNumber?: string;
  employeeId?: string;
  employmentType?: string;
}

export function Staff() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pendingDocsRef = useRef<File[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    (searchParams.get('status') as 'active' | 'inactive') || 'all'
  );
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAddBirthDateValid, setIsAddBirthDateValid] = useState(true);
  const [isEditBirthDateValid, setIsEditBirthDateValid] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [staffList, setStaffList] = useState<StaffRecord[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);
  const [formData, setFormData] = useState<Partial<CreateStaffData>>({
    gender: 'male',
    role: 'teacher',
  });
  const [editData, setEditData] = useState<Partial<UpdateStaffData>>({});
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);

  const fetchStaff = useCallback(async () => {
    const result = await getStaffList();
    if (result.success && result.data) {
      const mapped: StaffRecord[] = (result.data as any[]).map((s) => ({
        id: s.id,
        userId: s.user_id ?? s.user?.id ?? '',
        firstName: s.user?.first_name ?? '',
        lastName: s.user?.last_name ?? '',
        email: s.user?.email ?? '',
        phone: s.user?.phone_number ?? undefined,
        avatar: s.user?.profile_picture_url ?? undefined,
        role: (s.user?.role ?? 'teacher') as StaffRecord['role'],
        status: (s.user?.status ?? 'active') as StaffRecord['status'],
        position: s.position ?? '',
        department: s.department ?? undefined,
        dateJoined: s.date_joined ?? '',
        dateOfBirth: s.user?.date_of_birth ?? undefined,
        gender: s.user?.gender ?? undefined,
        bio: s.bio ?? undefined,
        fatherName: s.user?.father_name ?? undefined,
        passportNumber: s.user?.passport_number ?? undefined,
        employeeId: s.employee_id ?? undefined,
        employmentType: s.employment_type ?? undefined,
        branchId: s.branch_id ?? undefined,
        createdAt: s.created_at ?? '',
        updatedAt: s.updated_at ?? '',
      }));
      setStaffList(mapped);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    getBranches().then((r) => { if (r.success && r.data) setBranches(r.data); });
  }, [fetchStaff]);

  const handleStatusFilterChange = (filter: 'all' | 'active' | 'inactive') => {
    setStatusFilter(filter);
    if (filter === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', filter);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const handleQuickActivate = async (staff: StaffRecord) => {
    const result = await updateStaff(staff.id, staff.userId, { status: 'active' });
    if (result.success) {
      toast.success(`${staff.firstName} ${staff.lastName} has been activated`);
      await fetchStaff();
    } else {
      toast.error(result.error || 'Failed to activate staff member');
    }
  };

  const filteredStaff = statusFilter === 'all'
    ? staffList
    : staffList.filter((s) => s.status === statusFilter);

  const activeCount = staffList.filter((s) => s.status === 'active').length;
  const inactiveCount = staffList.filter((s) => s.status === 'inactive').length;

  const handleInputChange = (field: keyof CreateStaffData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field: keyof UpdateStaffData, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleViewStaff = (staff: StaffRecord) => {
    setSelectedStaff(staff);
    setIsViewDialogOpen(true);
  };

  const handleEditStaff = (staff: StaffRecord) => {
    setIsEditBirthDateValid(true);
    setSelectedStaff(staff);
    setEditData({
      firstName: staff.firstName,
      lastName: staff.lastName,
      fatherName: staff.fatherName ?? '',
      phone: staff.phone ?? '',
      dateOfBirth: staff.dateOfBirth ?? '',
      gender: staff.gender ?? 'male',
      passportNumber: staff.passportNumber ?? '',
      position: staff.position,
      department: staff.department ?? '',
      role: staff.role as UpdateStaffData['role'],
      status: staff.status as UpdateStaffData['status'],
      dateJoined: staff.dateJoined,
      branchId: staff.branchId ?? '',
      bio: staff.bio ?? '',
    });
    setEditEmail(staff.email);
    setEditPassword('');
    setIsEditDialogOpen(true);
  };

  const handleDeleteStaff = (staff: StaffRecord) => {
    setSelectedStaff(staff);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedStaff) return;
    setIsSubmitting(true);
    try {
      const result = await deleteStaff(selectedStaff.id, selectedStaff.userId);
      if (result.success) {
        toast.success('Staff member deleted successfully');
        setIsDeleteDialogOpen(false);
        setSelectedStaff(null);
        await fetchStaff();
      } else {
        toast.error(result.error || 'Failed to remove staff member');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedStaff) return;
    if (!isEditBirthDateValid) {
      toast.error(t('common.invalidDateOfBirth'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await updateStaff(selectedStaff.id, selectedStaff.userId, editData);
      if (!result.success) {
        toast.error(result.error || 'Failed to update staff member');
        return;
      }

      const emailChanged = editEmail && editEmail !== selectedStaff.email;
      const passwordChanged = !!editPassword;
      if ((emailChanged || passwordChanged) && user?.role === 'superadmin') {
        const credResult = await updateUserCredentials(
          selectedStaff.userId,
          emailChanged ? editEmail : undefined,
          passwordChanged ? editPassword : undefined
        );
        if (!credResult.success) {
          toast.error(credResult.error || 'Profile updated but credentials failed to update');
          return;
        }
      }

      toast.success('Staff member updated successfully');
      setIsEditDialogOpen(false);
      setSelectedStaff(null);
      await fetchStaff();
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveStaff = async () => {
    if (!isAddBirthDateValid) {
      toast.error(t('common.invalidDateOfBirth'));
      return;
    }
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.password ||
      !formData.position ||
      !formData.dateOfBirth ||
      !formData.gender ||
      !formData.role ||
      !formData.dateJoined ||
      !formData.branchId
    ) {
      toast.error('Please fill in all required fields including branch');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createStaff(formData as CreateStaffData);
      if (result.success) {
        // Flush any queued documents now that the user exists.
        if (result.userId && pendingDocsRef.current.length > 0) {
          const flush = await flushPendingDocuments(result.userId, pendingDocsRef.current);
          if (flush.failed.length > 0) {
            toast.warning(`Staff created but ${flush.failed.length} document(s) failed to upload`);
          }
          pendingDocsRef.current = [];
        }
        toast.success('Staff member created successfully');
        setIsAddDialogOpen(false);
        setFormData({ gender: 'male', role: 'teacher' });
        await fetchStaff();
      } else {
        toast.error(result.error || 'Failed to create staff member');
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
      header: t('staff.fullName'),
      cell: (staff: StaffRecord) => (
        <div className="flex items-center gap-3">
          <AvatarWithFallback
            src={staff.avatar}
            firstName={staff.firstName}
            lastName={staff.lastName}
            className="h-8 w-8"
          />
          <span className="font-medium">{getFullName(staff.firstName, staff.lastName)}</span>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'position',
      header: t('staff.position'),
      cell: (staff: StaffRecord) => staff.position,
      sortable: true,
    },
    {
      key: 'role',
      header: t('staff.role'),
      cell: (staff: StaffRecord) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
          {t(`roles.${staff.role}`)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'email',
      header: t('staff.email'),
      cell: (staff: StaffRecord) => (
        <a href={`mailto:${staff.email}`} className="text-primary hover:underline">
          {staff.email}
        </a>
      ),
    },
    {
      key: 'phone',
      header: t('staff.phone'),
      cell: (staff: StaffRecord) => staff.phone || '-',
    },
    {
      key: 'branch',
      header: 'Branch',
      cell: (staff: StaffRecord) => {
        const branch = branches.find((b) => b.id === staff.branchId);
        return branch ? (
          <span className="text-xs font-medium">{branch.name}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      key: 'status',
      header: t('staff.status'),
      cell: (staff: StaffRecord) => <StatusBadge status={staff.status} />,
      sortable: true,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (staff: StaffRecord) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${getFullName(staff.firstName, staff.lastName)}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewStaff(staff)}>
              <Eye className="mr-2 h-4 w-4" />
              {t('common.view')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEditStaff(staff)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </DropdownMenuItem>
            {staff.status === 'inactive' && (
              <DropdownMenuItem className="text-emerald-600" onClick={() => handleQuickActivate(staff)}>
                <UserCheck className="mr-2 h-4 w-4" />
                Activate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteStaff(staff)}>
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
      {filteredStaff.map((staff) => (
        <Card key={staff.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <AvatarWithFallback
                  src={staff.avatar}
                  firstName={staff.firstName}
                  lastName={staff.lastName}
                  className="h-16 w-16"
                />
                <div>
                  <h3 className="font-semibold">{getFullName(staff.firstName, staff.lastName)}</h3>
                  <p className="text-sm text-muted-foreground">{staff.position}</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary mt-1">
                    {t(`roles.${staff.role}`)}
                  </span>
                </div>
              </div>
              <StatusBadge status={staff.status} />
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${staff.email}`} className="text-primary hover:underline">
                  {staff.email}
                </a>
              </div>
              {staff.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${staff.phone}`} className="text-primary hover:underline">
                    {staff.phone}
                  </a>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                {t('staff.dateJoined')}: {formatDate(staff.dateJoined)}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleViewStaff(staff)}>
                <Eye className="mr-2 h-4 w-4" />
                {t('common.view')}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEditStaff(staff)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.edit')}
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteStaff(staff)}>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('staff.title')}</h1>
          <p className="text-muted-foreground">{t('staff.staffList')}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('card')}
              aria-label="Card view"
              aria-pressed={viewMode === 'card'}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('staff.addStaff')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('staff.addStaff')}</DialogTitle>
                <DialogDescription>Fill in the details to add a new staff member to the system</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">

                {/* Personal Information */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('staff.firstName')} <span className="text-red-500">*</span></Label>
                    <Input id="firstName" required value={formData.firstName || ''} onChange={(e) => handleInputChange('firstName', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('staff.lastName')} <span className="text-red-500">*</span></Label>
                    <Input id="lastName" required value={formData.lastName || ''} onChange={(e) => handleInputChange('lastName', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fatherName">Father's Name</Label>
                  <Input id="fatherName" value={formData.fatherName || ''} onChange={(e) => handleInputChange('fatherName', e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth <span className="text-red-500">*</span></Label>
                    <BirthDateInput
                      id="dateOfBirth"
                      required
                      value={formData.dateOfBirth || ''}
                      onValueChange={(value) => handleInputChange('dateOfBirth', value)}
                      onValidityChange={setIsAddBirthDateValid}
                    />
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

                {/* Login & Contact */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-3">Login & Contact</p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('staff.email')} <span className="text-red-500">*</span></Label>
                        <Input id="email" type="email" required value={formData.email || ''} onChange={(e) => handleInputChange('email', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                        <Input id="password" type="password" required value={formData.password || ''} onChange={(e) => handleInputChange('password', e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t('staff.phone')} <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input id="phone" value={formData.phone || ''} onChange={(e) => handleInputChange('phone', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Employment */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-3">Employment</p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="position">{t('staff.position')} <span className="text-red-500">*</span></Label>
                        <Input id="position" required value={formData.position || ''} onChange={(e) => handleInputChange('position', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="department">{t('staff.department')}</Label>
                        <Input id="department" value={formData.department || ''} onChange={(e) => handleInputChange('department', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="role">{t('staff.role')} <span className="text-red-500">*</span></Label>
                        <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="superadmin">{t('roles.superadmin')}</SelectItem>
                            <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                            <SelectItem value="teacher">{t('roles.teacher')}</SelectItem>
                            <SelectItem value="librarian">{t('roles.librarian')}</SelectItem>
                            <SelectItem value="parent">{t('roles.parent')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dateJoined">Date Joined <span className="text-red-500">*</span></Label>
                        <Input id="dateJoined" type="date" required value={formData.dateJoined || ''} onChange={(e) => handleInputChange('dateJoined', e.target.value)} />
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

                {/* Biography */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-1">Biography</p>
                  <p className="text-xs text-muted-foreground mb-3">Optional — a short professional bio shown on the staff profile</p>
                  <Textarea id="bio" rows={3} placeholder="A brief professional background, qualifications, or specialisation..." value={formData.bio || ''} onChange={(e) => handleInputChange('bio', e.target.value)} />
                </div>

                {/* Documents (queued; uploaded after creation) */}
                <div className="border-t pt-4">
                  <DocumentsManager userId={null} pendingRef={pendingDocsRef} />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={handleSaveStaff} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : t('common.save')}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border p-1 sm:w-fit">
        <Button
          variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => handleStatusFilterChange('all')}
        >
          All <span className="ml-1.5 text-xs opacity-70">{staffList.length}</span>
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
          data={filteredStaff}
          columns={columns}
          keyExtractor={(staff) => staff.id}
          searchKeys={['firstName', 'lastName', 'email', 'position']}
          mobileColumns={['name', 'role', 'branch', 'status', 'actions']}
        />
      ) : (
        renderCardView()
      )}

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="w-[min(56rem,calc(100vw-2rem))] sm:max-w-4xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Staff Profile</DialogTitle>
          <DialogDescription className="sr-only">Full details for this staff member</DialogDescription>
          {selectedStaff && (
            <div className="flex max-h-[88dvh] flex-col overflow-hidden">
              <div className="shrink-0 border-b bg-gradient-to-br from-primary/10 via-card to-accent/50 px-6 pt-7 pb-5">
                <div className="flex flex-col gap-5">
                  <div className="flex items-start gap-4">
                    <AvatarWithFallback
                      src={selectedStaff.avatar}
                      firstName={selectedStaff.firstName}
                      lastName={selectedStaff.lastName}
                      className="h-20 w-20 text-xl ring-4 ring-background shadow-md shrink-0"
                    />
                    <div className="flex-1 min-w-0 pt-1">
                      <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                        {getFullName(selectedStaff.firstName, selectedStaff.lastName)}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">{selectedStaff.position || 'Staff member'}</p>
                      {selectedStaff.employeeId && (
                        <p className="mt-1 text-xs font-mono text-muted-foreground">{selectedStaff.employeeId}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {t(`roles.${selectedStaff.role}`)}
                        </span>
                        <StatusBadge status={selectedStaff.status} />
                        {selectedStaff.employmentType && (
                          <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                            {selectedStaff.employmentType.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-background/75 p-3 shadow-xs">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Role</p>
                      <p className="mt-1 break-words text-sm font-semibold">{t(`roles.${selectedStaff.role}`)}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/75 p-3 shadow-xs">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Branch</p>
                      <p className="mt-1 break-words text-sm font-semibold">{branches.find(b => b.id === selectedStaff.branchId)?.name || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/75 p-3 shadow-xs">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Joined</p>
                      <p className="mt-1 break-words text-sm font-semibold">{formatDate(selectedStaff.dateJoined)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabbed content */}
              <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
                <TabsList className="h-auto w-full shrink-0 justify-start gap-1 rounded-none border-b bg-muted/35 px-4 py-2">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
                </TabsList>
                <div className="flex-1 overflow-y-auto">
                  <TabsContent value="overview" className="p-6 m-0 space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <ProfileField icon={Mail} label="Email" value={selectedStaff.email} />
                        <ProfileField icon={Phone} label="Phone" value={selectedStaff.phone} />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Employment</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <ProfileField icon={Briefcase} label="Position" value={selectedStaff.position} />
                        <ProfileField icon={Building2} label="Department" value={selectedStaff.department} />
                        <ProfileField icon={Calendar} label="Date Joined" value={formatDate(selectedStaff.dateJoined)} />
                        <ProfileField icon={Building2} label="Branch" value={branches.find(b => b.id === selectedStaff.branchId)?.name} />
                        <ProfileField icon={Hash} label="Employee ID" value={selectedStaff.employeeId} />
                        <ProfileField icon={IdCard} label="Employment Type" value={selectedStaff.employmentType?.replace(/_/g, ' ')} />
                      </div>
                    </div>
                    <Separator />
                    <p className="text-xs text-muted-foreground">Staff member since {formatDate(selectedStaff.createdAt)}</p>
                  </TabsContent>

                  <TabsContent value="personal" className="p-6 m-0 space-y-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <ProfileField
                        icon={Calendar}
                        label="Date of Birth"
                        value={selectedStaff.dateOfBirth
                          ? `${formatDate(selectedStaff.dateOfBirth)} · Age ${calculateAge(selectedStaff.dateOfBirth)}`
                          : undefined}
                      />
                      <ProfileField
                        icon={User}
                        label="Gender"
                        value={selectedStaff.gender
                          ? selectedStaff.gender.charAt(0).toUpperCase() + selectedStaff.gender.slice(1)
                          : undefined}
                      />
                      <ProfileField icon={User} label="Father's Name" value={selectedStaff.fatherName} />
                      <ProfileField icon={FileText} label="Passport / ID No." value={selectedStaff.passportNumber} />
                    </div>
                    {selectedStaff.bio && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Biography</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{selectedStaff.bio}</p>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Footer */}
              <div className="border-t bg-muted/25 px-6 py-4 flex justify-end gap-2 shrink-0">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  {t('common.close')}
                </Button>
                <Button onClick={() => { setIsViewDialogOpen(false); handleEditStaff(selectedStaff); }}>
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
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update the details for this staff member</DialogDescription>
          </DialogHeader>
          {selectedStaff && (
            <div className="grid gap-4 py-4">

              {/* Personal */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">{t('staff.firstName')}</Label>
                  <Input id="edit-firstName" value={editData.firstName ?? ''} onChange={(e) => handleEditChange('firstName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">{t('staff.lastName')}</Label>
                  <Input id="edit-lastName" value={editData.lastName ?? ''} onChange={(e) => handleEditChange('lastName', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-fatherName">Father's Name</Label>
                  <Input id="edit-fatherName" value={editData.fatherName ?? ''} onChange={(e) => handleEditChange('fatherName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">{t('staff.phone')}</Label>
                  <Input id="edit-phone" value={editData.phone ?? ''} onChange={(e) => handleEditChange('phone', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-dateOfBirth">Date of Birth</Label>
                  <BirthDateInput
                    id="edit-dateOfBirth"
                    value={editData.dateOfBirth ?? ''}
                    onValueChange={(value) => handleEditChange('dateOfBirth', value)}
                    onValidityChange={setIsEditBirthDateValid}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-gender">Gender</Label>
                  <Select value={editData.gender ?? ''} onValueChange={(v) => handleEditChange('gender', v)}>
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
                <Label htmlFor="edit-passportNumber">Passport / ID Number</Label>
                <Input id="edit-passportNumber" value={editData.passportNumber ?? ''} onChange={(e) => handleEditChange('passportNumber', e.target.value)} />
              </div>

              {/* Employment */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Employment</p>
                <div className="grid gap-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-position">{t('staff.position')}</Label>
                      <Input id="edit-position" value={editData.position ?? ''} onChange={(e) => handleEditChange('position', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-department">{t('staff.department')}</Label>
                      <Input id="edit-department" value={editData.department ?? ''} onChange={(e) => handleEditChange('department', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-role">{t('staff.role')}</Label>
                      <Select value={editData.role ?? ''} onValueChange={(value) => handleEditChange('role', value)}>
                        <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="superadmin">{t('roles.superadmin')}</SelectItem>
                          <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                          <SelectItem value="teacher">{t('roles.teacher')}</SelectItem>
                          <SelectItem value="librarian">{t('roles.librarian')}</SelectItem>
                          <SelectItem value="parent">{t('roles.parent')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-status">{t('staff.status')}</Label>
                      <Select value={editData.status ?? ''} onValueChange={(value) => handleEditChange('status', value)}>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-dateJoined">Date Joined</Label>
                      <Input id="edit-dateJoined" type="date" value={editData.dateJoined ?? ''} onChange={(e) => handleEditChange('dateJoined', e.target.value)} />
                    </div>
                    <div className="space-y-2">
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
                </div>
              </div>

              {/* Biography */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Biography</p>
                <Textarea id="edit-bio" rows={3} placeholder="A brief professional background, qualifications, or specialisation..." value={editData.bio ?? ''} onChange={(e) => handleEditChange('bio', e.target.value)} />
              </div>

              {user?.role === 'superadmin' && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3">Credentials (Superadmin only)</p>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-email">Email</Label>
                      <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-password">New Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
                      <Input id="edit-password" type="password" placeholder="Enter new password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Documents (live: uploads + downloads happen immediately) */}
              {selectedStaff?.userId && (
                <div className="border-t pt-4">
                  <DocumentsManager userId={selectedStaff.userId} />
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
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{' '}
              <strong>{selectedStaff ? `${selectedStaff.firstName} ${selectedStaff.lastName}` : 'this staff member'}</strong>?
              This will remove their record completely from the database and cannot be undone. To keep the staff member but disable their access, use the Inactive status in the edit form instead.
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
