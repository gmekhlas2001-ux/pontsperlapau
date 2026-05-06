import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

type TableId = 'users' | 'staff' | 'students' | 'classes' | 'books';

const EXPORT_TABLES: Array<{ id: TableId; labelKey: string; descriptionKey: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'users', labelKey: 'nav.staff', descriptionKey: 'settings.usersDataDescription', icon: Users },
  { id: 'staff', labelKey: 'staff.title', descriptionKey: 'settings.staffDataDescription', icon: School },
  { id: 'students', labelKey: 'students.title', descriptionKey: 'settings.studentsDataDescription', icon: GraduationCap },
  { id: 'classes', labelKey: 'classes.title', descriptionKey: 'settings.classesDataDescription', icon: BookCopy },
  { id: 'books', labelKey: 'library.management', descriptionKey: 'settings.booksDataDescription', icon: Library },
];

const ACTION_TYPE_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  LOGIN: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  LOGOUT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

interface Props {
  settings: OrgSettings;
  onSettingsChange: (updated: Partial<OrgSettings>) => void;
}

export function SystemSettings({ settings, onSettingsChange }: Props) {
  const { t } = useTranslation();
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
      toast.error(t('settings.activityLogsLoadFailed'));
    }
  };

  const handleExport = async (tableId: TableId, tableLabel: string) => {
    setExporting(tableId);
    const res = await exportTableAsCSV(tableId);
    setExporting(null);

    if (!res.success) {
      toast.error(res.error || t('common.error'));
      return;
    }

    if (!res.csv) {
      toast.info(`${tableLabel}: ${t('common.noData')}`);
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
    toast.success(`${tableLabel} ${t('settings.dataExportSuccess')}`);
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
      toast.success(t('settings.librarySettingsSaved'));
    } else {
      toast.error(res.error || t('common.error'));
    }
  };

  const STAT_LABELS: Record<string, string> = {
    users: t('nav.staff'),
    staff: t('staff.title'),
    students: t('students.title'),
    classes: t('classes.title'),
    books: t('library.management'),
  };

  return (
    <div className="space-y-6">
      {stats && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>{t('settings.databaseOverview')}</CardTitle>
                  <CardDescription>{t('settings.databaseOverviewDescription')}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={loadStats}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {EXPORT_TABLES.map((tbl) => {
                const Icon = tbl.icon;
                return (
                  <div key={tbl.id} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/50 border">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-2xl font-bold tabular-nums">{stats[tbl.id] ?? 0}</span>
                    <span className="text-xs text-muted-foreground text-center">{STAT_LABELS[tbl.id]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.libraryConfiguration')}</CardTitle>
              <CardDescription>{t('settings.libraryConfigurationDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lendingPeriod">{t('settings.lendingPeriod')}</Label>
              <Input
                id="lendingPeriod"
                type="number"
                min="1"
                value={settings.library_lending_period_days}
                onChange={(e) => onSettingsChange({ library_lending_period_days: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxBooksPerUser">{t('settings.maxBooksPerUser')}</Label>
              <Input
                id="maxBooksPerUser"
                type="number"
                min="1"
                value={settings.max_books_per_user}
                onChange={(e) => onSettingsChange({ max_books_per_user: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxRenewals">{t('settings.maxRenewals')}</Label>
              <Input
                id="maxRenewals"
                type="number"
                min="0"
                value={settings.max_book_renewal_count}
                onChange={(e) => onSettingsChange({ max_book_renewal_count: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="overdueFine">{t('settings.overdueFinePerDay')}</Label>
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
              {savingLibrary ? t('settings.saving') : t('settings.saveLibrarySettings')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.exportData')}</CardTitle>
              <CardDescription>{t('settings.exportDataDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {EXPORT_TABLES.map((table, i) => {
            const Icon = table.icon;
            const isExporting = exporting === table.id;
            const label = STAT_LABELS[table.id];
            return (
              <div key={table.id}>
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{t(table.descriptionKey)}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport(table.id, label)}
                    disabled={!!exporting}
                  >
                    {isExporting ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isExporting ? t('settings.exporting') : t('settings.exportCsv')}
                  </Button>
                </div>
                {i < EXPORT_TABLES.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>{t('settings.activityLogs')}</CardTitle>
                <CardDescription>{t('settings.activityLogsDescription')}</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {logs.length === 0 ? t('settings.loadLogs') : t('settings.refresh')}
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
              <p className="text-sm text-muted-foreground">{t('settings.loadLogsPrompt')}</p>
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
