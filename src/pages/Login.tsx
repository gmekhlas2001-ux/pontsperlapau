import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { languages, type LanguageCode } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { submitPasswordResetRequest } from '@/services/passwordResetService';
import { Globe, Loader as Loader2, CircleCheck as CheckCircle2 } from 'lucide-react';
// Login page component

export function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate('/', { replace: true });
  }, [authLoading, isAuthenticated, navigate]);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot-password dialog state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    await submitPasswordResetRequest(forgotEmail.trim(), forgotReason.trim() || undefined);
    setForgotLoading(false);
    setForgotSent(true);
  };

  const closeForgotDialog = () => {
    setForgotOpen(false);
    // Reset after dialog closes so the user sees the success state until they dismiss.
    setTimeout(() => {
      setForgotEmail('');
      setForgotReason('');
      setForgotSent(false);
    }, 250);
  };

  const handleLanguageChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    document.documentElement.dir = languages.find((l) => l.code === code)?.dir || 'ltr';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password, rememberMe);
      if (result.success) {
        navigate('/');
      } else if (result.code === 'rate_limited') {
        setError(t('auth.rateLimited'));
      } else if (result.code === 'student_portal_disabled') {
        setError(t('auth.studentPortalDisabled'));
      } else {
        setError(t('auth.invalidCredentials'));
      }
    } catch {
      setError(t('auth.invalidCredentials'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background to-muted p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Language Controls */}
      <div className="fixed right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex items-center gap-2 rounded-full border border-border/70 bg-background/90 shadow-sm backdrop-blur sm:right-4 sm:top-[max(1rem,env(safe-area-inset-top))]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('settings.language')}>
              <Globe className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {languages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code as LanguageCode)}
              >
                <span className="mr-2">{lang.flag}</span>
                <span>{lang.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img src="/image.png" alt="Ponts per la Pau" className="h-20 w-auto object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('auth.loginTitle')}</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <Label htmlFor="remember" className="text-sm font-normal">
                  {t('auth.rememberMe')}
                </Label>
              </div>
              <Button
                type="button"
                variant="link"
                className="px-0 text-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setForgotEmail(email); // pre-fill with whatever's in the login form
                  setForgotOpen(true);
                }}
              >
                {t('auth.forgotPassword')}
              </Button>
            </div>
            {error && (
              <div className="text-sm text-red-500 text-center">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('auth.loginButton')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onOpenChange={(o) => (o ? setForgotOpen(true) : closeForgotDialog())}>
        <DialogContent className="sm:max-w-md">
          {forgotSent ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  {t('auth.forgotSentTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('auth.forgotSentBody')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={closeForgotDialog}>{t('common.close')}</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleForgotSubmit}>
              <DialogHeader>
                <DialogTitle>{t('auth.forgotTitle')}</DialogTitle>
                <DialogDescription>{t('auth.forgotDescription')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">{t('auth.email')}</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgot-reason">{t('auth.forgotReasonLabel')}</Label>
                  <Textarea
                    id="forgot-reason"
                    rows={3}
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder={t('auth.forgotReasonPlaceholder')}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForgotDialog} disabled={forgotLoading}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={forgotLoading || !forgotEmail.trim()}>
                  {forgotLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    t('auth.forgotSubmit')
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
