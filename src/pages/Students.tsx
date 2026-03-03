import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockStudents, mockClasses } from '@/lib/mockData';
import { DataTable } from '@/components/ui-custom/DataTable';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
import { Plus, MoreHorizontal, Mail, Phone, Pencil, Trash2, Grid3X3, List, BookOpen } from 'lucide-react';
import { formatDate, getFullName } from '@/lib/utils';
import type { Student } from '@/types';

export function Students() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const columns = [
    {
      key: 'name',
      header: t('students.fullName'),
      cell: (student: Student) => (
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
      cell: (student: Student) => (
        <a href={`mailto:${student.email}`} className="text-primary hover:underline">
          {student.email}
        </a>
      ),
    },
    {
      key: 'gradeLevel',
      header: t('students.gradeLevel'),
      cell: (student: Student) => student.gradeLevel || '-',
      sortable: true,
    },
    {
      key: 'classes',
      header: t('students.classesEnrolled'),
      cell: (student: Student) => (
        <div className="flex flex-wrap gap-1">
          {student.classes.map((classId) => {
            const cls = mockClasses.find((c) => c.id === classId);
            return cls ? (
              <span
                key={classId}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
              >
                {cls.name}
              </span>
            ) : null;
          })}
          {student.classes.length === 0 && '-'}
        </div>
      ),
    },
    {
      key: 'attendanceRate',
      header: t('students.attendanceRate'),
      cell: (student: Student) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${student.attendanceRate || 0}%` }}
            />
          </div>
          <span className="text-sm">{student.attendanceRate}%</span>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      header: t('students.status'),
      cell: (student: Student) => <StatusBadge status={student.status} />,
      sortable: true,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (_student: Student) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <BookOpen className="mr-2 h-4 w-4" />
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
      {mockStudents.map((student) => (
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
                  <p className="text-sm text-muted-foreground">{student.gradeLevel}</p>
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('students.attendanceRate')}:</span>
                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${student.attendanceRate || 0}%` }}
                  />
                </div>
                <span className="text-sm">{student.attendanceRate}%</span>
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
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('students.firstName')}</Label>
                    <Input id="firstName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('students.lastName')}</Label>
                    <Input id="lastName" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fatherName">Father's Name</Label>
                  <Input id="fatherName" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input id="dateOfBirth" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select>
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
                  <Input id="passportNumber" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('students.email')}</Label>
                  <Input id="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('students.phone')}</Label>
                  <Input id="phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">{t('students.gradeLevel')}</Label>
                  <Input id="gradeLevel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enrollmentDate">Enrollment Date</Label>
                  <Input id="enrollmentDate" type="date" required />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button>{t('common.save')}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === 'list' ? (
        <DataTable
          data={mockStudents}
          columns={columns}
          keyExtractor={(student) => student.id}
          searchKeys={['firstName', 'lastName', 'email', 'gradeLevel']}
        />
      ) : (
        renderCardView()
      )}
    </div>
  );
}
