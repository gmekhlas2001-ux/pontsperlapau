/**
 * Parent Links Management (admin only)
 *
 * Admins can create and manage parent ↔ student links here.
 * Parents log in with a regular user account (role=parent) and see
 * only the children linked to them via this interface.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Plus, Trash2, Search, Users, RefreshCw } from 'lucide-react';
import {
  getParentLinks,
  createParentLink,
  deleteParentLink,
  type ParentStudentLink,
} from '@/services/parentService';
import { getStudentsList } from '@/services/studentService';
import { supabase } from '@/lib/supabase';

interface ParentUser { id: string; first_name: string; last_name: string; email: string }
interface StudentUser { id: string; first_name: string; last_name: string; student_id: string }

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'] as const;

export default function ParentLinks() {
  const { t } = useTranslation();

  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [parents, setParents] = useState<ParentUser[]>([]);
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ParentStudentLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getParentLinks();
    setLoading(false);
    if (res.success && res.data) setLinks(res.data);
    else toast.error(res.error ?? t('parentLinks.errors.load'));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Load parent users
    supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('role', 'parent')
      .is('deleted_at', null)
      .then(({ data }) => {
        if (data) setParents(data as ParentUser[]);
      });
    // Load students
    getStudentsList().then((res) => {
      if (res.success && res.data) {
        setStudents(res.data.map((s: any) => ({
          id: s.id,
          first_name: s.user?.first_name ?? '',
          last_name: s.user?.last_name ?? '',
          student_id: s.student_id ?? '',
        })));
      }
    });
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteParentLink(deleteTarget.id);
    setDeleting(false);
    if (res.success) { toast.success(t('parentLinks.deleted')); setDeleteTarget(null); load(); }
    else toast.error(res.error ?? t('parentLinks.errors.delete'));
  }

  const filtered = links.filter((l) => {
    const q = search.toLowerCase();
    return !q ||
      l.studentFirstName.toLowerCase().includes(q) ||
      l.studentLastName.toLowerCase().includes(q) ||
      l.studentCode.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('parentLinks.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('parentLinks.subtitle')}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t('parentLinks.addLink')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t('parentLinks.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users className="w-10 h-10 opacity-30" />
              <p>{t('parentLinks.noLinks')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-3 font-medium">{t('parentLinks.student')}</th>
                    <th className="text-left p-3 font-medium">{t('parentLinks.parentUser')}</th>
                    <th className="text-left p-3 font-medium">{t('parentLinks.relationship')}</th>
                    <th className="text-left p-3 font-medium">{t('parentLinks.branch')}</th>
                    <th className="p-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((link) => {
                    const parent = parents.find((p) => p.id === link.parentUserId);
                    return (
                      <tr key={link.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="font-medium">{link.studentFirstName} {link.studentLastName}</div>
                          <div className="text-xs text-muted-foreground">{link.studentCode}</div>
                        </td>
                        <td className="p-3">
                          {parent ? (
                            <>
                              <div className="font-medium">{parent.first_name} {parent.last_name}</div>
                              <div className="text-xs text-muted-foreground">{parent.email}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">{link.parentUserId.slice(0, 8)}…</span>
                          )}
                        </td>
                        <td className="p-3 capitalize">
                          {t(`parent.relationship.${link.relationship}`, link.relationship)}
                        </td>
                        <td className="p-3 text-muted-foreground">{link.branchName ?? '—'}</td>
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(link)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add link dialog */}
      <AddLinkDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={load}
        parents={parents}
        students={students}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('parentLinks.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('parentLinks.deleteDesc', {
                student: deleteTarget ? `${deleteTarget.studentFirstName} ${deleteTarget.studentLastName}` : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Add Link Dialog ───────────────────────────────────────────────────────────

function AddLinkDialog({
  open,
  onClose,
  onCreated,
  parents,
  students,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  parents: ParentUser[];
  students: StudentUser[];
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    parentUserId: '',
    studentId: '',
    relationship: 'guardian' as const,
    isPrimary: true,
  });

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.parentUserId) { toast.error(t('parentLinks.errors.selectParent')); return; }
    if (!form.studentId) { toast.error(t('parentLinks.errors.selectStudent')); return; }
    setSaving(true);
    const res = await createParentLink(form);
    setSaving(false);
    if (res.success) {
      toast.success(t('parentLinks.created'));
      onCreated();
      onClose();
      setForm({ parentUserId: '', studentId: '', relationship: 'guardian', isPrimary: true });
    } else {
      toast.error(res.error ?? t('parentLinks.errors.create'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('parentLinks.addLink')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('parentLinks.parentUser')}</Label>
            <Select value={form.parentUserId} onValueChange={(v) => set('parentUserId', v)}>
              <SelectTrigger><SelectValue placeholder={t('parentLinks.selectParent')} /></SelectTrigger>
              <SelectContent>
                {parents.length === 0 ? (
                  <SelectItem value="_none" disabled>{t('parentLinks.noParentUsers')}</SelectItem>
                ) : parents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} — {p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('parentLinks.student')}</Label>
            <Select value={form.studentId} onValueChange={(v) => set('studentId', v)}>
              <SelectTrigger><SelectValue placeholder={t('parentLinks.selectStudent')} /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.student_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('parentLinks.relationship')}</Label>
            <Select value={form.relationship} onValueChange={(v) => set('relationship', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`parent.relationship.${r}`, r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('parentLinks.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
