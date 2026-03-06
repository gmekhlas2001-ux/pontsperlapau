import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  exportTableAsCSV,
  getActivityLogs,
  getSystemStats,
  saveOrgSettings,
  type ActivityLog,
  type OrgSettings,
} from '@/services/settingsService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Activity,
  Database,
  BookCopy,
  Users,
  GraduationCap,
  School,
  Library,
  RefreshCw,
  Save,
  FileText,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const EXPORT_TABLES = [
  { id: 'users', label: 'Users', icon: Users, description: 'All user accounts and roles' },
  { id: 'staff', label: 'Staff', icon: School, description: 'Staff records and employment details' },
  { id: 'students', label: 'Students', icon: GraduationCap, description: 'Student enrollment data' },
  { id: 'classes', label: 'Classes', icon: BookCopy, description: 'Class schedules and information' },
  { id: 'books', label: 'Books', icon: Library, description: 'Library catalog' },
] as const;

const ACTION_TYPE_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  LOGIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  LOGOUT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

interface Props {
  settings: OrgSettings;
  onSettingsChange: (updated: Partial<OrgSettings>) => void;
}

export function SystemSettings({ settings, onSettingsChange }: Props) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [savingLibrary, setSavingLibrary] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const res = await getSystemStats();
    if (res.success) setStats(res.data ?? null);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const res = await getActivityLogs(50);
    setLogsLoading(false);
    if (res.success) {
      setLogs(res.data ?? []);
    } else {
      toast.error('Failed to load activity logs');
    }
  };

  const handleExport = async (tableId: typeof EXPORT_TABLES[number]['id']) => {
    setExporting(tableId);
    const res = await exportTableAsCSV(tableId);
    setExporting(null);

    if (!res.success) {
      toast.error(res.error || 'Failed to export data');
      return;
    }

    if (!res.csv) {
      toast.info('No data to export for ' + tableId);
      return;
    }

    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableId}_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${tableId} data exported successfully`);
  };

  const handleSaveLibrary = async () => {
    setSavingLibrary(true);
    const res = await saveOrgSettings({
      library_lending_period_days: settings.library_lending_period_days,
      max_book_renewal_count: settings.max_book_renewal_count,
      max_books_per_user: settings.max_books_per_user,
      overdue_fine_per_day: settings.overdue_fine_per_day,
    });
    setSavingLibrary(false);
    if (res.success) {
      toast.success('Library settings saved');
    } else {
      toast.error(res.error || 'Failed to save');
    }
  };

  return (
    <div className="space-y-6">
      {/* Database Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Database Overview</CardTitle>
                  <CardDescription>Current record counts across the system</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={loadStats}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {EXPORT_TABLES.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.id} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/50 border">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-2xl font-bold tabular-nums">{stats[t.id] ?? 0}</span>
                    <span className="text-xs text-muted-foreground">{t.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Library Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Library Configuration</CardTitle>
              <CardDescription>Rules governing how books are borrowed and returned</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lendingPeriod">Lending Period (days)</Label>
              <Input
                id="lendingPeriod"
                type="number"
                min="1"
                value={settings.library_lending_period_days}
                onChange={(e) => onSettingsChange({ library_lending_period_days: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxBooksPerUser">Max Books Per User</Label>
              <Input
                id="maxBooksPerUser"
                type="number"
                min="1"
                value={settings.max_books_per_user}
                onChange={(e) => onSettingsChange({ max_books_per_user: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxRenewals">Max Renewals</Label>
              <Input
                id="maxRenewals"
                type="number"
                min="0"
                value={settings.max_book_renewal_count}
                onChange={(e) => onSettingsChange({ max_book_renewal_count: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="overdueFine">Overdue Fine Per Day ($)</Label>
              <Input
                id="overdueFine"
                type="number"
                min="0"
                step="0.10"
                value={settings.overdue_fine_per_day}
                onChange={(e) => onSettingsChange({ overdue_fine_per_day: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveLibrary} disabled={savingLibrary}>
              <Save className="mr-2 h-4 w-4" />
              {savingLibrary ? 'Saving...' : 'Save Library Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Export Data</CardTitle>
              <CardDescription>Download your data as CSV files for backup or analysis</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {EXPORT_TABLES.map((table, i) => {
            const Icon = table.icon;
            const isExporting = exporting === table.id;
            return (
              <div key={table.id}>
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{table.label}</p>
                      <p className="text-xs text-muted-foreground">{table.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport(table.id)}
                    disabled={!!exporting}
                  >
                    {isExporting ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                  </Button>
                </div>
                {i < EXPORT_TABLES.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Activity Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Activity Logs</CardTitle>
                <CardDescription>Recent system events and user actions</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {logs.length === 0 ? 'Load Logs' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Click "Load Logs" to view recent activity</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span
                    className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                      ACTION_TYPE_COLORS[log.actionType] ?? 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {log.actionType}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {log.description || `${log.actionType} on ${log.tableName || 'system'}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {log.userFirstName && (
                        <span className="text-xs text-muted-foreground">
                          {log.userFirstName} {log.userLastName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
