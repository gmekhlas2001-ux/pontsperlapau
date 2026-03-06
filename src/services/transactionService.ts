import { supabase } from '@/lib/supabase';
import type { Transaction, CreateTransactionData, TransactionStats } from '@/types';

type ServiceResult<T> = { success: boolean; data?: T; error?: string };

const TRANSACTION_SELECT = `
  *,
  sender_branch:branches!sender_branch_id(id, name),
  receiver_branch:branches!receiver_branch_id(id, name),
  sender_staff:staff!sender_staff_id(id, user:users!staff_user_id(first_name, last_name)),
  receiver_staff:staff!receiver_staff_id(id, user:users!staff_user_id(first_name, last_name)),
  creator:users!created_by(first_name, last_name)
`;

export async function getTransactions(filters?: {
  status?: string;
  transfer_method?: string;
  sender_branch_id?: string;
  receiver_branch_id?: string;
  from_date?: string;
  to_date?: string;
}): Promise<ServiceResult<Transaction[]>> {
  try {
    let query = supabase
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.transfer_method) query = query.eq('transfer_method', filters.transfer_method);
    if (filters?.sender_branch_id) query = query.eq('sender_branch_id', filters.sender_branch_id);
    if (filters?.receiver_branch_id) query = query.eq('receiver_branch_id', filters.receiver_branch_id);
    if (filters?.from_date) query = query.gte('created_at', filters.from_date);
    if (filters?.to_date) query = query.lte('created_at', filters.to_date);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as Transaction[] };
  } catch (e) {
    return { success: false, error: 'Failed to fetch transactions' };
  }
}

export async function getTransactionStats(): Promise<ServiceResult<TransactionStats>> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('status, amount');

    if (error) return { success: false, error: error.message };

    const stats: TransactionStats = {
      total: data.length,
      pending: data.filter((t) => t.status === 'pending').length,
      completed: data.filter((t) => t.status === 'completed').length,
      cancelled: data.filter((t) => t.status === 'cancelled').length,
      failed: data.filter((t) => t.status === 'failed').length,
      totalAmount: data.reduce((s, t) => s + Number(t.amount), 0),
      totalAmountCompleted: data
        .filter((t) => t.status === 'completed')
        .reduce((s, t) => s + Number(t.amount), 0),
    };

    return { success: true, data: stats };
  } catch (e) {
    return { success: false, error: 'Failed to fetch transaction stats' };
  }
}

export async function createTransaction(
  data: CreateTransactionData,
  createdBy?: string
): Promise<ServiceResult<Transaction>> {
  try {
    const { data: row, error } = await supabase
      .from('transactions')
      .insert({
        sender_branch_id: data.sender_branch_id,
        receiver_branch_id: data.receiver_branch_id,
        sender_staff_id: data.sender_staff_id,
        receiver_staff_id: data.receiver_staff_id,
        amount: data.amount,
        currency: data.currency,
        transfer_method: data.transfer_method,
        external_reference: data.external_reference || null,
        notes: data.notes || null,
        created_by: createdBy || null,
        status: 'pending',
      })
      .select(TRANSACTION_SELECT)
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: row as unknown as Transaction };
  } catch (e) {
    return { success: false, error: 'Failed to create transaction' };
  }
}

export async function updateTransactionStatus(
  id: string,
  status: 'completed' | 'cancelled' | 'failed'
): Promise<ServiceResult<Transaction>> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({ status })
      .eq('id', id)
      .select(TRANSACTION_SELECT)
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as Transaction };
  } catch (e) {
    return { success: false, error: 'Failed to update transaction status' };
  }
}

export async function updateTransaction(
  id: string,
  updates: Partial<CreateTransactionData> & { external_reference?: string; notes?: string }
): Promise<ServiceResult<Transaction>> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(TRANSACTION_SELECT)
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as Transaction };
  } catch (e) {
    return { success: false, error: 'Failed to update transaction' };
  }
}

export async function deleteTransaction(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Failed to delete transaction' };
  }
}
