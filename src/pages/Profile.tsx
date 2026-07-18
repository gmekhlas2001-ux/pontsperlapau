import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edge';
import { changePassword } from '@/services/settingsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  User, Lock, Save, Loader as Loader2, Mail, MapPin, Briefcase,
  Calendar, Phone, ShieldCheck, Eye, EyeOff,
} from 'lucide-react';
import { ImageUpload } from '@/components/ui-custom/ImageUpload';
import { BirthDateInput } from '@/components/ui-custom/BirthDateInput';
import { cn } from '@/lib/utils';

const ROLE_BADGE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  teacher:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  librarian:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  student:    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

interface ProfileData {
  email: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  passportNumber: string;
  profilePictureUrl: string;
  // Read-only role/branch info
  role: string;
  branchName: string | null;
  position: string | null;
  department: string | null;
  dateJoined: string | null;
  bio: string;
}

const EMPTY: ProfileData = {
  email: '',
  firstName: '',
  lastName: '',
  fatherName: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  passportNumber: '',
  profilePictureUrl: '',
  role: '',
  branchName: null,
  position: null,
  department: null,
  dateJoined: null,
  bio: '',
};

export function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [data, setData] = useState<ProfileData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isBirthDateValid, setIsBirthDateValid] = useState(true);

  // Password tab state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Pull fresh user data from users_public + staff (if any) for the
    // role-specific fields.
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase
        .from('users_public')
        .select('email, first_name, last_name, father_name, phone_number, date_of_birth, gender, passport_number, profile_picture_url, role, branch_id')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('staff')
        .select('position, department, date_joined, bio, branch:branches!branch_id(name)')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle(),
    ]);

    let branchName: string | null = null;
    if (u?.branch_id) {
      const { data: b } = await supabase.from('branches').select('name').eq('id', u.branch_id).maybeSingle();
      branchName = b?.name ?? null;
    }

    if (u) {
      setData({
        email: u.email ?? '',
        firstName: u.first_name ?? '',
        lastName: u.last_name ?? '',
        fatherName: u.father_name ?? '',
        phone: u.phone_number ?? '',
        dateOfBirth: u.date_of_birth ?? '',
        gender: u.gender ?? '',
        passportNumber: u.passport_number ?? '',
        profilePictureUrl: u.profile_picture_url ?? '',
        role: u.role ?? '',
        branchName,
        position: s?.position ?? null,
        department: s?.department ?? null,
        dateJoined: s?.date_joined ?? null,
        bio: s?.bio ?? '',
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const update = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const saveProfile = async () => {
    if (!user) return;
    if (!isBirthDateValid) {
      toast.error(t('common.invalidDateOfBirth'));
      return;
    }
    if (!data.firstName.trim() || !data.lastName.trim()) {
      toast.error(t('profile.nameRequired'));
      return;
    }

    setSavingProfile(true);
    const res = await callEdgeFunction('update-user', {
      targetUserId: user.id,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      fatherName: data.fatherName.trim() || null,
      phone: data.phone.trim() || null,
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      passportNumber: data.passportNumber.trim() || null,
      profilePictureUrl: data.profilePictureUrl || null,
    });
    setSavingProfile(false);

    if (!res.ok) {
      toast.error(res.error || t('profile.saveFailed'));
      return;
    }
    toast.success(t('profile.saveSuccess'));
    load();
  };

  const handlePasswordChange = async () => {
    if (!user) return;
    if (!currentPassword || !newPassword) {
      toast.error(t('profile.passwordFieldsRequired'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('profile.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordsMismatch'));
      return;
    }
    if (currentPassword === newPassword) {
      toast.error(t('profile.passwordsSame'));
      return;
    }

    setSavingPassword(true);
    const res = await changePassword(user.id, user.email, currentPassword, newPassword);
    setSavingPassword(false);

    if (!res.success) {
      toast.error(res.error || t('profile.passwordChangeFailed'));
      return;
    }
    toast.success(t('profile.passwordChangeSuccess'));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    logout();
  };

  const initials = `${data.firstName?.[0] ?? ''}${data.lastName?.[0] ?? ''}`.toUpperCase() || '??';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b p-2 pb-4 sm:p-4 lg:p-6 lg:pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <User className="h-6 w-6" />
            {t('profile.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('profile.subtitle')}</p>
        </div>
      </div>

      <div className="max-w-4xl flex-1 space-y-6 p-1 pt-4 sm:p-4 lg:overflow-auto lg:p-6">
        {/* Identity card */}
        {loading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ) : (
          <Card className="border shadow-sm">
            <CardContent className="p-6 flex items-center gap-5 flex-wrap">
              <Avatar className="h-20 w-20">
                {data.profilePictureUrl && <AvatarImage src={data.profilePictureUrl} alt={`${data.firstName} ${data.lastName}`} />}
                <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold">{data.firstName} {data.lastName}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5" /> {data.email}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ROLE_BADGE_COLORS[data.role] ?? '')}>
                    {t(`roles.${data.role}`)}
                  </span>
                  {data.branchName && (
                    <span className="text-xs flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {data.branchName}
                    </span>
                  )}
                  {data.position && (
                    <span className="text-xs flex items-center gap-1 text-muted-foreground">
                      <Briefcase className="h-3 w-3" /> {data.position}
                    </span>
                  )}
                  {data.dateJoined && (
                    <span className="text-xs flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {t('profile.joined')} {data.dateJoined}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="info" className="w-full">
          <TabsList>
            <TabsTrigger value="info">
              <User className="h-4 w-4 mr-2" /> {t('profile.tabInfo')}
            </TabsTrigger>
            <TabsTrigger value="password">
              <Lock className="h-4 w-4 mr-2" /> {t('profile.tabPassword')}
            </TabsTrigger>
          </TabsList>

          {/* INFO TAB */}
          <TabsContent value="info" className="mt-4">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle>{t('profile.personalInfo')}</CardTitle>
                <CardDescription>{t('profile.personalInfoDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <>
                    {/* Profile picture */}
                    <div className="space-y-2">
                      <Label>Profile picture</Label>
                      <ImageUpload
                        value={data.profilePictureUrl}
                        onChange={(url) => update('profilePictureUrl', url ?? '')}
                        variant="avatar"
                        folder="users"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">{t('profile.firstName')} *</Label>
                        <Input id="firstName" value={data.firstName} onChange={(e) => update('firstName', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">{t('profile.lastName')} *</Label>
                        <Input id="lastName" value={data.lastName} onChange={(e) => update('lastName', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fatherName">{t('profile.fatherName')}</Label>
                        <Input id="fatherName" value={data.fatherName} onChange={(e) => update('fatherName', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          <Phone className="h-3.5 w-3.5 inline mr-1" /> {t('profile.phone')}
                        </Label>
                        <Input id="phone" value={data.phone} onChange={(e) => update('phone', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dob">{t('profile.dateOfBirth')}</Label>
                        <BirthDateInput
                          id="dob"
                          value={data.dateOfBirth}
                          onValueChange={(value) => update('dateOfBirth', value)}
                          onValidityChange={setIsBirthDateValid}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('profile.gender')}</Label>
                        <Select value={data.gender} onValueChange={(v) => update('gender', v)}>
                          <SelectTrigger><SelectValue placeholder={t('profile.genderPlaceholder')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">{t('common.male')}</SelectItem>
                            <SelectItem value="female">{t('common.female')}</SelectItem>
                            <SelectItem value="other">{t('common.other')}</SelectItem>
                            <SelectItem value="prefer_not_to_say">{t('common.preferNotToSay')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="passport">{t('profile.passportNumber')}</Label>
                      <Input id="passport" value={data.passportNumber} onChange={(e) => update('passportNumber', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('profile.email')}</Label>
                      <Input value={data.email} disabled />
                      <p className="text-xs text-muted-foreground">{t('profile.emailNote')}</p>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={saveProfile} disabled={savingProfile}>
                        {savingProfile ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.loading')}</>
                        ) : (
                          <><Save className="h-4 w-4 mr-2" />{t('profile.saveChanges')}</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PASSWORD TAB */}
          <TabsContent value="password" className="mt-4">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  {t('profile.changePassword')}
                </CardTitle>
                <CardDescription>{t('profile.changePasswordDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="curr">{t('profile.currentPassword')}</Label>
                  <div className="relative">
                    <Input
                      id="curr"
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrent(!showCurrent)}
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new">{t('profile.newPassword')}</Label>
                  <div className="relative">
                    <Input
                      id="new"
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNew(!showNew)}
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('profile.passwordHint')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conf">{t('profile.confirmPassword')}</Label>
                  <Input
                    id="conf"
                    type={showNew ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={handlePasswordChange} disabled={savingPassword}>
                    {savingPassword ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.loading')}</>
                    ) : (
                      <><Lock className="h-4 w-4 mr-2" />{t('profile.updatePassword')}</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
