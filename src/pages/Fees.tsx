import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Plus,
  MoreHorizontal,
  Search,
  CircleDollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  CreditCard,
  Banknote,
  RefreshCw,
} from 'lucide-react';
import {
  getFees,
  createFee,
  markFeePaid,
  updateFeeStatus,
  deleteFee,
  type FeeRecord,
  type FeeSummary,
  type FeeStatus,
  type FeePaymentMethod,
  type CreateFeeData,
} from '@/services/feeService';
import { getStudentsList } from '@/services/studentService';
import { getBranches, type Branch } from '@/services/branchService';
import { scopedBranchId } from '@/lib/scope';

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<FeeStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  paid: 'bg-green-100 text-green-800 border-green-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
  waived: 'bg-gray-100 text-gray-600 border-gray-200',
  partial: 'bg-blue-100 text-blue-800 border-blue-200',
};

function StatusBadge({ status }: { status: FeeStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status]}`}>
      {t(`fees.status.${status}`, status)}
    </span>
  );
}

function fmt(amount: number, currency = 'EUR') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

// ─── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: FeeSummary }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <CircleDollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fees.summary.total')}</p>
            <p className="text-lg font-bold">{fmt(summary.totalAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.totalFees} {t('fees.summary.records')}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fees.summary.paid')}</p>
            <p className="text-lg font-bold text-green-700">{fmt(summary.paidAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.paidCount} {t('fees.summary.records')}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fees.summary.pending')}</p>
            <p className="text-lg font-bold text-amber-700">{fmt(summary.pendingAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.pendingCount} {t('fees.summary.records')}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('fees.summary.overdue')}</p>
            <p className="text-lg font-bold text-red-700">{fmt(summary.overdueAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.overdueCount} {t('fees.summary.records')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Add Fee Dialog ────────────────────────────────────────────────────────────

interface Student { id: string; first_name: string; last_name: string; student_id: string }

function AddFeeDialog({
  open,
  onClose,
  onCreated,
  students,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  students: Student[];
  branches: Branch[];
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const branchId = scopedBranchId();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateFeeData>({
    studentId: '',
    branchId: branchId ?? (branches[0]?.id ?? ''),
    description: '',
    amount: 0,
    currency: 'EUR',
    dueDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  function set<K extends keyof CreateFeeData>(k: K, v: CreateFeeData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentId) { toast.error(t('fees.errors.selectStudent')); return; }
    if (!form.description.trim()) { toast.error(t('fees.errors.description')); return; }
    if (form.amount <= 0) { toast.error(t('fees.errors.amount')); return; }

    setSaving(true);
    const res = await createFee({ ...form, notes: form.notes || undefined });
    setSaving(false);
    if (res.success) {
      toast.success(t('fees.created'));
      onCreated();
      onClose();
    } else {
      toast.error(res.error ?? t('fees.errors.create'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('fees.addFee')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Student */}
          <div className="space-y-1">
            <Label>{t('fees.student')}</Label>
            <Select value={form.studentId} onValueChange={(v) => set('studentId', v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('fees.selectStudent')} />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.student_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Branch — only visible to superadmin */}
          {user?.role === 'superadmin' && (
            <div className="space-y-1">
              <Label>{t('fees.branch')}</Label>
              <Select value={form.branchId} onValueChange={(v) => set('branchId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <Label>{t('fees.description')}</Label>
            <Input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('fees.descriptionPlaceholder')}
            />
          </div>

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('fees.amount')}</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.amount}
                onChange={(e) => set('amount', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('fees.currency')}</Label>
              <Select value={form.currency ?? 'EUR'} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['EUR', 'USD', 'GBP', 'CAD', 'AUD'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-1">
            <Label>{t('fees.dueDate')}</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>{t('fees.notes')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
            <Textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('fees.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark Paid Dialog ──────────────────────────────────────────────────────────

function MarkPaidDialog({
  fee,
  onClose,
  onPaid,
}: {
  fee: FeeRecord | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<FeePaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fee) return;
    setSaving(true);
    const res = await markFeePaid(fee.id, method, notes || undefined);
    setSaving(false);
    if (res.success) {
      toast.success(t('fees.markedPaid'));
      onPaid();
      onClose();
    } else {
      toast.error(res.error ?? t('fees.errors.markPaid'));
    }
  }

  const METHODS: { value: FeePaymentMethod; label: string; icon: React.ReactNode }[] = [
    { value: 'cash', label: t('fees.methods.cash'), icon: <Banknote className="w-4 h-4" /> },
    { value: 'bank_transfer', label: t('fees.methods.bank_transfer'), icon: <RefreshCw className="w-4 h-4" /> },
    { value: 'card', label: t('fees.methods.card'), icon: <CreditCard className="w-4 h-4" /> },
    { value: 'other', label: t('fees.methods.other'), icon: <CircleDollarSign className="w-4 h-4" /> },
  ];

  return (
    <Dialog open={!!fee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fees.markAsPaid')}</DialogTitle>
        </DialogHeader>
        {fee && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
              <p className="font-medium">{fee.studentFirstName} {fee.studentLastName}</p>
              <p className="text-muted-foreground">{fee.description}</p>
              <p className="text-lg font-bold text-green-700">{fmt(fee.amount, fee.currency)}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('fees.paymentMethod')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors
                      ${method === m.value
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:bg-muted'}`}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('fees.notes')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700">
                {saving ? t('common.saving') : t('fees.confirmPaid')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Fees() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';
  const canManage = isAdmin || user?.role === 'teacher';

  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [summary, setSummary] = useState<FeeSummary>({
    totalFees: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0,
    overdueAmount: 0, overdueCount: 0, pendingCount: 0, paidCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FeeStatus | 'all'>('all');

  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [payFee, setPayFee] = useState<FeeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getFees();
    setLoading(false);
    if (res.success && res.data) {
      setFees(res.data);
      if (res.summary) setSummary(res.summary);
    } else {
      toast.error(res.error ?? t('fees.errors.load'));
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canManage) return;
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
    if (user?.role === 'superadmin') {
      getBranches().then((res) => {
        if (res.success && res.data) setBranches(res.data);
      });
    }
  }, [canManage, user?.role]);

  async function handleWaive(fee: FeeRecord) {
    const res = await updateFeeStatus(fee.id, 'waived');
    if (res.success) { toast.success(t('fees.waived')); load(); }
    else toast.error(res.error ?? t('fees.errors.update'));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteFee(deleteTarget.id);
    setDeleting(false);
    if (res.success) { toast.success(t('fees.deleted')); setDeleteTarget(null); load(); }
    else toast.error(res.error ?? t('fees.errors.delete'));
  }

  const STATUS_OPTIONS: Array<{ value: FeeStatus | 'all'; label: string }> = [
    { value: 'all', label: t('fees.allStatuses') },
    { value: 'pending', label: t('fees.status.pending') },
    { value: 'overdue', label: t('fees.status.overdue') },
    { value: 'partial', label: t('fees.status.partial') },
    { value: 'paid', label: t('fees.status.paid') },
    { value: 'waived', label: t('fees.status.waived') },
  ];

  const filtered = fees.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      f.studentFirstName.toLowerCase().includes(q) ||
      f.studentLastName.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.studentCode.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || f.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const hasOverdue = summary.overdueCount > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('fees.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('fees.subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('fees.addFee')}
          </Button>
        )}
      </div>

      {/* Summary */}
      <SummaryCards summary={summary} />

      {/* Overdue alert */}
      {hasOverdue && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {t('fees.overdueAlert', { count: summary.overdueCount, amount: fmt(summary.overdueAmount) })}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('fees.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FeeStatus | 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              <CircleDollarSign className="w-10 h-10 opacity-30" />
              <p>{t('fees.noFees')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-3 font-medium">{t('fees.student')}</th>
                    <th className="text-left p-3 font-medium">{t('fees.description')}</th>
                    <th className="text-right p-3 font-medium">{t('fees.amount')}</th>
                    <th className="text-left p-3 font-medium">{t('fees.dueDate')}</th>
                    <th className="text-left p-3 font-medium">{t('fees.paidDate')}</th>
                    <th className="text-left p-3 font-medium">{t('fees.statusLabel')}</th>
                    {canManage && <th className="p-3 w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((fee) => {
                    const isPastDue = !['paid', 'waived'].includes(fee.status) &&
                      new Date(fee.dueDate) < new Date();
                    return (
                      <tr key={fee.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="font-medium">{fee.studentFirstName} {fee.studentLastName}</div>
                          <div className="text-xs text-muted-foreground">{fee.studentCode}</div>
                        </td>
                        <td className="p-3">
                          <div>{fee.description}</div>
                          {fee.className && (
                            <div className="text-xs text-muted-foreground">{fee.className}</div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-medium">
                          {fmt(fee.amount, fee.currency)}
                        </td>
                        <td className={`p-3 ${isPastDue ? 'text-red-600 font-medium' : ''}`}>
                          {new Date(fee.dueDate).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {fee.paidDate ? new Date(fee.paidDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={fee.status} />
                        </td>
                        {canManage && (
                          <td className="p-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {fee.status !== 'paid' && fee.status !== 'waived' && (
                                  <DropdownMenuItem onClick={() => setPayFee(fee)}>
                                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                                    {t('fees.markAsPaid')}
                                  </DropdownMenuItem>
                                )}
                                {fee.status !== 'waived' && fee.status !== 'paid' && (
                                  <DropdownMenuItem onClick={() => handleWaive(fee)}>
                                    <CircleDollarSign className="w-4 h-4 mr-2 text-gray-500" />
                                    {t('fees.waive')}
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && (
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget(fee)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {t('common.delete')}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {canManage && (
        <AddFeeDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onCreated={load}
          students={students}
          branches={branches}
        />
      )}
      <MarkPaidDialog fee={payFee} onClose={() => setPayFee(null)} onPaid={load} />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fees.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fees.deleteDesc', {
                name: deleteTarget ? `${deleteTarget.studentFirstName} ${deleteTarget.studentLastName}` : '',
                description: deleteTarget?.description ?? '',
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
