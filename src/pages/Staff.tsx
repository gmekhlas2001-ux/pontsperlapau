import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockStaff } from '@/lib/mockData';
import { DataTable } from '@/components/ui-custom/DataTable';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { createStaff, type CreateStaffData } from '@/services/staffService';
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
import { Plus, MoveHorizontal as MoreHorizontal, Mail, Phone, Pencil, Trash2, Grid3x2 as Grid3X3, List } from 'lucide-react';
import { formatDate, getFullName } from '@/lib/utils';
import type { Staff } from '@/types';

export function Staff() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateStaffData>>({
    gender: 'male',
    role: 'teacher',
  });

  const handleInputChange = (field: keyof CreateStaffData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveStaff = async () => {
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.password ||
      !formData.position ||
      !formData.dateOfBirth ||
      !formData.gender ||
      !formData.role ||
      !formData.dateJoined
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createStaff(formData as CreateStaffData);

      if (result.success) {
        toast.success('Staff member created successfully');
        setIsAddDialogOpen(false);
        setFormData({ gender: 'male', role: 'teacher' });
        window.location.reload();
      } else {
        toast.error(result.error || 'Failed to create staff member');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: t('staff.fullName'),
      cell: (staff: Staff) => (
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
      cell: (staff: Staff) => staff.position,
      sortable: true,
    },
    {
      key: 'role',
      header: t('staff.role'),
      cell: (staff: Staff) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
          {t(`roles.${staff.role}`)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'email',
      header: t('staff.email'),
      cell: (staff: Staff) => (
        <a href={`mailto:${staff.email}`} className="text-primary hover:underline">
          {staff.email}
        </a>
      ),
    },
    {
      key: 'phone',
      header: t('staff.phone'),
      cell: (staff: Staff) => staff.phone || '-',
    },
    {
      key: 'status',
      header: t('staff.status'),
      cell: (staff: Staff) => <StatusBadge status={staff.status} />,
      sortable: true,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (_staff: Staff) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Mail className="mr-2 h-4 w-4" />
              {t('common.view')}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">
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
      {mockStaff.map((staff) => (
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
              <Button variant="outline" size="sm" className="flex-1">
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.edit')}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.delete')}
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
          <h1 className="text-3xl font-bold tracking-tight">{t('staff.title')}</h1>
          <p className="text-muted-foreground">{t('staff.staffList')}</p>
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
                {t('staff.addStaff')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('staff.addStaff')}</DialogTitle>
                <DialogDescription>Fill in the details to add a new staff member to the system</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('staff.firstName')}</Label>
                    <Input
                      id="firstName"
                      required
                      value={formData.firstName || ''}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('staff.lastName')}</Label>
                    <Input
                      id="lastName"
                      required
                      value={formData.lastName || ''}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fatherName">Father's Name</Label>
                  <Input
                    id="fatherName"
                    value={formData.fatherName || ''}
                    onChange={(e) => handleInputChange('fatherName', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      required
                      value={formData.dateOfBirth || ''}
                      onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
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
                  <Label htmlFor="passportNumber">Passport/ID Number</Label>
                  <Input
                    id="passportNumber"
                    value={formData.passportNumber || ''}
                    onChange={(e) => handleInputChange('passportNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('staff.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password || ''}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('staff.phone')}</Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="position">{t('staff.position')}</Label>
                    <Input
                      id="position"
                      required
                      value={formData.position || ''}
                      onChange={(e) => handleInputChange('position', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">{t('staff.department')}</Label>
                    <Input
                      id="department"
                      value={formData.department || ''}
                      onChange={(e) => handleInputChange('department', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">{t('staff.role')}</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => handleInputChange('role', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="superadmin">{t('roles.superadmin')}</SelectItem>
                      <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                      <SelectItem value="teacher">{t('roles.teacher')}</SelectItem>
                      <SelectItem value="librarian">{t('roles.librarian')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateJoined">Date Joined</Label>
                  <Input
                    id="dateJoined"
                    type="date"
                    required
                    value={formData.dateJoined || ''}
                    onChange={(e) => handleInputChange('dateJoined', e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSaveStaff} disabled={isSubmitting}>
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
          data={mockStaff}
          columns={columns}
          keyExtractor={(staff) => staff.id}
          searchKeys={['firstName', 'lastName', 'email', 'position']}
        />
      ) : (
        renderCardView()
      )}
    </div>
  );
}
