import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  changePassword,
  toggle2FA,
  getUser2FAStatus,
  getRolesWithPermissions,
  saveOrgSettings,
  type RoleWithPermissions,
  type OrgSettings,
} from '@/services/settingsService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { KeyRound, Shield, Lock, Eye, EyeOff, ChevronDown, Users, CircleCheck as CheckCircle, Clock, Save } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  librarian: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  student: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const ACTION_COLORS: Record<string, string> = {
  manage: 'bg-primary/10 text-primary',
  view: 'bg-muted text-muted-foreground',
};

interface Props {
  settings: OrgSettings;
  onSettingsChange: (updated: Partial<OrgSettings>) => void;
}

export function SecuritySettings({ settings, onSettingsChange }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [twoFA, setTwoFA] = useState(false);
  const [togglingTwoFA, setTogglingTwoFA] = useState(false);

  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [openRoles, setOpenRoles] = useState<Record<string, boolean>>({});

  const [savingTimeout, setSavingTimeout] = useState(false);

  useEffect(() => {
    if (user?.id) {
      getUser2FAStatus(user.id).then((res) => {
        if (res.success) setTwoFA(res.enabled ?? false);
      });
    }
    getRolesWithPermissions().then((res) => {
      if (res.success) setRoles(res.data ?? []);
    });
  }, [user?.id]);

  const handleChangePassword = async () => {
    if (!newPassword || !currentPassword) {
      toast.error(t('settings.fillPasswordFields'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('settings.passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.passwordsDoNotMatch'));
      return;
    }

    setChangingPassword(true);
    const res = await changePassword(user!.id, user!.email, currentPassword, newPassword);
    setChangingPassword(false);

    if (res.success) {
      toast.success(t('settings.passwordChangeSuccess'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast.error(res.error || t('settings.passwordChangeFailed'));
    }
  };

  const handleToggle2FA = async (enabled: boolean) => {
    setTogglingTwoFA(true);
    const res = await toggle2FA(user!.id, enabled);
    setTogglingTwoFA(false);

    if (res.success) {
      setTwoFA(enabled);
      toast.success(enabled ? t('settings.twoFAEnabled') : t('settings.twoFADisabled'));
    } else {
      toast.error(res.error || t('common.error'));
    }
  };

  const handleSaveTimeout = async () => {
    setSavingTimeout(true);
    const res = await saveOrgSettings({ session_timeout_minutes: settings.session_timeout_minutes });
    setSavingTimeout(false);
    if (res.success) {
      toast.success(t('settings.sessionTimeoutSaved'));
    } else {
      toast.error(res.error || t('common.error'));
    }
  };

  const toggleRole = (roleId: string) => {
    setOpenRoles((prev) => ({ ...prev, [roleId]: !prev[roleId] }));
  };

  const passwordStrength = (pwd: string) => {
    if (!pwd) return null;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { labelKey: 'settings.passwordWeak', color: 'bg-red-500', width: '25%' };
    if (score === 2) return { labelKey: 'settings.passwordFair', color: 'bg-orange-500', width: '50%' };
    if (score === 3) return { labelKey: 'settings.passwordGood', color: 'bg-yellow-500', width: '75%' };
    return { labelKey: 'settings.passwordStrong', color: 'bg-green-500', width: '100%' };
  };

  const strength = passwordStrength(newPassword);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.changePassword')}</CardTitle>
              <CardDescription>{t('settings.changePasswordDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPwd">{t('settings.currentPassword')}</Label>
            <div className="relative">
              <Input
                id="currentPwd"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('settings.enterCurrentPassword')}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPwd">{t('settings.newPassword')}</Label>
            <div className="relative">
              <Input
                id="newPwd"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('settings.enterNewPassword')}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {strength && (
              <div className="space-y-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${strength.color}`}
                    style={{ width: strength.width }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.passwordStrength')}: <span className="font-medium">{t(strength.labelKey)}</span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPwd">{t('settings.confirmNewPassword')}</Label>
            <Input
              id="confirmPwd"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('settings.repeatNewPassword')}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500">{t('settings.passwordsDoNotMatch')}</p>
            )}
            {confirmPassword && newPassword === confirmPassword && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> {t('settings.passwordsMatch')}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              <Lock className="mr-2 h-4 w-4" />
              {changingPassword ? t('settings.changing') : t('settings.changePasswordButton')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.securityPreferences')}</CardTitle>
              <CardDescription>{t('settings.securityPreferencesDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t('settings.twoFactorAuth')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.twoFactorAuthDescription')}</p>
            </div>
            <Switch
              checked={twoFA}
              onCheckedChange={handleToggle2FA}
              disabled={togglingTwoFA}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{t('settings.sessionTimeout')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.sessionTimeoutDescription')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.session_timeout_minutes}
                  onChange={(e) => onSettingsChange({ session_timeout_minutes: e.target.value })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">{t('settings.minutes')}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSaveTimeout} disabled={savingTimeout}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {savingTimeout ? t('settings.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{t('settings.rolesPermissions')}</CardTitle>
              <CardDescription>{t('settings.rolesPermissionsDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((role) => (
            <Collapsible
              key={role.id}
              open={openRoles[role.id]}
              onOpenChange={() => toggleRole(role.id)}
            >
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_COLORS[role.name] ?? 'bg-muted text-muted-foreground'}`}
                    >
                      {t(`roles.${role.name}`, { defaultValue: role.name })}
                    </span>
                    <span className="text-sm text-muted-foreground">{role.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{role.permissions.length}</Badge>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${openRoles[role.id] ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 p-3 bg-muted/30 rounded-lg border border-t-0 rounded-t-none -mt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.map((perm) => (
                      <span
                        key={perm.name}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[perm.action] ?? 'bg-muted text-muted-foreground'}`}
                      >
                        {perm.name.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {role.permissions.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t('settings.noPermissionsAssigned')}</span>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
