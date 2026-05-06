import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';

export interface Branch {
  id: string;
  name: string;
  province: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  established_date: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface BranchWithStats extends Branch {
  staffCount: number;
  studentCount: number;
  bookCount: number;
  totalMembers: number;
}

export interface CreateBranchData {
  name: string;
  province: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  established_date?: string;
  status?: 'active' | 'inactive';
}

export interface UpdateBranchData {
  name?: string;
  province?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  established_date?: string;
  status?: 'active' | 'inactive';
}

export async function getBranches() {
  try {
    const branchId = scopedBranchId();

    let query = supabase
      .from('branches')
      .select('*')
      .order('name', { ascending: true });

    if (branchId) {
      query = query.eq('id', branchId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data as Branch[] };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch branches' };
  }
}

export async function getBranchesWithStats(): Promise<{ success: boolean; data?: BranchWithStats[]; error?: string }> {
  try {
    const scopeBranch = scopedBranchId();

    const branchQuery = scopeBranch
      ? supabase.from('branches').select('*').eq('id', scopeBranch).order('name', { ascending: true })
      : supabase.from('branches').select('*').order('name', { ascending: true });

    const [branchResult, staffResult, studentResult, bookResult] = await Promise.all([
      branchQuery,
      scopeBranch
        ? supabase.from('staff').select('id, branch_id').eq('branch_id', scopeBranch)
        : supabase.from('staff').select('id, branch_id'),
      scopeBranch
        ? supabase.from('students').select('id, branch_id').eq('branch_id', scopeBranch)
        : supabase.from('students').select('id, branch_id'),
      scopeBranch
        ? supabase.from('books').select('id, branch_id').eq('branch_id', scopeBranch)
        : supabase.from('books').select('id, branch_id'),
    ]);

    if (branchResult.error) throw branchResult.error;

    const branches = (branchResult.data ?? []) as Branch[];
    const staffRows = (staffResult.data ?? []) as Array<{ id: string; branch_id: string | null }>;
    const studentRows = (studentResult.data ?? []) as Array<{ id: string; branch_id: string | null }>;
    const bookRows = (bookResult.data ?? []) as Array<{ id: string; branch_id: string | null }>;

    const result: BranchWithStats[] = branches.map((branch) => {
      const staffCount = staffRows.filter((s) => s.branch_id === branch.id).length;
      const studentCount = studentRows.filter((s) => s.branch_id === branch.id).length;
      const bookCount = bookRows.filter((b) => b.branch_id === branch.id).length;
      return {
        ...branch,
        staffCount,
        studentCount,
        bookCount,
        totalMembers: staffCount + studentCount,
      };
    });

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch branch stats' };
  }
}

// User columns we expose. Never select password_hash.
const USER_COLUMNS = `
  id, email, first_name, last_name, father_name, phone_number,
  date_of_birth, gender, role, status, profile_picture_url,
  branch_id, passport_number, last_login, created_at, updated_at
`;

export async function getBranchMembers(branchId: string) {
  try {
    const [staffResult, studentResult, bookResult] = await Promise.all([
      supabase
        .from('staff')
        .select(`*, user:users!user_id(${USER_COLUMNS})`)
        .eq('branch_id', branchId),
      supabase
        .from('students')
        .select(`*, user:users!user_id(${USER_COLUMNS})`)
        .eq('branch_id', branchId),
      supabase
        .from('books')
        .select('*')
        .eq('branch_id', branchId)
        .is('deleted_at', null),
    ]);

    return {
      success: true,
      staff: staffResult.data ?? [],
      students: studentResult.data ?? [],
      books: bookResult.data ?? [],
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch branch members' };
  }
}

export async function createBranch(data: CreateBranchData) {
  try {
    const { data: branch, error } = await supabase
      .from('branches')
      .insert({
        name: data.name,
        province: data.province,
        city: data.city || null,
        address: data.address || null,
        phone: data.phone || null,
        email: data.email || null,
        established_date: data.established_date || null,
        status: data.status || 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: branch as Branch };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create branch' };
  }
}

export async function updateBranch(branchId: string, data: UpdateBranchData) {
  try {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.province !== undefined) updates.province = data.province;
    if (data.city !== undefined) updates.city = data.city;
    if (data.address !== undefined) updates.address = data.address;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.email !== undefined) updates.email = data.email;
    if (data.established_date !== undefined) updates.established_date = data.established_date;
    if (data.status !== undefined) updates.status = data.status;

    const { data: branch, error } = await supabase
      .from('branches')
      .update(updates)
      .eq('id', branchId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: branch as Branch };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update branch' };
  }
}

export async function deleteBranch(branchId: string) {
  try {
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete branch' };
  }
}
