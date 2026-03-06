import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { getTransactions, getTransactionStats } from '@/services/transactionService';
import { getBranches } from '@/services/branchService';
import type { Branch } from '@/services/branchService';
import type { Transaction, TransactionStats, TransactionStatus, TransferMethod } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { NewTransactionDialog, TRANSFER_METHOD_LABELS } from './reports/NewTransactionDialog';
import { TransactionDetailDialog } from './reports/TransactionDetailDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Search, ArrowRight, Clock, CircleCheck as CheckCircle2, DollarSign, ListFilter as Filter, RefreshCw, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<TransactionStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-600' },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-700' },
};

function StatCard({
  icon: Icon, label, value, sub, iconClass,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; iconClass?: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn('p-2.5 rounded-lg', iconClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffName(staff?: Transaction['sender_staff']) {
  if (!staff) return '—';
  const n = `${staff.user?.first_name ?? ''} ${staff.user?.last_name ?? ''}`.trim();
  return n || '—';
}

export function Reports() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [txRes, statsRes, branchRes] = await Promise.all([
      getTransactions({
        status: filterStatus !== 'all' ? filterStatus : undefined,
        transfer_method: filterMethod !== 'all' ? filterMethod : undefined,
        sender_branch_id: filterBranch !== 'all' ? filterBranch : undefined,
      }),
      getTransactionStats(),
      getBranches(),
    ]);
    if (txRes.success && txRes.data) setTransactions(txRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (branchRes.success && branchRes.data) setBranches(branchRes.data);
    setLoading(false);
  }, [filterStatus, filterMethod, filterBranch]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = transactions.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.reference_number?.toLowerCase().includes(q) ||
      t.external_reference?.toLowerCase().includes(q) ||
      t.sender_branch?.name?.toLowerCase().includes(q) ||
      t.receiver_branch?.name?.toLowerCase().includes(q) ||
      StaffName(t.sender_staff).toLowerCase().includes(q) ||
      StaffName(t.receiver_staff).toLowerCase().includes(q)
    );
  });

  const totalAmountFormatted = stats
    ? stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
  const completedAmountFormatted = stats
    ? stats.totalAmountCompleted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Inter-branch transaction management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Transaction
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border shadow-sm">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <StatCard
                icon={ReceiptText}
                label="Total Transactions"
                value={stats?.total ?? 0}
                sub={`${stats?.pending ?? 0} pending`}
                iconClass="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
              />
              <StatCard
                icon={CheckCircle2}
                label="Completed"
                value={stats?.completed ?? 0}
                sub={`${completedAmountFormatted} transferred`}
                iconClass="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={Clock}
                label="Pending"
                value={stats?.pending ?? 0}
                sub={`${stats?.failed ?? 0} failed`}
                iconClass="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
              />
              <StatCard
                icon={DollarSign}
                label="Total Volume"
                value={totalAmountFormatted}
                sub="All-time combined"
                iconClass="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              />
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by reference, branch, staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {(Object.entries(TRANSFER_METHOD_LABELS) as [TransferMethod, string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="border shadow-sm">
          <div className="rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold">Reference</TableHead>
                  <TableHead className="font-semibold">Route</TableHead>
                  <TableHead className="font-semibold">Staff</TableHead>
                  <TableHead className="font-semibold">Amount</TableHead>
                  <TableHead className="font-semibold">Method</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                      <ReceiptText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No transactions found</p>
                      <p className="text-sm mt-1">
                        {search || filterStatus !== 'all' || filterMethod !== 'all' || filterBranch !== 'all'
                          ? 'Try adjusting your filters'
                          : 'Create your first transaction to get started'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((tx) => {
                    const sc = STATUS_CONFIG[tx.status];
                    return (
                      <TableRow
                        key={tx.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setDetailTx(tx)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-mono text-sm font-semibold">{tx.reference_number}</p>
                            {tx.external_reference && (
                              <p className="text-xs text-muted-foreground">{tx.external_reference}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="font-medium truncate max-w-[90px]">{tx.sender_branch?.name ?? '—'}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate max-w-[90px]">{tx.receiver_branch?.name ?? '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-muted-foreground truncate max-w-[80px]">{StaffName(tx.sender_staff)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground truncate max-w-[80px]">{StaffName(tx.receiver_staff)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold tabular-nums">
                            {Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{tx.currency}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{TRANSFER_METHOD_LABELS[tx.transfer_method] ?? tx.transfer_method}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs font-medium border', sc.className)}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(tx.created_at), 'MMM d, yyyy')}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 0 && !loading && (
            <div className="px-4 py-3 border-t text-sm text-muted-foreground">
              Showing {filtered.length} of {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </div>
          )}
        </Card>
      </div>

      <NewTransactionDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onCreated={loadData}
        currentUserId={user?.id}
      />

      <TransactionDetailDialog
        transaction={detailTx}
        open={!!detailTx}
        onClose={() => setDetailTx(null)}
        onUpdated={loadData}
      />
    </div>
  );
}
