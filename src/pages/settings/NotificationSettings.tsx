import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { saveOrgSettings, type OrgSettings } from '@/services/settingsService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Mail, Smartphone, UserPlus, BookOpen, TriangleAlert as AlertTriangle, TrendingDown, Bell } from 'lucide-react';

interface NotifItem {
  key: keyof OrgSettings;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'channels' | 'events';
}

const NOTIF_ITEMS: NotifItem[] = [
  {
    key: 'enable_email_notifications',
    labelKey: 'settings.emailNotifications',
    descriptionKey: 'settings.emailNotificationsDescription',
    icon: Mail,
    category: 'channels',
  },
  {
    key: 'notifications_push',
    labelKey: 'settings.pushNotifications',
    descriptionKey: 'settings.pushNotificationsDescription',
    icon: Smartphone,
    category: 'channels',
  },
  {
    key: 'notifications_enrollment',
    labelKey: 'settings.studentEnrollmentAlert',
    descriptionKey: 'settings.studentEnrollmentAlertDescription',
    icon: UserPlus,
    category: 'events',
  },
  {
    key: 'notifications_book_due',
    labelKey: 'settings.bookDueDates',
    descriptionKey: 'settings.bookDueDatesDescription',
    icon: BookOpen,
    category: 'events',
  },
  {
    key: 'notifications_overdue',
    labelKey: 'settings.overdueBooksAlert',
    descriptionKey: 'settings.overdueBooksAlertDescription',
    icon: AlertTriangle,
    category: 'events',
  },
  {
    key: 'notifications_low_attendance',
    labelKey: 'settings.lowAttendanceAlert',
    descriptionKey: 'settings.lowAttendanceAlertDescription',
    icon: TrendingDown,
    category: 'events',
  },
];

interface Props {
  settings: OrgSettings;
  onSettingsChange: (updated: Partial<OrgSettings>) => void;
}

export function NotificationSettings({ settings, onSettingsChange }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const channels = NOTIF_ITEMS.filter((i) => i.category === 'channels');
  const events = NOTIF_ITEMS.filter((i) => i.category === 'events');

  const isEnabled = (key: keyof OrgSettings) => settings[key] === 'true';

  const toggle = (key: keyof OrgSettings) => {
    onSettingsChange({ [key]: isEnabled(key) ? 'false' : 'true' });
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await saveOrgSettings({
      enable_email_notifications: settings.enable_email_notifications,
      notifications_push: settings.notifications_push,
      notifications_enrollment: settings.notifications_enrollment,
      notifications_book_due: settings.notifications_book_due,
      notifications_overdue: settings.notifications_overdue,
      notifications_low_attendance: settings.notifications_low_attendance,
      attendance_low_threshold: settings.attendance_low_threshold,
    });
    setSaving(false);
    if (res.success) {
      toast.success(t('settings.notificationsSaved'));
    } else {
      toast.error(res.error || t('common.error'));
    }
  };

  const renderItems = (items: NotifItem[]) =>
    items.map((item, i) => {
      const Icon = item.icon;
      return (
        <div key={item.key}>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">{t(item.labelKey)}</p>
                <p className="text-xs text-muted-foreground">{t(item.descriptionKey)}</p>
              </div>
            </div>
            <Switch
              checked={isEnabled(item.key)}
              onCheckedChange={() => toggle(item.key)}
            />
          </div>
          {i < items.length - 1 && <Separator />}
        </div>
      );
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.deliveryChannels')}</CardTitle>
              <CardDescription>{t('settings.deliveryChannelsDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {renderItems(channels)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.eventTriggers')}</CardTitle>
          <CardDescription>{t('settings.eventTriggersDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {renderItems(events)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.alertThresholds')}</CardTitle>
          <CardDescription>{t('settings.alertThresholdsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="attendanceThreshold">
              {t('settings.lowAttendanceThreshold')}
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="attendanceThreshold"
                type="number"
                min="0"
                max="100"
                value={settings.attendance_low_threshold}
                onChange={(e) => onSettingsChange({ attendance_low_threshold: e.target.value })}
                className="w-32"
              />
              <p className="text-sm text-muted-foreground">
                {t('settings.attendanceThresholdHelp')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? t('settings.saving') : t('settings.notifications')}
        </Button>
      </div>
    </div>
  );
}
