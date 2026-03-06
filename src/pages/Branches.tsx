import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import {
  Plus,
  MapPin,
  Users,
  GraduationCap,
  BookOpen,
  Phone,
  Mail,
  Calendar,
  MoveHorizontal as MoreHorizontal,
  Pencil,
  Trash2,
  Building2,
  Eye,
} from 'lucide-react';
import { formatDate, getFullName } from '@/lib/utils';
import {
  getBranchesWithStats,
  getBranchMembers,
  createBranch,
  updateBranch,
  deleteBranch,
  type BranchWithStats,
  type CreateBranchData,
  type UpdateBranchData,
} from '@/services/branchService';


const EMPTY_FORM: CreateBranchData = {
  name: '',
  province: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  established_date: '',
  status: 'active',
};

interface BranchMember {
  id: string;
  user_id?: string;
  branch_id?: string;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    role?: string;
    status?: string;
    profile_picture_url?: string;
  };
  position?: string;
  grade_level?: string;
  enrollment_date?: string;
  date_joined?: string;
}

export function Branches() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = user?.role === 'superadmin' || user?.role === 'admin';

  const [branches, setBranches] = useState<BranchWithStats[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<BranchWithStats | null>(null);
  const [branchMembers, setBranchMembers] = useState<{
    staff: BranchMember[];
    students: BranchMember[];
    books: any[];
  }>({ staff: [], students: [], books: [] });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<BranchWithStats | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  const [addForm, setAddForm] = useState<CreateBranchData>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<UpdateBranchData>({});

  const fetchBranches = useCallback(async () => {
    const result = await getBranchesWithStats();
    if (result.success && result.data) {
      setBranches(result.data);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const openProfile = async (branch: BranchWithStats) => {
    setSelectedBranch(branch);
    setIsProfileOpen(true);
    setIsMembersLoading(true);
    const result = await getBranchMembers(branch.id);
    if (result.success) {
      setBranchMembers({
        staff: result.staff as BranchMember[],
        students: result.students as BranchMember[],
        books: result.books ?? [],
      });
    }
    setIsMembersLoading(false);
  };

  const handleAddBranch = async () => {
    if (!addForm.name || !addForm.province) {
      toast.error(t('branches.nameRequired'));
      return;
    }
    setIsSubmitting(true);
    const result = await createBranch(addForm);
    if (result.success) {
      toast.success(t('branches.createSuccess'));
      setIsAddOpen(false);
      setAddForm(EMPTY_FORM);
      await fetchBranches();
    } else {
      toast.error(result.error || t('branches.createFailed'));
    }
    setIsSubmitting(false);
  };

  const openEdit = (branch: BranchWithStats) => {
    setSelectedBranch(branch);
    setEditForm({
      name: branch.name,
      province: branch.province,
      city: branch.city || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      established_date: branch.established_date || '',
      status: branch.status,
    });
    setIsEditOpen(true);
  };

  const handleEditBranch = async () => {
    if (!selectedBranch) return;
    setIsSubmitting(true);
    const result = await updateBranch(selectedBranch.id, editForm);
    if (result.success) {
      toast.success(t('branches.updateSuccess'));
      setIsEditOpen(false);
      if (isProfileOpen) {
        setSelectedBranch((prev) =>
          prev ? { ...prev, ...result.data! } : null
        );
      }
      await fetchBranches();
    } else {
      toast.error(result.error || t('branches.updateFailed'));
    }
    setIsSubmitting(false);
  };

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsSubmitting(true);
    const result = await deleteBranch(branchToDelete.id);
    if (result.success) {
      toast.success(t('branches.deleteSuccess'));
      setIsDeleteOpen(false);
      setBranchToDelete(null);
      if (isProfileOpen && selectedBranch?.id === branchToDelete.id) {
        setIsProfileOpen(false);
      }
      await fetchBranches();
    } else {
      toast.error(result.error || t('branches.deleteFailed'));
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('branches.title')}</h1>
          <p className="text-muted-foreground">{t('branches.subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('branches.addBranch')}
          </Button>
        )}
      </div>

      {branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">{t('branches.emptyTitle')}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {t('branches.emptyDescription')}
          </p>
          {canManage && (
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('branches.addBranch')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {branches.map((branch) => (
            <Card
              key={branch.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-border"
              onClick={() => openProfile(branch)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold truncate">{branch.name}</CardTitle>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{branch.province}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Badge variant={branch.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {t(`common.${branch.status}`)}
                    </Badge>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openProfile(branch); }}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('branches.viewProfile')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(branch); }}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => { e.stopPropagation(); setBranchToDelete(branch); setIsDeleteOpen(true); }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center justify-center mb-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold leading-none">{branch.staffCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('branches.staffCount')}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center justify-center mb-1">
                      <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold leading-none">{branch.studentCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('branches.studentCount')}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center justify-center mb-1">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold leading-none">{branch.bookCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('branches.bookCount')}</p>
                  </div>
                </div>
                {branch.totalMembers > 0 && (
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    {t('branches.totalMembers', { count: branch.totalMembers })}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Branch Profile Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedBranch && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">{t('branches.branchDialogTitle', { name: selectedBranch.name })}</DialogTitle>
                    <DialogDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {t('branches.provinceLabel', { name: selectedBranch.province })}
                      {selectedBranch.city && `, ${selectedBranch.city}`}
                    </DialogDescription>
                  </div>
                  <Badge variant={selectedBranch.status === 'active' ? 'default' : 'secondary'}>
                    {t(`common.${selectedBranch.status}`)}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 my-2">
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <Users className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-2xl font-bold">{selectedBranch.staffCount}</p>
                  <p className="text-sm text-muted-foreground">{t('branches.staffMembers')}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <GraduationCap className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-2xl font-bold">{selectedBranch.studentCount}</p>
                  <p className="text-sm text-muted-foreground">{t('branches.studentCount')}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <BookOpen className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-2xl font-bold">{selectedBranch.bookCount}</p>
                  <p className="text-sm text-muted-foreground">{t('branches.bookCount')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                {selectedBranch.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{selectedBranch.phone}</span>
                  </div>
                )}
                {selectedBranch.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{selectedBranch.email}</span>
                  </div>
                )}
                {selectedBranch.address && (
                  <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{selectedBranch.address}</span>
                  </div>
                )}
                {selectedBranch.established_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{t('branches.est')} {formatDate(selectedBranch.established_date)}</span>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="flex gap-2 mb-4">
                  <Button size="sm" variant="outline" onClick={() => { setIsProfileOpen(false); openEdit(selectedBranch); }}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    {t('branches.editBranch')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => { setBranchToDelete(selectedBranch); setIsDeleteOpen(true); }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {t('common.delete')}
                  </Button>
                </div>
              )}

              <Tabs defaultValue="staff">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="staff">
                    {t('branches.staffTab', { count: selectedBranch.staffCount })}
                  </TabsTrigger>
                  <TabsTrigger value="students">
                    {t('branches.studentsTab', { count: selectedBranch.studentCount })}
                  </TabsTrigger>
                  <TabsTrigger value="books">
                    {t('branches.booksTab', { count: selectedBranch.bookCount })}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="staff" className="mt-4">
                  {isMembersLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('common.loading')}</p>
                  ) : branchMembers.staff.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('branches.noStaff')}</p>
                  ) : (
                    <div className="space-y-2">
                      {branchMembers.staff.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <AvatarWithFallback
                            src={s.user?.profile_picture_url}
                            firstName={s.user?.first_name ?? ''}
                            lastName={s.user?.last_name ?? ''}
                            className="h-9 w-9 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{getFullName(s.user?.first_name ?? '', s.user?.last_name ?? '')}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.position || s.user?.role}</p>
                          </div>
                          <StatusBadge status={(s.user?.status ?? 'active') as 'active' | 'inactive'} />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="students" className="mt-4">
                  {isMembersLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('common.loading')}</p>
                  ) : branchMembers.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('branches.noStudents')}</p>
                  ) : (
                    <div className="space-y-2">
                      {branchMembers.students.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <AvatarWithFallback
                            src={s.user?.profile_picture_url}
                            firstName={s.user?.first_name ?? ''}
                            lastName={s.user?.last_name ?? ''}
                            className="h-9 w-9 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{getFullName(s.user?.first_name ?? '', s.user?.last_name ?? '')}</p>
                            <p className="text-xs text-muted-foreground">{s.grade_level || t('branches.noGradeLevel')}</p>
                          </div>
                          <StatusBadge status={(s.user?.status ?? 'active') as 'active' | 'inactive'} />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="books" className="mt-4">
                  {isMembersLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('common.loading')}</p>
                  ) : branchMembers.books.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('branches.noBooks')}</p>
                  ) : (
                    <div className="space-y-2">
                      {branchMembers.books.map((book: any) => (
                        <div key={book.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{book.title}</p>
                            <p className="text-xs text-muted-foreground">{book.author}</p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{book.available_copies}/{book.total_copies} {t('branches.availability')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Branch Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('branches.addDialogTitle')}</DialogTitle>
            <DialogDescription>{t('branches.addDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('branches.formName')} <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Kabul Central"
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.formProvince')} <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Kabul, Catalonia, Madrid..."
                  value={addForm.province}
                  onChange={(e) => setAddForm((p) => ({ ...p, province: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('branches.formCity')}</Label>
                <Input
                  placeholder={t('branches.formCityPlaceholder')}
                  value={addForm.city}
                  onChange={(e) => setAddForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.formPhone')}</Label>
                <Input
                  placeholder="+93..."
                  value={addForm.phone}
                  onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('branches.formEmail')}</Label>
              <Input
                type="email"
                placeholder="branch@example.org"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('branches.formAddress')}</Label>
              <Input
                placeholder={t('branches.formAddressPlaceholder')}
                value={addForm.address}
                onChange={(e) => setAddForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('branches.formEstablishedDate')}</Label>
                <Input
                  type="date"
                  value={addForm.established_date}
                  onChange={(e) => setAddForm((p) => ({ ...p, established_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.formStatus')}</Label>
                <Select value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: v as 'active' | 'inactive' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('common.active')}</SelectItem>
                    <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleAddBranch} disabled={isSubmitting}>
                {isSubmitting ? t('branches.creating') : t('branches.createButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Branch Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('branches.editDialogTitle')}</DialogTitle>
            <DialogDescription>{t('branches.editDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('branches.formName')} <span className="text-red-500">*</span></Label>
                <Input
                  value={editForm.name ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.formProvince')} <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Kabul, Catalonia, Madrid..."
                  value={editForm.province ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, province: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('branches.formCity')}</Label>
                <Input
                  value={editForm.city ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.formPhone')}</Label>
                <Input
                  value={editForm.phone ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('branches.formEmail')}</Label>
              <Input
                type="email"
                value={editForm.email ?? ''}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('branches.formAddress')}</Label>
              <Input
                value={editForm.address ?? ''}
                onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('branches.formEstablishedDate')}</Label>
                <Input
                  type="date"
                  value={editForm.established_date ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, established_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.formStatus')}</Label>
                <Select value={editForm.status ?? 'active'} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as 'active' | 'inactive' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('common.active')}</SelectItem>
                    <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleEditBranch} disabled={isSubmitting}>
                {isSubmitting ? t('settings.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('branches.deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('branches.deleteDialogDescription', { name: branchToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBranch}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? t('branches.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
