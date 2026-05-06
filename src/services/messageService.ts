/**
 * Message Service
 *
 * In-app messaging between staff members.
 * Messages are branch-scoped. Threads are formed via parent_id.
 */

import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';

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

    if (branchId) q = q.eq('branch_id', branchId);
    // Messages addressed to this user OR broadcast (recipient_id IS NULL)
    q = q.or(`recipient_id.eq.${userId},recipient_id.is.null`);

    const { data, error } = await q;
    if (error) throw error;

    return { success: true, data: mapMessages(data ?? []) };
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

    if (branchId) q = q.eq('branch_id', branchId);

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
  senderId: string,
  msg: SendMessageData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const branchId = scopedBranchId();
    if (!branchId) throw new Error('No branch context');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id:    senderId,
        recipient_id: msg.recipientId ?? null,
        branch_id:    branchId,
        subject:      msg.subject,
        body:         msg.body,
        parent_id:    msg.parentId ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to send message' };
  }
}

export async function markAsRead(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId)
      .is('read_at', null);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to mark as read' };
  }
}

export async function deleteMessage(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to delete message' };
  }
}

export async function getUnreadCount(
  userId: string,
): Promise<number> {
  try {
    const branchId = scopedBranchId();
    let q = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .or(`recipient_id.eq.${userId},recipient_id.is.null`);

    if (branchId) q = q.eq('branch_id', branchId);
    const { count } = await q;
    return count ?? 0;
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
