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
    const storedUser = localStorage.getItem('user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    const { data, error } = await supabase
      .from('books')
      .insert({
        title: bookData.title,
        author: bookData.author,
        isbn: bookData.isbn || null,
        publisher: bookData.publisher || null,
        publication_year: bookData.publication_year || null,
        category: bookData.category || null,
        description: bookData.description || null,
        language: bookData.language || 'English',
        total_copies: bookData.total_copies,
        available_copies: bookData.total_copies,
        location_shelf: bookData.location_shelf || null,
        cover_image_url: bookData.cover_image_url || null,
        branch_id: bookData.branch_id || null,
        added_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    logActivity({ action_type: 'INSERT', table_name: 'books', record_id: data.id, description: `Added book: ${data.title}` });
    return { success: true, data: data as BookRow };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create book' };
  }
}

// Raw PostgREST call — bypasses supabase-js entirely so no internal
// auth state (stale JWT, in-memory session) can override the anon key.
async function rawBooksPatch(bookId: string, body: Record<string, unknown>) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/books?id=eq.${encodeURIComponent(bookId)}`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anon}`,
      'apikey': anon,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateBook(bookId: string, updates: UpdateBookData) {
  try {
    // Normalise empty strings to null for nullable text columns so
    // UNIQUE constraints (e.g. books_isbn_key) don't reject "" duplicates.
    const cleaned: Record<string, unknown> = { ...updates };
    for (const k of ['isbn', 'publisher', 'category', 'description', 'language', 'location_shelf'] as const) {
      if (cleaned[k] === '') cleaned[k] = null;
    }
    const data = await rawBooksPatch(bookId, { ...cleaned, updated_at: new Date().toISOString() });
    logActivity({ action_type: 'UPDATE', table_name: 'books', record_id: bookId, description: `Updated book: ${data?.title ?? bookId}` });
    return { success: true, data: data as BookRow };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update book' };
  }
}

export async function deleteBook(bookId: string, bookTitle?: string) {
  try {
    // Soft delete — `getBooks` filters on `deleted_at IS NULL`.
    await rawBooksPatch(bookId, { deleted_at: new Date().toISOString() });
    logActivity({ action_type: 'DELETE', table_name: 'books', record_id: bookId, description: `Deleted book: ${bookTitle ?? bookId}` });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete book' };
  }
}
