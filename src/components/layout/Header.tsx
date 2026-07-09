import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  Globe,
  Check,
  User,
  LogOut,
  KeyRound,
  ReceiptText,
  BookOpen,
  MessageSquare,
  ClipboardList,
  CircleDollarSign,
  HandCoins,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { fetchNotifications, type Notification, type NotificationKind } from '@/services/notificationsService';
import { formatDistanceToNow } from 'date-fns';
import { findNavItemForPathname } from '@/modules/registry';

interface HeaderProps {
  onMenuClick: () => void;
}

const KIND_ICON: Record<NotificationKind, React.ElementType> = {
  password_reset: KeyRound,
  pending_transaction: ReceiptText,
  overdue_book: BookOpen,
  new_message: MessageSquare,
  new_survey: ClipboardList,
  fee_due: CircleDollarSign,
  new_grant: HandCoins,
  new_user: UserPlus,
};

const KIND_BG: Record<NotificationKind, string> = {
  password_reset: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  pending_transaction: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  overdue_book: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  new_message: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  new_survey: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  fee_due: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  new_grant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  new_user: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
};

const POLL_MS = 60_000; // refresh notifications every minute
const SEEN_KEY = 'notifications_last_seen';

export function Header({ onMenuClick }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState<string>(() => localStorage.getItem(SEEN_KEY) ?? '1970-01-01');

  const currentLanguage = languages.find((l) => l.code === i18n.language) || languages[2];
  const unreadCount = notifications.filter((n) => n.createdAt > lastSeen).length;
  const pageTitle = t(findNavItemForPathname(location.pathname)?.labelKey ?? 'dashboard.title');

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
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-4 lg:px-6">
        <MobileMenuButton onClick={onMenuClick} />

        <div className="min-w-0">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">
            {t('app.name')}
          </p>
          <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
            {pageTitle}
          </h2>
        </div>

        <div className="flex-1" />

        {user && (
          <div className="hidden items-center gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm lg:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_hsl(160_84%_39%_/_0.12)]" />
            <span className="capitalize">{t(`roles.${user.role}`)}</span>
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Language Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('settings.language')} className="border border-transparent hover:border-border/70">
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
              <Button variant="ghost" size="icon" className="relative border border-transparent hover:border-border/70" aria-label={t('notifications.title')}>
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[500px] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto">
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
                      className="flex cursor-pointer items-start gap-3 rounded-md p-3"
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
                <Button variant="ghost" className="relative h-9 gap-2 rounded-md border border-transparent px-1.5 hover:border-border/70 sm:w-auto sm:px-2">
                  <AvatarWithFallback
                    src={user.avatar}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    className="h-8 w-8"
                  />
                  <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
                    {user.firstName}
                  </span>
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
