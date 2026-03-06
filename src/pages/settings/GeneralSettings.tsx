import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { languages, type LanguageCode } from '@/i18n';
import { toast } from 'sonner';
import { saveOrgSettings, type OrgSettings } from '@/services/settingsService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, Building2, Globe, Palette, Moon, Sun, Monitor } from 'lucide-react';

const TIMEZONES = [
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tehran',
  'Asia/Dubai',
  'Asia/Kabul',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Pacific/Auckland',
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2024)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2024)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-31)' },
  { value: 'D MMMM YYYY', label: 'D MMMM YYYY (31 December 2024)' },
];

interface Props {
  settings: OrgSettings;
  onSettingsChange: (updated: Partial<OrgSettings>) => void;
}

export function GeneralSettings({ settings, onSettingsChange }: Props) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);

  const currentLanguage = languages.find((l) => l.code === i18n.language) || languages[0];

  const handleLanguageChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    document.documentElement.dir = languages.find((l) => l.code === code)?.dir || 'ltr';
  };

  const handleSaveOrg = async () => {
    setSaving(true);
    const res = await saveOrgSettings({
      org_name: settings.org_name,
      org_email: settings.org_email,
      org_phone: settings.org_phone,
      timezone: settings.timezone,
      date_format: settings.date_format,
      academic_year: settings.academic_year,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Organization settings saved');
    } else {
      toast.error(res.error || 'Failed to save settings');
    }
  };

  const themeOptions = [
    { value: 'light', label: t('settings.light'), icon: Sun },
    { value: 'dark', label: t('settings.dark'), icon: Moon },
    { value: 'auto', label: t('settings.auto'), icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      {/* Organization */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.organization')}</CardTitle>
              <CardDescription>Your organization's public profile and configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">{t('settings.organizationName')}</Label>
              <Input
                id="orgName"
                value={settings.org_name}
                onChange={(e) => onSettingsChange({ org_name: e.target.value })}
                placeholder="e.g. Ponts per la Pau"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgEmail">Contact Email</Label>
              <Input
                id="orgEmail"
                type="email"
                value={settings.org_email}
                onChange={(e) => onSettingsChange({ org_email: e.target.value })}
                placeholder="contact@organization.org"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgPhone">Contact Phone</Label>
              <Input
                id="orgPhone"
                value={settings.org_phone}
                onChange={(e) => onSettingsChange({ org_phone: e.target.value })}
                placeholder="+1 234 567 8900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="academicYear">Academic Year</Label>
              <Input
                id="academicYear"
                value={settings.academic_year}
                onChange={(e) => onSettingsChange({ academic_year: e.target.value })}
                placeholder="e.g. 2024-2025"
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('settings.timezone')}</Label>
              <Select
                value={settings.timezone}
                onValueChange={(v) => onSettingsChange({ timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings.dateFormat')}</Label>
              <Select
                value={settings.date_format}
                onValueChange={(v) => onSettingsChange({ date_format: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveOrg} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Organization'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.language')}</CardTitle>
              <CardDescription>Interface language — changes apply immediately</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code as LanguageCode)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                  currentLanguage.code === lang.code
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.theme')}</CardTitle>
              <CardDescription>Choose how the interface looks</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value as 'light' | 'dark' | 'auto')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    theme === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-muted/30'
                  }`}
                >
                  <Icon className={`h-6 w-6 ${theme === opt.value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${theme === opt.value ? 'text-primary' : 'text-muted-foreground'}`}>
                    {opt.label}
                  </span>
                  {theme === opt.value && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
