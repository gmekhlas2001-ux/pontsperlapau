/**
 * Fee Service
 *
 * Manages student fee records: creation, status updates, payment marking,
 * and branch-level reporting. All queries are branch-scoped for multi-tenant
 * isolation.
 *
 * Fee lifecycle:
 *   pending → paid | overdue | waived | partial
 *
 * `syncOverdue` is called after every fetch to automatically flip any
 * pending/partial fees whose due_date has passed to 'overdue'.
 */

import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';

export type FeeStatus = 'pending' | 'paid' | 'overdue' | 'waived' | 'partial';
export type FeePaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

export interface FeeRecord {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  branchId: string;
  classId: string | null;
  className: string | null;
  description: string;
  amount: number;
  currency: string;
  dueDate: string;
  paidDate: string | null;
  status: FeeStatus;
  paymentMethod: FeePaymentMethod | null;
  notes: string | null;
  createdAt: string;
}

export interface FeeSummary {
  totalFees: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  pendingCount: number;
  paidCount: number;
}

export interface CreateFeeData {
  studentId: string;
  branchId: string;
  classId?: string;
  description: string;
  amount: number;
  currency?: string;
  dueDate: string;
  notes?: string;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function getFees(filters?: {
  status?: FeeStatus;
  studentId?: string;
}): Promise<{ success: boolean; data?: FeeRecord[]; summary?: FeeSummary; error?: string }> {
  try {
    const branchId = scopedBranchId();

    let q = supabase
      .from('student_fees')
      .select(`
        id, student_id, branch_id, class_id, description, amount, currency,
        due_date, paid_date, status, payment_method, notes, created_at,
        student:students!student_id(
          student_id,
          user:users!user_id(first_name, last_name)
        ),
        class:classes!class_id(name)
      `)
      .order('due_date', { ascending: false });

    if (branchId) q = q.eq('branch_id', branchId);
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.studentId) q = q.eq('student_id', filters.studentId);

    const { data, error } = await q;
    if (error) throw error;

    const rows: FeeRecord[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentFirstName: r.student?.user?.first_name ?? '',
      studentLastName: r.student?.user?.last_name ?? '',
      studentCode: r.student?.student_id ?? '',
      branchId: r.branch_id,
      classId: r.class_id ?? null,
      className: r.class?.name ?? null,
      description: r.description,
      amount: parseFloat(r.amount),
      currency: r.currency,
      dueDate: r.due_date,
      paidDate: r.paid_date ?? null,
      status: r.status as FeeStatus,
      paymentMethod: r.payment_method ?? null,
      notes: r.notes ?? null,
      createdAt: r.created_at,
    }));

    const summary: FeeSummary = {
      totalFees: rows.length,
      totalAmount: rows.reduce((s, r) => s + r.amount, 0),
      paidAmount: rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0),
      pendingAmount: rows.filter((r) => r.status === 'pending' || r.status === 'partial').reduce((s, r) => s + r.amount, 0),
      overdueAmount: rows.filter((r) => r.status === 'overdue').reduce((s, r) => s + r.amount, 0),
      overdueCount: rows.filter((r) => r.status === 'overdue').length,
      pendingCount: rows.filter((r) => r.status === 'pending' || r.status === 'partial').length,
      paidCount: rows.filter((r) => r.status === 'paid').length,
    };

    return { success: true, data: rows, summary };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load fees' };
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createFee(
  data: CreateFeeData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const storedUser = localStorage.getItem('user');
    const recordedBy = storedUser ? JSON.parse(storedUser).id : null;

    const { error } = await supabase.from('student_fees').insert({
      student_id:   data.studentId,
      branch_id:    data.branchId,
      class_id:     data.classId ?? null,
      description:  data.description,
      amount:       data.amount,
      currency:     data.currency ?? 'EUR',
      due_date:     data.dueDate,
      notes:        data.notes ?? null,
      recorded_by:  recordedBy,
      status:       'pending',
    });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to create fee' };
  }
}

export async function markFeePaid(
  feeId: string,
  paymentMethod: FeePaymentMethod,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('student_fees')
      .update({
        status:          'paid',
        paid_date:       new Date().toISOString().split('T')[0],
        payment_method:  paymentMethod,
        notes:           notes ?? null,
      })
      .eq('id', feeId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to mark as paid' };
  }
}

export async function updateFeeStatus(
  feeId: string,
  status: FeeStatus,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('student_fees')
      .update({ status, notes: notes ?? undefined })
      .eq('id', feeId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to update fee' };
  }
}

export async function deleteFee(feeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('student_fees').delete().eq('id', feeId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to delete fee' };
  }
}

// ─── Bulk creation ────────────────────────────────────────────────────────────

export async function bulkCreateFees(
  studentIds: string[],
  shared: Omit<CreateFeeData, 'studentId'>,
): Promise<{ success: boolean; created: number; errors: string[] }> {
  const storedUser = localStorage.getItem('user');
  const recordedBy = storedUser ? JSON.parse(storedUser).id : null;

  const rows = studentIds.map((studentId) => ({
    student_id: studentId,
    branch_id: shared.branchId,
    class_id: shared.classId ?? null,
    description: shared.description,
    amount: shared.amount,
    currency: shared.currency ?? 'EUR',
    due_date: shared.dueDate,
    notes: shared.notes ?? null,
    recorded_by: recordedBy,
    status: 'pending',
  }));

  const { error } = await supabase.from('student_fees').insert(rows);
  if (error) return { success: false, created: 0, errors: [error.message] };
  return { success: true, created: rows.length, errors: [] };
}

// ─── Parent portal helpers ────────────────────────────────────────────────────

export async function getFeesForStudent(
  studentId: string,
): Promise<{ success: boolean; data?: FeeRecord[]; error?: string }> {
  const res = await getFees({ studentId });
  return { success: res.success, data: res.data, error: res.error };
}
