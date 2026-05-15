/**
 * Donor & Grant Service
 *
 * Manages donors, their grants, and spending transactions per branch.
 * All grant data is branch-scoped for multi-tenant isolation.
 */

import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';
import { callEdgeFunction } from '@/lib/edge';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DonorType = 'individual' | 'organisation' | 'government' | 'foundation';
export type GrantStatus = 'pending' | 'active' | 'closed' | 'cancelled';
export type TxType = 'income' | 'expense';

export interface Donor {
  id: string;
  name: string;
  type: DonorType;
  email: string | null;
  phone: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  grantCount?: number;
  totalGranted?: number;
}

export interface Grant {
  id: string;
  donorId: string;
  donorName: string;
  branchId: string;
  branchName: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  status: GrantStatus;
  createdAt: string;
  // computed
  spent: number;
  remaining: number;
  spentPct: number;
}

export interface GrantTransaction {
  id: string;
  grantId: string;
  description: string;
  amount: number;
  type: TxType;
  txDate: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateDonorData {
  name: string;
  type: DonorType;
  email?: string;
  phone?: string;
  country?: string;
  notes?: string;
}

export interface CreateGrantData {
  donorId: string;
  branchId: string;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateTxData {
  grantId: string;
  description: string;
  amount: number;
  type: TxType;
  txDate?: string;
  notes?: string;
}

// ─── Donors ────────────────────────────────────────────────────────────────────

export async function getDonors(): Promise<{ success: boolean; data?: Donor[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('donors')
      .select(`*, grants(id, amount)`)
      .order('name');

    if (error) throw error;

    const donors: Donor[] = ((data ?? []) as any[]).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type as DonorType,
      email: d.email ?? null,
      phone: d.phone ?? null,
      country: d.country ?? null,
      notes: d.notes ?? null,
      createdAt: d.created_at,
      grantCount: d.grants?.length ?? 0,
      totalGranted: (d.grants ?? []).reduce((s: number, g: any) => s + parseFloat(g.amount), 0),
    }));

    return { success: true, data: donors };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load donors' };
  }
}

export async function createDonor(data: CreateDonorData): Promise<{ success: boolean; id?: string; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; id: string }>('app-actions', {
    operation: 'create-donor',
    ...data,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to create donor' };
  return { success: true, id: res.data?.id };
}

export async function updateDonor(id: string, data: Partial<CreateDonorData>): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'update-donor',
    id,
    ...data,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update donor' };
  return { success: true };
}

export async function deleteDonor(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-donor',
    id,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete donor' };
  return { success: true };
}

// ─── Grants ────────────────────────────────────────────────────────────────────

export async function getGrants(donorId?: string): Promise<{ success: boolean; data?: Grant[]; error?: string }> {
  try {
    const branchId = scopedBranchId();

    let q = supabase
      .from('grants')
      .select(`
        id, donor_id, branch_id, title, description, amount, currency,
        start_date, end_date, status, created_at,
        donor:donors!donor_id(name),
        branch:branches!branch_id(name),
        transactions:grant_transactions(amount, type)
      `)
      .order('created_at', { ascending: false });

    if (branchId) q = q.eq('branch_id', branchId);
    if (donorId) q = q.eq('donor_id', donorId);

    const { data, error } = await q;
    if (error) throw error;

    const grants: Grant[] = ((data ?? []) as any[]).map((g) => {
      const txs: any[] = g.transactions ?? [];
      const spent = txs.filter((t) => t.type === 'expense').reduce((s: number, t: any) => s + parseFloat(t.amount), 0);
      const income = txs.filter((t) => t.type === 'income').reduce((s: number, t: any) => s + parseFloat(t.amount), 0);
      const total = parseFloat(g.amount) + income;
      const remaining = Math.max(0, total - spent);
      return {
        id: g.id,
        donorId: g.donor_id,
        donorName: g.donor?.name ?? '',
        branchId: g.branch_id,
        branchName: g.branch?.name ?? null,
        title: g.title,
        description: g.description ?? null,
        amount: parseFloat(g.amount),
        currency: g.currency,
        startDate: g.start_date ?? null,
        endDate: g.end_date ?? null,
        status: g.status as GrantStatus,
        createdAt: g.created_at,
        spent,
        remaining,
        spentPct: total > 0 ? Math.round((spent / total) * 100) : 0,
      };
    });

    return { success: true, data: grants };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load grants' };
  }
}

export async function createGrant(data: CreateGrantData): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'create-grant',
    ...data,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to create grant' };
  return { success: true };
}

export async function updateGrantStatus(id: string, status: GrantStatus): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'update-grant-status',
    id,
    status,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update grant' };
  return { success: true };
}

export async function deleteGrant(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-grant',
    id,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete grant' };
  return { success: true };
}

// ─── Transactions ──────────────────────────────────────────────────────────────

export async function getGrantTransactions(grantId: string): Promise<{ success: boolean; data?: GrantTransaction[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('grant_transactions')
      .select('*')
      .eq('grant_id', grantId)
      .order('tx_date', { ascending: false });

    if (error) throw error;

    const txs: GrantTransaction[] = ((data ?? []) as any[]).map((t) => ({
      id: t.id,
      grantId: t.grant_id,
      description: t.description,
      amount: parseFloat(t.amount),
      type: t.type as TxType,
      txDate: t.tx_date,
      notes: t.notes ?? null,
      createdAt: t.created_at,
    }));

    return { success: true, data: txs };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load transactions' };
  }
}

export async function createGrantTransaction(data: CreateTxData): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'create-grant-transaction',
    ...data,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to record transaction' };
  return { success: true };
}

export async function deleteGrantTransaction(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-grant-transaction',
    id,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete transaction' };
  return { success: true };
}
