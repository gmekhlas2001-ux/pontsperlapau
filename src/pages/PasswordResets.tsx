/**
 * Password Resets page (admin view).
 *
 * Lists password-reset requests submitted from the public login page.
 * Admins can resolve (set a new password via the edge function) or reject each
 * pending request. Branch admins only see requests for users in their branch;
 * superadmins see all. The two sub-dialogs (ResolveDialog, RejectDialog) are
 * kept in this file because they are only used here.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  listPasswordResetRequests,
  resolvePasswordResetRequest,
  rejectPasswordResetRequest,
  type PasswordResetRequest,
} from '@/services/passwordResetService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  KeyRound, Mail, MapPin, Clock, CircleCheck as CheckCircle2,
  CircleX as XCircle, RefreshCw, ShieldAlert, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<PasswordResetRequest['status'], string> = {
  pending:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  rejected: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-600',
};

export function PasswordResets() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'rejected' | 'all'>('pending');

  const [resolveTarget, setResolveTarget] = useState<PasswordResetRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PasswordResetRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listPasswordResetRequests({ status: filter });
    if (res.success && res.data) setItems(res.data);
    else toast.error(res.error || t('passwordResets.loadFailed'));
    setLoading(false);
  }, [filter, t]);

  useEffect(() => { load(); }, [load]);

  const counts = items.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    { pending: 0, resolved: 0, rejected: 0 } as Record<string, number>,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="h-6 w-6" />
            {t('passwordResets.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t('passwordResets.subtitle')}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} title={t('common.refresh')}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="pending">
              {t('passwordResets.pending')}
              {counts.pending > 0 && filter === 'pending' && (
                <span className="ml-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs rounded-full px-1.5 py-0.5">
                  {counts.pending}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolved">{t('passwordResets.resolved')}</TabsTrigger>
            <TabsTrigger value="rejected">{t('passwordResets.rejected')}</TabsTrigger>
            <TabsTrigger value="all">{t('passwordResets.all')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="border shadow-sm">
                <CardContent className="p-5">
                  <Skeleton className="h-5 w-1/3 mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {t('passwordResets.empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((req) => (
              <Card key={req.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn('text-xs font-medium border', STATUS_STYLES[req.status])}>
                          {t(`passwordResets.${req.status}`)}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(req.created_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      <p className="text-base font-semibold mt-2 flex items-center gap-2">
                        {req.user ? (
                          <>
                            <User className="h-4 w-4 text-muted-foreground" />
                            {req.user.first_name} {req.user.last_name}
                            <span className="text-xs text-muted-foreground font-normal">
                              ({req.user.role})
                            </span>
                          </>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4" />
                            {t('passwordResets.unknownUser')}
                          </span>
                        )}
                      </p>
                      <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          {req.email_tried}
                        </p>
                        {req.user?.branch?.name && (
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {req.user.branch.name}
                          </p>
                        )}
                      </div>
                      {req.reason && (
                        <p className="mt-2 text-sm bg-muted/40 rounded px-3 py-2 italic">
                          "{req.reason}"
                        </p>
                      )}
                      {req.resolved_at && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t(`passwordResets.${req.status}At`, {
                            date: format(new Date(req.resolved_at), 'MMM d, yyyy HH:mm'),
                          })}
                          {req.resolved_note && <> — "{req.resolved_note}"</>}
                        </p>
                      )}
                    </div>
                    {req.status === 'pending' && req.user && (
                      <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center xl:w-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-center"
                          onClick={() => setRejectTarget(req)}
                        >
                          <XCircle className="h-4 w-4 mr-1.5" />
                          {t('passwordResets.reject')}
                        </Button>
                        <Button size="sm" className="justify-center" onClick={() => setResolveTarget(req)}>
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          {t('passwordResets.setNewPassword')}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ResolveDialog
        request={resolveTarget}
        onClose={() => setResolveTarget(null)}
        onDone={() => { setResolveTarget(null); load(); }}
      />
      <RejectDialog
        request={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onDone={() => { setRejectTarget(null); load(); }}
      />
    </div>
  );
}

function ResolveDialog({
  request, onClose, onDone,
}: {
  request: PasswordResetRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) {
      setPassword(''); setConfirm(''); setNote('');
    }
  }, [request]);

  const submit = async () => {
    if (!request?.user_id) return;
    if (password.length < 8) {
      toast.error(t('passwordResets.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('passwordResets.passwordsMismatch'));
      return;
    }
    setSaving(true);
    const res = await resolvePasswordResetRequest(request.id, request.user_id, password, note.trim() || undefined);
    setSaving(false);
    if (res.success) {
      toast.success(t('passwordResets.resolveSuccess'));
      onDone();
    } else {
      toast.error(res.error || t('passwordResets.resolveFailed'));
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('passwordResets.resolveTitle')}</DialogTitle>
          <DialogDescription>
            {request?.user && (
              <>
                {t('passwordResets.resolveDescription', {
                  name: `${request.user.first_name} ${request.user.last_name}`,
                  email: request.email_tried,
                })}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-pw">{t('passwordResets.newPassword')}</Label>
            <Input
              id="new-pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordResets.newPasswordPlaceholder')}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pw">{t('passwordResets.confirmPassword')}</Label>
            <Input
              id="confirm-pw"
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('passwordResets.passwordHint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">{t('passwordResets.noteLabel')}</Label>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('passwordResets.notePlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? t('common.loading') : t('passwordResets.confirmResolve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  request, onClose, onDone,
}: {
  request: PasswordResetRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!request) setNote(''); }, [request]);

  const submit = async () => {
    if (!request) return;
    setSaving(true);
    const res = await rejectPasswordResetRequest(request.id, note.trim() || undefined);
    setSaving(false);
    if (res.success) {
      toast.success(t('passwordResets.rejectSuccess'));
      onDone();
    } else {
      toast.error(res.error || t('passwordResets.rejectFailed'));
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('passwordResets.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('passwordResets.rejectDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="reject-note">{t('passwordResets.noteLabel')}</Label>
          <Textarea
            id="reject-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('passwordResets.rejectNotePlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving ? t('common.loading') : t('passwordResets.confirmReject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
