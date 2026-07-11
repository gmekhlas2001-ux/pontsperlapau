/**
 * Message Service
 *
 * In-app messaging between staff members.
 * Messages are branch-scoped. Threads are formed via parent_id.
 */

import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';
import { callEdgeFunction } from '@/lib/edge';

export interface Message {
  id: string;
  senderId: string;
  senderFirstName: string;
  senderLastName: string;
  recipientId: string | null;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  branchId: string;
  subject: string;
  body: string;
  readAt: string | null;
  parentId: string | null;
  createdAt: string;
  replyCount?: number;
}

export interface SendMessageData {
  recipientId: string | null;
  subject: string;
  body: string;
  parentId?: string;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────

/** Get inbox messages for the current user (they are the recipient). */
export async function getInbox(
  userId: string,
): Promise<{ success: boolean; data?: Message[]; error?: string }> {
  try {
    const branchId = scopedBranchId();
    let q = supabase
      .from('messages')
      .select(`
        id, sender_id, recipient_id, branch_id, subject, body, read_at, parent_id, created_at,
        sender:users!sender_id(first_name, last_name),
        recipient:users!recipient_id(first_name, last_name)
      `)
      .is('parent_id', null)        // top-level only
      .order('created_at', { ascending: false });

    // Branch filter: see own branch + global broadcasts (branch_id IS NULL)
    if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
    // Messages addressed to this user OR broadcast (recipient_id IS NULL)
    q = q.or(`recipient_id.eq.${userId},recipient_id.is.null`);

    const { data, error } = await q;
    if (error) throw error;

    const rows = data ?? [];
    const broadcastIds = rows.filter((row: any) => row.recipient_id === null).map((row: any) => row.id);
    let readBroadcastIds = new Set<string>();
    if (broadcastIds.length > 0) {
      const { data: receipts, error: receiptError } = await supabase
        .from('message_read_receipts')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', broadcastIds);
      if (receiptError) throw receiptError;
      readBroadcastIds = new Set((receipts ?? []).map((receipt: any) => receipt.message_id));
    }
    return {
      success: true,
      data: mapMessages(rows).map((message) => message.recipientId === null && readBroadcastIds.has(message.id)
        ? { ...message, readAt: message.readAt ?? new Date(0).toISOString() }
        : message),
    };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load inbox' };
  }
}

/** Get sent messages for the current user. */
export async function getSent(
  userId: string,
): Promise<{ success: boolean; data?: Message[]; error?: string }> {
  try {
    const branchId = scopedBranchId();
    let q = supabase
      .from('messages')
      .select(`
        id, sender_id, recipient_id, branch_id, subject, body, read_at, parent_id, created_at,
        sender:users!sender_id(first_name, last_name),
        recipient:users!recipient_id(first_name, last_name)
      `)
      .eq('sender_id', userId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    // Sender's own messages: their branch + their global broadcasts
    if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);

    const { data, error } = await q;
    if (error) throw error;

    return { success: true, data: mapMessages(data ?? []) };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load sent messages' };
  }
}

/** Get replies to a thread (parent_id = threadId). */
export async function getThread(
  threadId: string,
): Promise<{ success: boolean; data?: Message[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, sender_id, recipient_id, branch_id, subject, body, read_at, parent_id, created_at,
        sender:users!sender_id(first_name, last_name),
        recipient:users!recipient_id(first_name, last_name)
      `)
      .eq('parent_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data: mapMessages(data ?? []) };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load replies' };
  }
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export async function sendMessage(
  _senderId: string,
  msg: SendMessageData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; id: string }>('app-actions', {
    operation: 'send-message',
    recipientId: msg.recipientId ?? null,
    subject: msg.subject,
    body: msg.body,
    parentId: msg.parentId ?? null,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to send message' };
  return { success: true, id: res.data?.id };
}

export async function markAsRead(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'mark-message-read',
    messageId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to mark as read' };
  return { success: true };
}

export async function deleteMessage(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-message',
    messageId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete message' };
  return { success: true };
}

export async function getUnreadCount(
  userId: string,
): Promise<number> {
  try {
    const branchId = scopedBranchId();
    let q = supabase
      .from('messages')
      .select('id, recipient_id, read_at')
      .or(`recipient_id.eq.${userId},recipient_id.is.null`);

    if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const broadcastIds = rows.filter((row: any) => row.recipient_id === null).map((row: any) => row.id);
    let readBroadcastIds = new Set<string>();
    if (broadcastIds.length > 0) {
      const { data: receipts } = await supabase
        .from('message_read_receipts')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', broadcastIds);
      readBroadcastIds = new Set((receipts ?? []).map((receipt: any) => receipt.message_id));
    }
    return rows.filter((row: any) => row.recipient_id !== null
      ? row.read_at === null
      : !readBroadcastIds.has(row.id)).length;
  } catch {
    return 0;
  }
}

// ─── mapper ────────────────────────────────────────────────────────────────────

function mapMessages(rows: any[]): Message[] {
  return rows.map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    senderFirstName: r.sender?.first_name ?? '',
    senderLastName: r.sender?.last_name ?? '',
    recipientId: r.recipient_id ?? null,
    recipientFirstName: r.recipient?.first_name ?? null,
    recipientLastName: r.recipient?.last_name ?? null,
    branchId: r.branch_id,
    subject: r.subject,
    body: r.body,
    readAt: r.read_at ?? null,
    parentId: r.parent_id ?? null,
    createdAt: r.created_at,
  }));
}
