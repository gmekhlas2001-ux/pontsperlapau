/**
 * Messages — In-app staff messaging
 *
 * Inbox / Sent tabs. Click a thread to expand replies.
 * Compose dialog sends to a single staff member or broadcasts to the whole branch.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, RefreshCw, Mail, MailOpen, Send, Reply, Users, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getInbox, getSent, getThread, sendMessage, markAsRead, deleteMessage,
  type Message,
} from '@/services/messageService';
import { supabase } from '@/lib/supabase';

interface StaffUser { id: string; first_name: string; last_name: string; role: string }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Compose Dialog ────────────────────────────────────────────────────────────

function ComposeDialog({
  open,
  onClose,
  onSent,
  staff,
  replyTo,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  staff: StaffUser[];
  replyTo?: Message | null;
  userId: string;
}) {
  const { t } = useTranslation();
  const BROADCAST = '__everyone__';
  const [recipientId, setRecipientId] = useState(replyTo?.senderId ?? BROADCAST);
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRecipientId(replyTo?.senderId ?? BROADCAST);
      setSubject(replyTo ? `Re: ${replyTo.subject}` : '');
      setBody('');
    }
  }, [open, replyTo]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) { toast.error(t('messages.errors.subject')); return; }
    if (!body.trim()) { toast.error(t('messages.errors.body')); return; }
    setSaving(true);
    const res = await sendMessage(userId, {
      recipientId: recipientId === BROADCAST ? null : recipientId,
      subject,
      body,
      parentId: replyTo?.parentId ?? replyTo?.id,
    });
    setSaving(false);
    if (res.success) { toast.success(t('messages.sent')); onSent(); onClose(); }
    else toast.error(res.error ?? t('messages.errors.send'));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{replyTo ? t('messages.reply') : t('messages.compose')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('messages.to')}</Label>
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger><SelectValue placeholder={t('messages.everyone')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={BROADCAST}>{t('messages.everyone')}</SelectItem>
                {staff.filter((s) => s.id !== userId).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('messages.subject')}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('messages.body')}</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              <Send className="w-4 h-4" />
              {saving ? t('common.saving') : t('messages.send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Message row ───────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  isSent,
  onReply,
  onDelete,
}: {
  msg: Message;
  isSent: boolean;
  onReply: (m: Message) => void;
  onDelete: (m: Message) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<Message[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  const isUnread = !msg.readAt && !isSent;

  async function toggle() {
    if (!expanded) {
      // mark as read
      if (isUnread) markAsRead(msg.id);
      // load replies
      setLoadingReplies(true);
      const res = await getThread(msg.id);
      setLoadingReplies(false);
      if (res.success) setReplies(res.data ?? []);
    }
    setExpanded((p) => !p);
  }

  return (
    <div className={`border-b last:border-0 ${isUnread ? 'bg-teal-50/40' : ''}`}>
      <div
        className="flex items-start gap-3 p-3 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Open'} message: ${msg.subject}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void toggle();
          }
        }}
      >
        {isUnread
          ? <Mail className="w-4 h-4 text-teal-600 mt-1 shrink-0" />
          : <MailOpen className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${isUnread ? 'font-semibold' : 'font-medium'}`}>
              {isSent
                ? (msg.recipientFirstName ? `${msg.recipientFirstName} ${msg.recipientLastName}` : t('messages.everyone'))
                : `${msg.senderFirstName} ${msg.senderLastName}`
              }
            </span>
            {!msg.recipientId && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Users className="w-3 h-3" />{t('messages.broadcast')}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{timeAgo(msg.createdAt)}</span>
          </div>
          <p className={`text-sm truncate ${isUnread ? 'font-medium' : 'text-muted-foreground'}`}>{msg.subject}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="px-10 pb-4 space-y-3">
          <p className="text-sm whitespace-pre-wrap border rounded-lg p-3 bg-background">{msg.body}</p>
          {loadingReplies && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
          {replies.map((r) => (
            <div key={r.id} className="border-l-2 border-teal-300 pl-3 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">
                {r.senderFirstName} {r.senderLastName} · {timeAgo(r.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{r.body}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onReply(msg)}>
              <Reply className="w-3 h-3" />{t('messages.reply')}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={() => onDelete(msg)}>
              <Trash2 className="w-3 h-3" />{t('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function Messages() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [inbox, setInbox] = useState<Message[]>([]);
  const [sent, setSent] = useState<Message[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [inboxRes, sentRes] = await Promise.all([
      getInbox(user.id),
      getSent(user.id),
    ]);
    setLoading(false);
    if (inboxRes.success) setInbox(inboxRes.data ?? []);
    if (sentRes.success) setSent(sentRes.data ?? []);
    setUnread((inboxRes.data ?? []).filter((m) => !m.readAt).length);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase
      .from('users')
      .select('id, first_name, last_name, role')
      .neq('role', 'student')
      .neq('role', 'parent')
      .then(({ data }) => { if (data) setStaff(data as StaffUser[]); });
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteMessage(deleteTarget.id);
    setDeleting(false);
    if (res.success) { toast.success(t('messages.deleted')); setDeleteTarget(null); load(); }
    else toast.error(res.error ?? t('messages.errors.delete'));
  }

  const messages = tab === 'inbox' ? inbox : sent;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-0 sm:p-2 lg:p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('messages.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('messages.subtitle')}</p>
        </div>
        <Button onClick={() => { setReplyTo(null); setShowCompose(true); }} className="gap-2">
          <Plus className="w-4 h-4" />{t('messages.compose')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['inbox', 'sent'] as const).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t2 ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`messages.tabs.${t2}`)}
            {t2 === 'inbox' && unread > 0 && (
              <span className="bg-teal-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{unread}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />{t('common.loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Mail className="w-10 h-10 opacity-30" />
              <p>{tab === 'inbox' ? t('messages.emptyInbox') : t('messages.emptySent')}</p>
            </div>
          ) : messages.map((msg) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              isSent={tab === 'sent'}
              onReply={(m) => { setReplyTo(m); setShowCompose(true); }}
              onDelete={setDeleteTarget}
            />
          ))}
        </CardContent>
      </Card>

      <ComposeDialog
        open={showCompose}
        onClose={() => { setShowCompose(false); setReplyTo(null); }}
        onSent={load}
        staff={staff}
        replyTo={replyTo}
        userId={user?.id ?? ''}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('messages.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('messages.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
