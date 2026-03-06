import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { updateTransactionStatus, deleteTransaction } from '@/services/transactionService';
import type { Transaction, TransactionStatus } from '@/types';
import { TRANSFER_METHOD_LABELS } from './NewTransactionDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2, XCircle, AlertTriangle, Trash2, Loader2,
  Building2, User, Calendar, CreditCard, Hash,
} from 'lucide-react';

const STATUS_CONFIG: Record<TransactionStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' },
  completed: { label: 'Completed', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
  cancelled: { label: 'Cancelled', color: 'text-slate-600 dark:text-slate-400',  bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700' },
  failed:    { label: 'Failed',    color: 'text-red-700 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800' },
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

interface Props {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function TransactionDetailDialog({ transaction, open, onClose, onUpdated }: Props) {
  const [updating, setUpdating] = useState<TransactionStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!transaction) return null;

  const status = STATUS_CONFIG[transaction.status];
  const isPending = transaction.status === 'pending';
  const senderName = transaction.sender_staff
    ? `${transaction.sender_staff.user?.first_name ?? ''} ${transaction.sender_staff.user?.last_name ?? ''}`.trim()
    : '—';
  const receiverName = transaction.receiver_staff
    ? `${transaction.receiver_staff.user?.first_name ?? ''} ${transaction.receiver_staff.user?.last_name ?? ''}`.trim()
    : '—';

  async function handleStatus(newStatus: 'completed' | 'cancelled' | 'failed') {
    setUpdating(newStatus);
    const res = await updateTransactionStatus(transaction!.id, newStatus);
    setUpdating(null);
    if (res.success) {
      toast.success(`Transaction marked as ${newStatus}`);
      onUpdated();
      onClose();
    } else {
      toast.error(res.error ?? 'Failed to update status');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteTransaction(transaction!.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (res.success) {
      toast.success('Transaction deleted');
      onUpdated();
      onClose();
    } else {
      toast.error(res.error ?? 'Failed to delete transaction');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono text-base">{transaction.reference_number}</span>
              <Badge className={`text-xs font-medium border ${status.bg} ${status.color}`} variant="outline">
                {status.label}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className={`rounded-lg border p-4 ${status.bg}`}>
              <div className="text-center">
                <p className="text-3xl font-bold tracking-tight">
                  {Number(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-lg ml-1.5 font-semibold opacity-70">{transaction.currency}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  via {TRANSFER_METHOD_LABELS[transaction.transfer_method] ?? transaction.transfer_method}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</p>
                <InfoRow icon={Building2} label="Branch" value={transaction.sender_branch?.name} />
                <InfoRow icon={User} label="Staff" value={senderName} />
              </div>

              <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</p>
                <InfoRow icon={Building2} label="Branch" value={transaction.receiver_branch?.name} />
                <InfoRow icon={User} label="Staff" value={receiverName} />
              </div>
            </div>

            <div className="space-y-3">
              <InfoRow icon={Hash} label="External Reference" value={transaction.external_reference} />
              <InfoRow icon={Calendar} label="Created" value={format(new Date(transaction.created_at), 'PPP p')} />
              {transaction.completed_at && (
                <InfoRow icon={CheckCircle2} label="Completed" value={format(new Date(transaction.completed_at), 'PPP p')} />
              )}
              {transaction.cancelled_at && (
                <InfoRow icon={XCircle} label="Cancelled" value={format(new Date(transaction.cancelled_at), 'PPP p')} />
              )}
              {transaction.notes && (
                <InfoRow icon={CreditCard} label="Notes" value={transaction.notes} />
              )}
            </div>

            {isPending && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Update Status</p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleStatus('completed')}
                      disabled={!!updating}
                    >
                      {updating === 'completed' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Complete
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleStatus('cancelled')}
                      disabled={!!updating}
                    >
                      {updating === 'cancelled' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                      onClick={() => handleStatus('failed')}
                      disabled={!!updating}
                    >
                      {updating === 'failed' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                      Failed
                    </Button>
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Transaction
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete transaction {transaction.reference_number}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
