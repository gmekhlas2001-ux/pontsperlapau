import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgSettings, type OrgSettings } from '@/services/settingsService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { GeneralSettings } from './settings/GeneralSettings';
import { NotificationSettings } from './settings/NotificationSettings';
import { SecuritySettings } from './settings/SecuritySettings';
import { SystemSettings } from './settings/SystemSettings';
import { Globe, Bell, Shield, Database, Settings2 } from 'lucide-react';

const ROLE_BADGE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  librarian: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  student: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const DEFAULT_SETTINGS: OrgSettings = {
  org_name: 'My Organization',
  org_email: '',
  org_phone: '',
  timezone: 'Europe/Madrid',
  date_format: 'DD/MM/YYYY',
  academic_year: '',
  attendance_low_threshold: '80',
  library_lending_period_days: '14',
  max_book_renewal_count: '2',
  max_books_per_user: '3',
  overdue_fine_per_day: '0.50',
  enable_email_notifications: 'true',
  notifications_push: 'true',
  notifications_enrollment: 'true',
  notifications_book_due: 'true',
  notifications_overdue: 'true',
  notifications_low_attendance: 'true',
  session_timeout_minutes: '60',
};

export function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const res = await getOrgSettings();
    setLoading(false);
    if (res.success && res.data) {
      setSettings(res.data);
    }
  };

  const handleSettingsChange = (updated: Partial<OrgSettings>) => {
    setSettings((prev) => ({ ...prev, ...updated }));
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '??';

  const TABS = [
    { value: 'general', label: t('settings.general'), icon: Globe },
    { value: 'notifications', label: t('settings.notifications'), icon: Bell },
    { value: 'security', label: t('settings.privacy'), icon: Shield },
    { value: 'system', label: t('settings.backup'), icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Settings2 className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
          <p className="text-muted-foreground">Manage your organization and account preferences</p>
        </div>
      </div>

      {/* Current User Profile Strip */}
      {user && (
        <div className="flex items-center gap-4 p-4 rounded-xl border bg-muted/30">
          <Avatar className="h-12 w-12">
            {user.avatar ? (
              <img src={user.avatar} alt={user.firstName} />
            ) : (
              <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
              ROLE_BADGE_COLORS[user.role] ?? 'bg-muted text-muted-foreground'
            }`}
          >
            {user.role}
          </span>
        </div>
      )}

      {/* Tabs */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-lg" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="mt-6">
            <TabsContent value="general">
              <GeneralSettings settings={settings} onSettingsChange={handleSettingsChange} />
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationSettings settings={settings} onSettingsChange={handleSettingsChange} />
            </TabsContent>

            <TabsContent value="security">
              <SecuritySettings settings={settings} onSettingsChange={handleSettingsChange} />
            </TabsContent>

            <TabsContent value="system">
              <SystemSettings settings={settings} onSettingsChange={handleSettingsChange} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
