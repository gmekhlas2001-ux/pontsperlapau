import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { createTransaction } from '@/services/transactionService';
import { getBranches } from '@/services/branchService';
import type { Branch } from '@/services/branchService';
import type { CreateTransactionData, TransferMethod } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader as Loader2 } from 'lucide-react';

export const TRANSFER_METHOD_LABELS: Record<TransferMethod, string> = {
  moneygram: 'MoneyGram',
  western_union: 'Western Union',
  bank_transfer: 'Bank Transfer',
  hawala: 'Hawala',
  cash: 'Cash',
  paypal: 'PayPal',
  wise: 'Wise',
  other: 'Other',
};

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AFN', 'TRY', 'AED', 'SAR', 'PKR', 'IRR'];

interface StaffOption {
  id: string;
  name: string;
  branch_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentUserId?: string;
}

const EMPTY_FORM: CreateTransactionData = {
  sender_branch_id: '',
  receiver_branch_id: '',
  sender_staff_id: '',
  receiver_staff_id: '',
  amount: 0,
  currency: 'USD',
  transfer_method: 'moneygram',
  external_reference: '',
  notes: '',
};

export function NewTransactionDialog({ open, onClose, onCreated, currentUserId }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateTransactionData>(EMPTY_FORM);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getBranches().then((r) => { if (r.success && r.data) setBranches(r.data); });
    supabase
      .from('staff')
      .select('id, branch_id, user:users!user_id(first_name, last_name)')
      .is('deleted_at', null)
      .then(({ data }) => {
        if (data) {
          setStaffList(
            data.map((s: any) => ({
              id: s.id,
              branch_id: s.branch_id,
              name: `${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim(),
            }))
          );
        }
      });
  }, [open]);

  function senderStaff() {
    if (!form.sender_branch_id) return staffList;
    return staffList.filter((s) => s.branch_id === form.sender_branch_id);
  }

  function receiverStaff() {
    if (!form.receiver_branch_id) return staffList;
    return staffList.filter((s) => s.branch_id === form.receiver_branch_id);
  }

  function set<K extends keyof CreateTransactionData>(key: K, value: CreateTransactionData[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.sender_branch_id || !form.receiver_branch_id) {
      toast.error(t('transactions.selectBranches')); return;
    }
    if (!form.sender_staff_id || !form.receiver_staff_id) {
      toast.error(t('transactions.selectBothStaff')); return;
    }
    if (form.sender_branch_id === form.receiver_branch_id) {
      toast.error(t('transactions.sameBranch')); return;
    }
    if (!form.amount || form.amount <= 0) {
      toast.error(t('transactions.invalidAmount')); return;
    }

    setSaving(true);
    const res = await createTransaction(form, currentUserId);
    setSaving(false);

    if (res.success) {
      toast.success(t('transactions.createSuccess'));
      setForm(EMPTY_FORM);
      onCreated();
      onClose();
    } else {
      toast.error(res.error ?? t('transactions.createFailed'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{t('transactions.newTransaction')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('transactions.senderBranch')} <span className="text-destructive">*</span></Label>
              <Select value={form.sender_branch_id} onValueChange={(v) => { set('sender_branch_id', v); set('sender_staff_id', ''); }}>
                <SelectTrigger><SelectValue placeholder={t('transactions.selectBranch')} /></SelectTrigger>
                <SelectContent>
                  {branches.filter((b) => b.status === 'active').map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('transactions.receiverBranch')} <span className="text-destructive">*</span></Label>
              <Select value={form.receiver_branch_id} onValueChange={(v) => { set('receiver_branch_id', v); set('receiver_staff_id', ''); }}>
                <SelectTrigger><SelectValue placeholder={t('transactions.selectBranch')} /></SelectTrigger>
                <SelectContent>
                  {branches.filter((b) => b.status === 'active').map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('transactions.senderStaff')} <span className="text-destructive">*</span></Label>
              <Select value={form.sender_staff_id} onValueChange={(v) => set('sender_staff_id', v)}>
                <SelectTrigger><SelectValue placeholder={t('transactions.selectStaff')} /></SelectTrigger>
                <SelectContent>
                  {senderStaff().map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('transactions.receiverStaff')} <span className="text-destructive">*</span></Label>
              <Select value={form.receiver_staff_id} onValueChange={(v) => set('receiver_staff_id', v)}>
                <SelectTrigger><SelectValue placeholder={t('transactions.selectStaff')} /></SelectTrigger>
                <SelectContent>
                  {receiverStaff().map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-1">
              <Label>{t('common.amount')} <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.amount || ''}
                onChange={(e) => set('amount', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('common.currency')} <span className="text-destructive">*</span></Label>
              <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('common.method')} <span className="text-destructive">*</span></Label>
              <Select value={form.transfer_method} onValueChange={(v) => set('transfer_method', v as TransferMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(TRANSFER_METHOD_LABELS) as [TransferMethod, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('transactions.externalReference')}</Label>
            <Input
              placeholder={t('transactions.referencePlaceholder')}
              value={form.external_reference ?? ''}
              onChange={(e) => set('external_reference', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('common.notes')}</Label>
            <Textarea
              rows={3}
              placeholder={t('transactions.remarksPlaceholder')}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('transactions.createButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
