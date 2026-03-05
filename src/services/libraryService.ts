import { supabase } from '@/lib/supabase';

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
}

export async function getBooks() {
  try {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

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
        branch_id: bookData.branch_id || null,
        added_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as BookRow };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create book' };
  }
}

export async function updateBook(bookId: string, updates: UpdateBookData) {
  try {
    const { data, error } = await supabase
      .from('books')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', bookId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as BookRow };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update book' };
  }
}

export async function deleteBook(bookId: string) {
  try {
    const { error } = await supabase
      .from('books')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bookId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete book' };
  }
}
