/**
 * Library management service.
 *
 * Manages the book catalog (CRUD) for the built-in library module.
 * `available_copies` is set equal to `total_copies` on creation and should be
 * decremented/incremented by borrowing operations.
 * All queries are branch-scoped; deletes are soft.
 */

import { supabase } from '@/lib/supabase';
import { logActivity } from '@/services/activityService';
import { scopedBranchId } from '@/lib/scope';
import { callEdgeFunction } from '@/lib/edge';
import { fetchAllPages } from '@/lib/pagination';

export interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  publication_year: number | null;
  category: string | null;
  description: string | null;
  language: string | null;
  total_copies: number;
  available_copies: number;
  physical_condition: 'excellent' | 'good' | 'fair' | 'poor' | null;
  cover_image_url: string | null;
  location_shelf: string | null;
  added_by: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBookData {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publication_year?: number;
  category?: string;
  description?: string;
  language?: string;
  total_copies: number;
  location_shelf?: string;
  branch_id?: string;
  cover_image_url?: string | null;
}

export interface UpdateBookData {
  title?: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  publication_year?: number;
  category?: string;
  description?: string;
  language?: string;
  total_copies?: number;
  available_copies?: number;
  location_shelf?: string;
  physical_condition?: 'excellent' | 'good' | 'fair' | 'poor';
  branch_id?: string;
  cover_image_url?: string | null;
}

function cleanOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanOptionalYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year <= 0) return null;
  return year;
}

function cleanBookPayload<T extends CreateBookData | UpdateBookData>(payload: T): T {
  const cleaned: Record<string, unknown> = { ...payload };

  for (const key of ['isbn', 'publisher', 'category', 'description', 'language', 'location_shelf', 'branch_id'] as const) {
    if (key in cleaned) cleaned[key] = cleanOptionalString(cleaned[key]);
  }

  if ('cover_image_url' in cleaned) {
    cleaned.cover_image_url = cleanOptionalString(cleaned.cover_image_url);
  }
  if ('publication_year' in cleaned) {
    cleaned.publication_year = cleanOptionalYear(cleaned.publication_year);
  }
  if ('total_copies' in cleaned) {
    cleaned.total_copies = Math.max(1, Number(cleaned.total_copies) || 1);
  }
  if ('available_copies' in cleaned) {
    cleaned.available_copies = Math.max(0, Number(cleaned.available_copies) || 0);
  }

  return cleaned as T;
}

export async function getBooks() {
  try {
    const branchId = scopedBranchId();

    const data = await fetchAllPages<BookRow>((from, to) => {
      let query = supabase.from('books').select('*').is('deleted_at', null)
        .order('created_at', { ascending: false }).range(from, to);
      if (branchId) query = query.eq('branch_id', branchId);
      return query as any;
    });
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch books' };
  }
}

export async function createBook(bookData: CreateBookData) {
  try {
    const res = await callEdgeFunction<{ success: boolean; data: BookRow }>('app-actions', {
      operation: 'create-book',
      ...cleanBookPayload(bookData),
    });
    if (!res.ok || !res.data?.data) throw new Error(res.error || 'Failed to create book');
    const data = res.data.data;
    logActivity({ action_type: 'INSERT', table_name: 'books', record_id: data.id, description: `Added book: ${data.title}` });
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create book' };
  }
}

export async function updateBook(bookId: string, updates: UpdateBookData) {
  try {
    const res = await callEdgeFunction<{ success: boolean; data: BookRow }>('app-actions', {
      operation: 'update-book',
      bookId,
      updates: cleanBookPayload(updates),
    });
    if (!res.ok || !res.data?.data) throw new Error(res.error || 'Failed to update book');
    const data = res.data.data;
    logActivity({ action_type: 'UPDATE', table_name: 'books', record_id: bookId, description: `Updated book: ${data.title}` });
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update book' };
  }
}

export async function deleteBook(bookId: string, bookTitle?: string) {
  try {
    const res = await callEdgeFunction('app-actions', {
      operation: 'delete-book',
      bookId,
    });
    if (!res.ok) throw new Error(res.error || 'Failed to delete book');
    logActivity({ action_type: 'DELETE', table_name: 'books', record_id: bookId, description: `Deleted book: ${bookTitle ?? bookId}` });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete book' };
  }
}
