import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { languages, type LanguageCode } from '@/i18n';
import { getFullName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AvatarWithFallback } from '@/components/ui-custom/AvatarWithFallback';
import { MobileMenuButton } from './Sidebar';
import {
  Bell,
  Moon,
  Sun,
  Globe,
  Check,
  User,
  LogOut,
  KeyRound,
  ReceiptText,
  BookOpen,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { fetchNotifications, type Notification, type NotificationKind } from '@/services/notificationsService';
import { formatDistanceToNow } from 'date-fns';

interface HeaderProps {
  onMenuClick: () => void;
}

const KIND_ICON: Record<NotificationKind, React.ElementType> = {
  password_reset: KeyRound,
  pending_transaction: ReceiptText,
  overdue_book: BookOpen,
};

const KIND_BG: Record<NotificationKind, string> = {
  password_reset: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  pending_transaction: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  overdue_book: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const POLL_MS = 60_000; // refresh notifications every minute
const SEEN_KEY = 'notifications_last_seen';

export function Header({ onMenuClick }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState<string>(() => localStorage.getItem(SEEN_KEY) ?? '1970-01-01');

  const currentLanguage = languages.find((l) => l.code === i18n.language) || languages[2];
  const unreadCount = notifications.filter((n) => n.createdAt > lastSeen).length;

  const refresh = useCallback(async () => {
    if (!user) return;
    const items = await fetchNotifications();
    setNotifications(items);
  }, [user]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const markAllAsSeen = () => {
    const now = new Date().toISOString();
    setLastSeen(now);
    localStorage.setItem(SEEN_KEY, now);
  };

  const handleLanguageChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    document.documentElement.dir = languages.find((l) => l.code === code)?.dir || 'ltr';
  };

  const handleNotificationClick = (n: Notification) => {
    markAllAsSeen();
    if (n.link) navigate(n.link);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        <MobileMenuButton onClick={onMenuClick} />

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                {resolvedTheme === 'dark' ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('settings.theme')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme('light')}>
                {t('settings.light')}
                {theme === 'light' && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                {t('settings.dark')}
                {theme === 'dark' && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('auto')}>
                {t('settings.auto')}
                {theme === 'auto' && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Language Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('settings.language')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {languages.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code as LanguageCode)}
                >
                  <span className="mr-2">{lang.flag}</span>
                  <span>{lang.name}</span>
                  {currentLanguage.code === lang.code && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <DropdownMenu onOpenChange={(o) => { if (o) markAllAsSeen(); }}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications.title')}>
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-[10px] font-semibold text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-h-[500px] overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-2">
                <DropdownMenuLabel className="p-0">{t('notifications.title')}</DropdownMenuLabel>
                {notifications.length > 0 && (
                  <button
                    onClick={(e) => { e.preventDefault(); refresh(); }}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('common.refresh')}
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = KIND_ICON[n.kind];
                  return (
                    <DropdownMenuItem
                      key={n.id}
                      className="flex items-start gap-3 p-3 cursor-pointer"
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${KIND_BG[n.kind]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-tight">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Profile */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <AvatarWithFallback
                    src={user.avatar}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    className="h-8 w-8"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{getFullName(user.firstName, user.lastName)}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
