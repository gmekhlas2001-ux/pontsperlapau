import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';
import { callEdgeFunction } from '@/lib/edge';
import type { Transaction, CreateTransactionData, TransactionStats } from '@/types';
import { fetchAllPages } from '@/lib/pagination';

type ServiceResult<T> = { success: boolean; data?: T; error?: string };

const TRANSACTION_SELECT = `
  *,
  sender_branch:branches!sender_branch_id(id, name),
  receiver_branch:branches!receiver_branch_id(id, name),
  sender_staff:staff!sender_staff_id(id, user:users!user_id(first_name, last_name)),
  receiver_staff:staff!receiver_staff_id(id, user:users!user_id(first_name, last_name)),
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
    const branchId = scopedBranchId();

    const data = await fetchAllPages<Transaction>((from, to) => {
      let query = supabase.from('transactions').select(TRANSACTION_SELECT)
        .order('created_at', { ascending: false }).range(from, to);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.transfer_method) query = query.eq('transfer_method', filters.transfer_method);
      if (filters?.sender_branch_id) query = query.eq('sender_branch_id', filters.sender_branch_id);
      if (filters?.receiver_branch_id) query = query.eq('receiver_branch_id', filters.receiver_branch_id);
      if (filters?.from_date) query = query.gte('created_at', filters.from_date);
      if (filters?.to_date) query = query.lte('created_at', filters.to_date);
      if (branchId) query = query.or(`sender_branch_id.eq.${branchId},receiver_branch_id.eq.${branchId}`);
      return query as any;
    });
    return { success: true, data };
  } catch {
    return { success: false, error: 'Failed to fetch transactions' };
  }
}

export async function getTransactionStats(): Promise<ServiceResult<TransactionStats>> {
  try {
    const branchId = scopedBranchId();

    const data = await fetchAllPages<{ status: string; amount: number; currency: string }>((from, to) => {
      let query = supabase.from('transactions').select('status, amount, currency').range(from, to);
      if (branchId) query = query.or(`sender_branch_id.eq.${branchId},receiver_branch_id.eq.${branchId}`);
      return query as any;
    });

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
      totalsByCurrency: data.reduce<Record<string, { total: number; completed: number }>>((totals, transaction: any) => {
        const currency = transaction.currency ?? 'UNKNOWN';
        totals[currency] ??= { total: 0, completed: 0 };
        totals[currency].total += Number(transaction.amount);
        if (transaction.status === 'completed') totals[currency].completed += Number(transaction.amount);
        return totals;
      }, {}),
    };

    return { success: true, data: stats };
  } catch {
    return { success: false, error: 'Failed to fetch transaction stats' };
  }
}

export async function createTransaction(
  data: CreateTransactionData,
  _createdBy?: string
): Promise<ServiceResult<Transaction>> {
  const res = await callEdgeFunction<{ success: boolean; data: Transaction }>('app-actions', {
    operation: 'create-transaction',
    ...data,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to create transaction' };
  return { success: true, data: res.data?.data };
}

export async function updateTransactionStatus(
  id: string,
  status: 'completed' | 'cancelled' | 'failed'
): Promise<ServiceResult<Transaction>> {
  const res = await callEdgeFunction<{ success: boolean; data: Transaction }>('app-actions', {
    operation: 'update-transaction-status',
    id,
    status,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update transaction status' };
  return { success: true, data: res.data?.data };
}

export async function updateTransaction(
  id: string,
  updates: Partial<CreateTransactionData> & { external_reference?: string; notes?: string }
): Promise<ServiceResult<Transaction>> {
  const res = await callEdgeFunction<{ success: boolean; data: Transaction }>('app-actions', {
    operation: 'update-transaction',
    id,
    updates,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update transaction' };
  return { success: true, data: res.data?.data };
}

export async function deleteTransaction(id: string): Promise<ServiceResult<void>> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-transaction',
    id,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete transaction' };
  return { success: true };
}
