import { useState } from 'react';
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
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'channels' | 'events';
}

const NOTIF_ITEMS: NotifItem[] = [
  {
    key: 'enable_email_notifications',
    label: 'Email Notifications',
    description: 'Receive system alerts and reports by email',
    icon: Mail,
    category: 'channels',
  },
  {
    key: 'notifications_push',
    label: 'Push Notifications',
    description: 'In-app notifications and browser alerts',
    icon: Smartphone,
    category: 'channels',
  },
  {
    key: 'notifications_enrollment',
    label: 'Student Enrollment',
    description: 'Alert when a new student is enrolled',
    icon: UserPlus,
    category: 'events',
  },
  {
    key: 'notifications_book_due',
    label: 'Book Due Dates',
    description: 'Reminder 2 days before a book is due',
    icon: BookOpen,
    category: 'events',
  },
  {
    key: 'notifications_overdue',
    label: 'Overdue Books',
    description: 'Alert when a borrowed book becomes overdue',
    icon: AlertTriangle,
    category: 'events',
  },
  {
    key: 'notifications_low_attendance',
    label: 'Low Attendance',
    description: 'Alert when a student falls below the attendance threshold',
    icon: TrendingDown,
    category: 'events',
  },
];

interface Props {
  settings: OrgSettings;
  onSettingsChange: (updated: Partial<OrgSettings>) => void;
}

export function NotificationSettings({ settings, onSettingsChange }: Props) {
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
      toast.success('Notification preferences saved');
    } else {
      toast.error(res.error || 'Failed to save');
    }
  };

  return (
    <div className="space-y-6">
      {/* Channels */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Delivery Channels</CardTitle>
              <CardDescription>Choose how you receive notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {channels.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={item.key}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled(item.key)}
                    onCheckedChange={() => toggle(item.key)}
                  />
                </div>
                {i < channels.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Event triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Event Triggers</CardTitle>
          <CardDescription>Choose which events generate notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {events.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={item.key}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled(item.key)}
                    onCheckedChange={() => toggle(item.key)}
                  />
                </div>
                {i < events.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Thresholds</CardTitle>
          <CardDescription>Configure when alerts are triggered</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="attendanceThreshold">
              Low Attendance Threshold (%)
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
                Notify when a student's attendance drops below this percentage
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Notifications'}
        </Button>
      </div>
    </div>
  );
}
