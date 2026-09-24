import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ModuleAction, UserRole } from '@/contexts/AuthContext';
import { moduleNavItems } from '@/modules/registry';

const ACTIONS: ModuleAction[] = ['view', 'create', 'edit', 'delete', 'export'];
const ROLES: UserRole[] = ['admin', 'teacher', 'librarian', 'student', 'parent'];
type Module = {
  id: string; label: string; enabled: boolean;
  default_view_roles: string[]; default_write_roles: string[]; default_export_roles: string[];
};
type Account = {
  id: string; email: string; first_name: string; last_name: string;
  role: UserRole; branch_id: string | null;
};
type Branch = { id: string; name: string };
type Rule = {
  id: string; module_id: string; action: ModuleAction; user_id: string | null;
  role: string | null; branch_id: string | null; allowed: boolean;
};
type Event = {
  id: number; module_id: string; action: string; user_id: string | null;
  role: string | null; branch_id: string | null; actor_id: string | null; previous_allowed: boolean | null;
  new_allowed: boolean | null; changed_at: string;
};
type Catalog = { modules: Module[]; users: Account[]; userCount: number; branches: Branch[] };

export function ModuleAccessManager() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [history, setHistory] = useState<Event[]>([]);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<'user' | 'role'>('user');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(false);

  const loadCatalog = useCallback(async () => {
    const result = await callEdgeFunction<Catalog>('module-access', { operation: 'catalog', page, search });
    if (!result.ok || !result.data) { setError(true); return; }
    setCatalog(result.data);
    setError(false);
  }, [page, search]);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const target = catalog?.users.find((entry) => entry.id === userId);
  const targetRole = mode === 'user' ? target?.role : role;
  useEffect(() => {
    let cancelled = false;
    setRules([]);
    if (mode === 'user' && !userId) return;
    void callEdgeFunction<{ rules: Rule[] }>('module-access', {
      operation: 'rules', ...(mode === 'user' ? { userId } : { role }),
    }).then((result) => {
      if (!cancelled) {
        if (result.ok) setRules(result.data?.rules ?? []);
        else setError(true);
      }
    });
    return () => { cancelled = true; };
  }, [mode, userId, role]);

  const loadHistory = useCallback(async () => {
    const result = await callEdgeFunction<{ history: Event[] }>('module-access', { operation: 'history' });
    if (result.ok) setHistory(result.data?.history ?? []);
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const save = async (moduleId: string, action: ModuleAction, decision: 'allow' | 'deny' | 'inherit') => {
    const key = `${moduleId}:${action}`;
    setBusy(key);
    const result = await callEdgeFunction('module-access', {
      operation: 'set', moduleId, action, decision,
      ...(mode === 'user' ? { userId } : { role }),
      branchId: branchId || null,
    });
    setBusy('');
    if (!result.ok) { toast.error(result.error ?? t('moduleAccess.saveError')); return; }
    toast.success(t('moduleAccess.saved'));
    const refreshed = await callEdgeFunction<{ rules: Rule[] }>('module-access', {
      operation: 'rules', ...(mode === 'user' ? { userId } : { role }),
    });
    if (refreshed.ok) setRules(refreshed.data?.rules ?? []);
    void loadHistory();
  };

  return <section className="space-y-5" aria-labelledby="module-access-title">
    <div>
      <h2 id="module-access-title" className="text-xl font-semibold">{t('moduleAccess.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('moduleAccess.description')}</p>
    </div>
    {error && <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
      {t('moduleAccess.loadError')} <Button variant="outline" size="sm" onClick={() => void loadCatalog()}>{t('common.retry')}</Button>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-sm">{t('moduleAccess.subject')}
        <select className="h-10 w-full rounded-md border bg-background px-3" value={mode} onChange={(event) => { setMode(event.target.value as 'user' | 'role'); setBranchId(''); }}>
          <option value="user">{t('moduleAccess.user')}</option><option value="role">{t('moduleAccess.role')}</option>
        </select>
      </label>
      {mode === 'user' ? <div className="space-y-1">
        <label htmlFor="module-user-search" className="text-sm">{t('moduleAccess.searchUsers')}</label>
        <Input id="module-user-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setUserId(''); }} />
        <select aria-label={t('moduleAccess.user')} className="h-10 w-full rounded-md border bg-background px-3" value={userId} onChange={(event) => { setUserId(event.target.value); setBranchId(''); }}>
          <option value="">{t('moduleAccess.chooseUser')}</option>
          {(catalog?.users ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.first_name} {entry.last_name} · {entry.email}</option>)}
        </select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); setUserId(''); }}>{t('moduleAccess.previous')}</Button>
          <span>{page + 1} / {Math.max(1, Math.ceil((catalog?.userCount ?? 0) / 100))}</span>
          <Button variant="outline" size="sm" disabled={!catalog || (page + 1) * 100 >= catalog.userCount} onClick={() => { setPage(page + 1); setUserId(''); }}>{t('moduleAccess.next')}</Button>
        </div>
      </div> : <label className="space-y-1 text-sm">{t('moduleAccess.role')}
        <select className="h-10 w-full rounded-md border bg-background px-3" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
          {ROLES.map((entry) => <option key={entry} value={entry}>{t(`roles.${entry}`)}</option>)}
        </select>
      </label>}
      <label className="space-y-1 text-sm">{t('moduleAccess.branch')}
        <select className="h-10 w-full rounded-md border bg-background px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">{t('moduleAccess.allBranches')}</option>
          {(catalog?.branches ?? []).filter((entry) => mode === 'role' || !target?.branch_id || entry.id === target.branch_id)
            .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
    </div>
    <p className="text-xs text-muted-foreground">{t('moduleAccess.ceilingNote')}</p>
    {targetRole && <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50"><tr><th className="p-3 text-start">{t('moduleAccess.module')}</th>
          {ACTIONS.map((action) => <th className="p-3 text-start" key={action}>{t(`moduleAccess.${action}`)}</th>)}</tr></thead>
        <tbody>{(catalog?.modules ?? []).map((module) => <tr key={module.id} className="border-t">
          <th scope="row" className="p-3 text-start font-medium">{t(moduleNavItems.find((item) => item.moduleId === module.id)?.labelKey ?? '', { defaultValue: module.label })}</th>
          {ACTIONS.map((action) => {
            const ceiling = action === 'view' ? module.default_view_roles
              : action === 'export' ? module.default_export_roles : module.default_write_roles;
            const supported = module.enabled && ceiling.includes(targetRole);
            const rule = rules.find((entry) => entry.module_id === module.id && entry.action === action && entry.branch_id === (branchId || null));
            return <td key={action} className="p-2">
              <select aria-label={`${module.label}: ${t(`moduleAccess.${action}`)}`} className="h-9 w-full min-w-24 rounded-md border bg-background px-2"
                value={rule ? (rule.allowed ? 'allow' : 'deny') : 'inherit'}
                disabled={!supported || busy === `${module.id}:${action}` || (mode === 'user' && !userId)}
                onChange={(event) => void save(module.id, action, event.target.value as 'allow' | 'deny' | 'inherit')}>
                <option value="inherit">{supported ? t('moduleAccess.inherit') : t('moduleAccess.unavailable')}</option>
                <option value="allow">{t('moduleAccess.allow')}</option>
                <option value="deny">{t('moduleAccess.deny')}</option>
              </select>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>}
    <div>
      <h3 className="text-lg font-semibold">{t('moduleAccess.recentChanges')}</h3>
      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
        {history.map((event) => <li key={event.id} className="rounded-md border p-2">
          <time dateTime={event.changed_at}>{new Date(event.changed_at).toLocaleString()}</time>
          {' · '}{event.module_id} / {event.action}: {String(event.previous_allowed ?? 'inherit')} → {String(event.new_allowed ?? 'inherit')}
          {' · '}{event.role ?? event.user_id}
          {event.branch_id && ` · ${event.branch_id}`}
          {event.actor_id && ` · ${event.actor_id}`}
        </li>)}
      </ul>
    </div>
  </section>;
}
