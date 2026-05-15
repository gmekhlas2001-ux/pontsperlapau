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

export async function getBooks() {
  try {
    const branchId = scopedBranchId();

    let query = supabase
      .from('books')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data as BookRow[] };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch books' };
  }
}

export async function createBook(bookData: CreateBookData) {
  try {
    const res = await callEdgeFunction<{ success: boolean; data: BookRow }>('app-actions', {
      operation: 'create-book',
      ...bookData,
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
    // Normalise empty strings to null for nullable text columns so
    // UNIQUE constraints (e.g. books_isbn_key) don't reject "" duplicates.
    const cleaned: Record<string, unknown> = { ...updates };
    for (const k of ['isbn', 'publisher', 'category', 'description', 'language', 'location_shelf'] as const) {
      if (cleaned[k] === '') cleaned[k] = null;
    }
    const res = await callEdgeFunction<{ success: boolean; data: BookRow }>('app-actions', {
      operation: 'update-book',
      bookId,
      updates: cleaned,
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
