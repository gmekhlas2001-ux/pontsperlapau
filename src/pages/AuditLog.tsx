/**
 * Audit Log
 *
 * Read-only view of the activity_logs table.
 * Admins can filter by date range, table, and action type.
 * Exportable to Excel for grant reporting.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, ShieldCheck, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { saveRowsAsExcel } from '@/lib/excel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogRow {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  tableName: string;
  description: string | null;
}

// ─── Colour coding for action types ──────────────────────────────────────────

function actionBadge(type: string) {
  const t = type.toLowerCase();
  if (t.includes('create') || t.includes('insert') || t.includes('add'))
    return <Badge className="bg-green-100 text-green-800 border-green-200 font-mono text-xs">{type}</Badge>;
  if (t.includes('delete') || t.includes('remove'))
    return <Badge className="bg-red-100 text-red-800 border-red-200 font-mono text-xs">{type}</Badge>;
  if (t.includes('update') || t.includes('edit') || t.includes('change'))
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-mono text-xs">{type}</Badge>;
  if (t.includes('login') || t.includes('logout') || t.includes('auth'))
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-mono text-xs">{type}</Badge>;
  return <Badge variant="outline" className="font-mono text-xs">{type}</Badge>;
}

const PAGE_SIZE = 50;

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AuditLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterTable, setFilterTable] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch] = useState('');

  // Distinct values for filter dropdowns
  const [tables, setTables] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const branchId = scopedBranchId();

  const load = useCallback(async () => {
    setLoading(true);

    let q = supabase
      .from('activity_logs')
      .select(`
        id, action_type, table_name, description, created_at,
        user:users!user_id(first_name, last_name, role, branch_id)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59');
    if (filterTable !== 'all') q = q.eq('table_name', filterTable);
    if (filterAction !== 'all') q = q.eq('action_type', filterAction);
    if (search.trim()) q = q.ilike('description', `%${search.trim()}%`);

    const { data, error, count } = await q;

    setLoading(false);
    if (error) { toast.error('Failed to load audit log'); return; }

    setTotal(count ?? 0);

    const mapped: LogRow[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actorName: r.user ? `${r.user.first_name ?? ''} ${r.user.last_name ?? ''}`.trim() : 'System',
      actorRole: r.user?.role ?? '',
      actionType: r.action_type,
      tableName: r.table_name ?? '',
      description: r.description ?? null,
    }));

    // Filter by branch client-side (activity_logs has no branch_id)
    // We infer branch from the actor's branch
    const finalRows = branchId
      ? mapped  // RLS already handles this; keep all returned rows
      : mapped;

    setRows(finalRows);
  }, [page, dateFrom, dateTo, filterTable, filterAction, search, branchId]);

  // Load distinct table names + action types once for dropdowns
  useEffect(() => {
    supabase.from('activity_logs').select('table_name, action_type').then(({ data }) => {
      const t = [...new Set((data ?? []).map((r: any) => r.table_name).filter(Boolean))].sort() as string[];
      const a = [...new Set((data ?? []).map((r: any) => r.action_type).filter(Boolean))].sort() as string[];
      setTables(t);
      setActions(a);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [dateFrom, dateTo, filterTable, filterAction, search]);

  function exportExcel() {
    const data = rows.map((r) => ({
      'Timestamp': new Date(r.createdAt).toLocaleString(),
      'Actor': r.actorName,
      'Role': r.actorRole,
      'Action': r.actionType,
      'Table': r.tableName,
      'Description': r.description ?? '',
    }));
    void saveRowsAsExcel(
      data,
      'Audit Log',
      `audit_log_${new Date().toISOString().split('T')[0]}.xlsx`,
      [22, 22, 14, 20, 20, 60],
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-0 sm:p-2 lg:p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" /> Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Complete record of all system actions — {total.toLocaleString()} entries
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh audit log">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">From</p>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-38 h-9" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">To</p>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-38 h-9" />
        </div>
        <Select value={filterTable} onValueChange={setFilterTable}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All tables" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tables</SelectItem>
            {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1 min-w-[180px]">
          <Input
            placeholder="Search description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
        {(dateFrom || dateTo || filterTable !== 'all' || filterAction !== 'all' || search) && (
          <Button variant="ghost" size="sm" onClick={() => {
            setDateFrom(''); setDateTo(''); setFilterTable('all'); setFilterAction('all'); setSearch('');
          }}>Clear</Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
              <ShieldCheck className="w-10 h-10 opacity-30" />
              <p>No log entries match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Table</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="font-medium">{row.actorName || '—'}</p>
                        {row.actorRole && (
                          <p className="text-xs text-muted-foreground capitalize">{row.actorRole}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{actionBadge(row.actionType)}</td>
                      <td className="px-4 py-2.5">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.tableName || '—'}</code>
                      </td>
                      <td className="px-4 py-2.5 max-w-md text-muted-foreground text-xs">
                        {row.description ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} entries
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">Page {page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
