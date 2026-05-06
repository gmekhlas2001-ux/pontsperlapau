/**
 * Donors & Grants — NGO funding tracker
 *
 * Two-panel layout:
 *  Left  — list of donors with total grant amounts
 *  Right — grants for selected donor + transaction ledger per grant
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, RefreshCw, HandCoins, TrendingDown, TrendingUp, ChevronRight, Search,
} from 'lucide-react';
import {
  getDonors, createDonor, deleteDonor, getGrants, createGrant, deleteGrant,
  getGrantTransactions, createGrantTransaction, deleteGrantTransaction,
  type Donor, type Grant, type GrantTransaction, type GrantStatus, type TxType,
  type CreateDonorData, type CreateGrantData, type CreateTxData,
} from '@/services/donorService';
import { getBranches, type Branch } from '@/services/branchService';
import { scopedBranchId } from '@/lib/scope';

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

const STATUS_COLORS: Record<GrantStatus, string> = {
  active:    'bg-green-100 text-green-800',
  pending:   'bg-amber-100 text-amber-800',
  closed:    'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-800',
};

const DONOR_TYPES = ['individual', 'organisation', 'government', 'foundation'] as const;
// ─── Donor form ────────────────────────────────────────────────────────────────

function DonorDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateDonorData>({ name: '', type: 'individual' });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CreateDonorData>(k: K, v: CreateDonorData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('donors.errors.name')); return; }
    setSaving(true);
    const res = await createDonor(form);
    setSaving(false);
    if (res.success) { toast.success(t('donors.donorCreated')); onCreated(); onClose(); setForm({ name: '', type: 'individual' }); }
    else toast.error(res.error ?? t('donors.errors.create'));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('donors.addDonor')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('donors.name')}</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('donors.type')}</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DONOR_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>{t(`donors.types.${dt}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('donors.email')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('donors.phone')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('donors.country')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
            <Input value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('donors.notes')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('donors.create')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grant form ────────────────────────────────────────────────────────────────

function GrantDialog({ open, onClose, onCreated, donorId, branches }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  donorId: string; branches: Branch[];
}) {
  const { t } = useTranslation();
  const branchId = scopedBranchId();
  const [form, setForm] = useState<CreateGrantData>({ donorId, branchId: branchId ?? branches[0]?.id ?? '', title: '', amount: 0, currency: 'EUR' });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CreateGrantData>(k: K, v: CreateGrantData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error(t('donors.errors.grantTitle')); return; }
    if (form.amount <= 0) { toast.error(t('donors.errors.grantAmount')); return; }
    setSaving(true);
    const res = await createGrant({ ...form, donorId });
    setSaving(false);
    if (res.success) { toast.success(t('donors.grantCreated')); onCreated(); onClose(); }
    else toast.error(res.error ?? t('donors.errors.createGrant'));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('donors.addGrant')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('donors.grantTitle')}</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={t('donors.grantTitlePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('donors.grantAmount')}</Label>
              <Input type="number" min={0} step={0.01} value={form.amount} onChange={(e) => set('amount', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>{t('donors.currency')}</Label>
              <Select value={form.currency ?? 'EUR'} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['EUR', 'USD', 'GBP', 'CAD'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('donors.startDate')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
              <Input type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('donors.endDate')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
              <Input type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('donors.description')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
            <Textarea rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('donors.createGrant')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction form ──────────────────────────────────────────────────────────

function TxDialog({ open, onClose, onCreated, grantId }: { open: boolean; onClose: () => void; onCreated: () => void; grantId: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateTxData>({ grantId, description: '', amount: 0, type: 'expense', txDate: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CreateTxData>(k: K, v: CreateTxData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) { toast.error(t('donors.errors.txDesc')); return; }
    if (form.amount <= 0) { toast.error(t('donors.errors.txAmount')); return; }
    setSaving(true);
    const res = await createGrantTransaction({ ...form, grantId });
    setSaving(false);
    if (res.success) { toast.success(t('donors.txCreated')); onCreated(); onClose(); }
    else toast.error(res.error ?? t('donors.errors.createTx'));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('donors.addTransaction')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('donors.txType')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as TxType[]).map((tp) => (
                <button key={tp} type="button"
                  onClick={() => set('type', tp)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors ${
                    form.type === tp ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:bg-muted'
                  }`}
                >
                  {tp === 'expense' ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  {t(`donors.txTypes.${tp}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('donors.txDescription')}</Label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('donors.txAmount')}</Label>
              <Input type="number" min={0} step={0.01} value={form.amount} onChange={(e) => set('amount', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>{t('donors.txDate')}</Label>
              <Input type="date" value={form.txDate ?? ''} onChange={(e) => set('txDate', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('donors.notes')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('donors.recordTx')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grant detail card ─────────────────────────────────────────────────────────

function GrantCard({ grant, onRefresh }: { grant: Grant; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [txs, setTxs] = useState<GrantTransaction[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function toggleExpand() {
    if (!expanded) {
      setLoadingTxs(true);
      const res = await getGrantTransactions(grant.id);
      setLoadingTxs(false);
      if (res.success) setTxs(res.data ?? []);
    }
    setExpanded((p) => !p);
  }

  async function handleDeleteTx(id: string) {
    const res = await deleteGrantTransaction(id);
    if (res.success) {
      setTxs((prev) => prev.filter((t) => t.id !== id));
      onRefresh();
    } else toast.error(res.error);
  }

  async function handleDeleteGrant() {
    const res = await deleteGrant(grant.id);
    if (res.success) { toast.success(t('donors.grantDeleted')); onRefresh(); }
    else toast.error(res.error);
  }

  const barColor = grant.spentPct >= 90 ? 'bg-red-500' : grant.spentPct >= 70 ? 'bg-amber-500' : 'bg-teal-500';

  return (
    <div className="border rounded-lg">
      <div className="p-3 cursor-pointer hover:bg-muted/30" onClick={toggleExpand}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{grant.title}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[grant.status]}`}>
                {t(`donors.statuses.${grant.status}`)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmt(grant.amount, grant.currency)} · {grant.branchName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{t('donors.spent')}</p>
            <p className="font-mono text-sm font-bold">{fmt(grant.spent, grant.currency)}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(grant.spentPct, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>{grant.spentPct}% {t('donors.used')}</span>
            <span>{fmt(grant.remaining, grant.currency)} {t('donors.remaining')}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('donors.transactions')}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowTxForm(true)}>
                <Plus className="w-3 h-3" />{t('donors.addTransaction')}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={handleDeleteGrant}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {loadingTxs && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
          {txs.length === 0 && !loadingTxs && (
            <p className="text-xs text-muted-foreground">{t('donors.noTransactions')}</p>
          )}
          {txs.map((tx) => (
            <div key={tx.id} className="flex items-center gap-2 text-sm py-1">
              {tx.type === 'expense'
                ? <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                : <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />
              }
              <span className="flex-1 truncate">{tx.description}</span>
              <span className="text-xs text-muted-foreground">{new Date(tx.txDate).toLocaleDateString()}</span>
              <span className={`font-mono font-medium ${tx.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount, grant.currency)}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => handleDeleteTx(tx.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <TxDialog
        open={showTxForm}
        onClose={() => setShowTxForm(false)}
        onCreated={() => { onRefresh(); getGrantTransactions(grant.id).then((r) => { if (r.success) setTxs(r.data ?? []); }); }}
        grantId={grant.id}
      />
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function Donors() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [showDonorForm, setShowDonorForm] = useState(false);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Donor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadDonors = useCallback(async () => {
    setLoading(true);
    const res = await getDonors();
    setLoading(false);
    if (res.success && res.data) setDonors(res.data);
  }, []);

  const loadGrants = useCallback(async (donorId: string) => {
    const res = await getGrants(donorId);
    if (res.success && res.data) setGrants(res.data);
  }, []);

  useEffect(() => { loadDonors(); }, [loadDonors]);
  useEffect(() => {
    if (user?.role === 'superadmin') getBranches().then((r) => { if (r.success && r.data) setBranches(r.data); });
  }, [user?.role]);

  async function selectDonor(d: Donor) {
    setSelectedDonor(d);
    await loadGrants(d.id);
  }

  async function handleDeleteDonor() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteDonor(deleteTarget.id);
    setDeleting(false);
    if (res.success) {
      toast.success(t('donors.donorDeleted'));
      setDeleteTarget(null);
      if (selectedDonor?.id === deleteTarget.id) { setSelectedDonor(null); setGrants([]); }
      loadDonors();
    } else toast.error(res.error);
  }

  const filtered = donors.filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('donors.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('donors.subtitle')}</p>
        </div>
        <Button onClick={() => setShowDonorForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />{t('donors.addDonor')}
        </Button>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        {/* Donor list */}
        <div className="md:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={t('donors.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />{t('common.loading')}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                  <HandCoins className="w-8 h-8 opacity-30" />
                  <p className="text-sm">{t('donors.noDonors')}</p>
                </div>
              ) : filtered.map((d) => (
                <div
                  key={d.id}
                  onClick={() => selectDonor(d)}
                  className={`flex items-center gap-3 p-3 border-b last:border-0 cursor-pointer transition-colors ${
                    selectedDonor?.id === d.id ? 'bg-teal-50 border-l-2 border-l-teal-600' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
                    {d.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{t(`donors.types.${d.type}`)} · {d.country ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-bold">{fmt(d.totalGranted ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{d.grantCount} {t('donors.grants')}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Grant panel */}
        <div className="md:col-span-3">
          {!selectedDonor ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2 border rounded-lg">
              <ChevronRight className="w-8 h-8 opacity-30" />
              <p className="text-sm">{t('donors.selectDonor')}</p>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{selectedDonor.name} — {t('donors.grants')}</CardTitle>
                  <Button size="sm" className="gap-1" onClick={() => setShowGrantForm(true)}>
                    <Plus className="w-3.5 h-3.5" />{t('donors.addGrant')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {grants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t('donors.noGrants')}</p>
                ) : grants.map((g) => (
                  <GrantCard key={g.id} grant={g} onRefresh={() => loadGrants(selectedDonor.id)} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <DonorDialog open={showDonorForm} onClose={() => setShowDonorForm(false)} onCreated={loadDonors} />
      {selectedDonor && (
        <GrantDialog
          open={showGrantForm}
          onClose={() => setShowGrantForm(false)}
          onCreated={() => loadGrants(selectedDonor.id)}
          donorId={selectedDonor.id}
          branches={branches}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('donors.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('donors.deleteDesc', { name: deleteTarget?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDonor} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
