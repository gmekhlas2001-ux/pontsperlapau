/**
 * Parent Service
 *
 * Manages parent-student links and provides the data a parent needs
 * to view their children's academic information.
 *
 * Data is read-only from the parent's perspective.
 */

import { callEdgeFunction } from '@/lib/edge';
import type { FeeRecord } from '@/services/feeService';

export interface ParentStudentLink {
  id: string;
  parentUserId: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
  createdAt: string;
  // joined
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  studentStatus: string;
  branchName: string | null;
}

export interface ChildSummary {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  studentStatus: string;
  branchName: string | null;
  relationship: string;
  isPrimary: boolean;
  // academic snapshot
  enrolledClasses: number;
  averageScore: number | null;
  attendancePct: number | null;
  pendingFeesCount: number;
  pendingFeesAmount: number;
}

// ─── Admin: manage links ───────────────────────────────────────────────────────

export async function getParentLinks(): Promise<{ success: boolean; data?: ParentStudentLink[]; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; data: ParentStudentLink[] }>('parent-links', {
    operation: 'list',
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to load parent links' };
  return { success: true, data: res.data?.data ?? [] };
}

export async function createParentLink(data: {
  parentUserId: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('parent-links', {
    operation: 'create',
    ...data,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to create link' };
  return { success: true };
}

export async function deleteParentLink(
  linkId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('parent-links', {
    operation: 'delete',
    linkId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete link' };
  return { success: true };
}

// ─── Parent portal: get my children ───────────────────────────────────────────

export async function getMyChildren(
  _parentUserId: string,
): Promise<{ success: boolean; data?: ChildSummary[]; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; data: ChildSummary[] }>('parent-links', {
    operation: 'my-children',
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to load children' };
  return { success: true, data: res.data?.data ?? [] };
}

export async function getMyChildFees(
  studentId: string,
): Promise<{ success: boolean; data?: FeeRecord[]; error?: string }> {
  const res = await callEdgeFunction<{ success: boolean; data: FeeRecord[] }>('parent-links', {
    operation: 'my-child-fees',
    studentId,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to load fees' };
  return { success: true, data: res.data?.data ?? [] };
}
