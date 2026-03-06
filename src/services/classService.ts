import { supabase } from '@/lib/supabase';

export interface ClassTeacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  position: string;
  branchId: string | null;
  branchName: string | null;
}

export interface ClassRecord {
  id: string;
  name: string;
  description: string | null;
  teacherId: string;
  teacherFirstName: string;
  teacherLastName: string;
  scheduleDays: string[];
  scheduleTime: string | null;
  scheduleEndTime: string | null;
  location: string | null;
  maxCapacity: number;
  academicYear: string | null;
  semester: 'fall' | 'spring' | 'summer' | null;
  status: 'active' | 'inactive' | 'archived';
  branchId: string | null;
  branchName: string | null;
  createdAt: string;
}

export interface CreateClassData {
  name: string;
  description?: string;
  teacherId: string;
  scheduleDays: string[];
  scheduleTime?: string;
  scheduleEndTime?: string;
  location?: string;
  maxCapacity: number;
  academicYear?: string;
  semester?: 'fall' | 'spring' | 'summer';
  branchId?: string | null;
  createdBy?: string;
}

export interface UpdateClassData extends Partial<CreateClassData> {
  status?: 'active' | 'inactive' | 'archived';
}

export async function getClassesList() {
  try {
    const { data, error } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        description,
        teacher_id,
        schedule_day,
        schedule_time,
        schedule_end_time,
        location,
        max_capacity,
        academic_year,
        semester,
        status,
        branch_id,
        created_at,
        teacher:staff!teacher_id(
          id,
          user:users!user_id(first_name, last_name)
        ),
        branch:branches!branch_id(id, name)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const classes: ClassRecord[] = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      teacherId: c.teacher_id,
      teacherFirstName: c.teacher?.user?.first_name ?? '',
      teacherLastName: c.teacher?.user?.last_name ?? '',
      scheduleDays: c.schedule_day ?? [],
      scheduleTime: c.schedule_time,
      scheduleEndTime: c.schedule_end_time,
      location: c.location,
      maxCapacity: c.max_capacity,
      academicYear: c.academic_year,
      semester: c.semester,
      status: c.status,
      branchId: c.branch_id,
      branchName: c.branch?.name ?? null,
      createdAt: c.created_at,
    }));

    return { success: true, data: classes };
  } catch (error: any) {
    console.error('Error fetching classes:', error);
    return { success: false, error: error.message || 'Failed to fetch classes' };
  }
}

export async function createClass(data: CreateClassData) {
  try {
    const { error } = await supabase
      .from('classes')
      .insert({
        name: data.name,
        description: data.description || null,
        teacher_id: data.teacherId,
        schedule_day: data.scheduleDays,
        schedule_time: data.scheduleTime || null,
        schedule_end_time: data.scheduleEndTime || null,
        location: data.location || null,
        max_capacity: data.maxCapacity,
        academic_year: data.academicYear || null,
        semester: data.semester || null,
        branch_id: data.branchId || null,
        created_by: data.createdBy || null,
        status: 'active',
      });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error creating class:', error);
    return { success: false, error: error.message || 'Failed to create class' };
  }
}

export async function updateClass(classId: string, data: UpdateClassData) {
  try {
    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.teacherId !== undefined) updates.teacher_id = data.teacherId;
    if (data.scheduleDays !== undefined) updates.schedule_day = data.scheduleDays;
    if (data.scheduleTime !== undefined) updates.schedule_time = data.scheduleTime || null;
    if (data.scheduleEndTime !== undefined) updates.schedule_end_time = data.scheduleEndTime || null;
    if (data.location !== undefined) updates.location = data.location || null;
    if (data.maxCapacity !== undefined) updates.max_capacity = data.maxCapacity;
    if (data.academicYear !== undefined) updates.academic_year = data.academicYear || null;
    if (data.semester !== undefined) updates.semester = data.semester || null;
    if (data.branchId !== undefined) updates.branch_id = data.branchId || null;
    if (data.status !== undefined) updates.status = data.status;

    const { error } = await supabase
      .from('classes')
      .update(updates)
      .eq('id', classId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error updating class:', error);
    return { success: false, error: error.message || 'Failed to update class' };
  }
}

export async function deleteClass(classId: string) {
  try {
    const { error } = await supabase
      .from('classes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', classId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting class:', error);
    return { success: false, error: error.message || 'Failed to delete class' };
  }
}

export async function getTeachers() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        role,
        status,
        staff!user_id(
          id,
          position,
          branch_id,
          deleted_at,
          branch:branches!branch_id(id, name)
        )
      `)
      .eq('role', 'teacher')
      .eq('status', 'active');

    if (error) throw error;

    const teachers: ClassTeacher[] = (data || [])
      .map((u: any) => {
        const staffRecord = Array.isArray(u.staff)
          ? u.staff.find((s: any) => !s.deleted_at)
          : u.staff;
        return {
          id: staffRecord?.id ?? u.id,
          userId: u.id,
          firstName: u.first_name ?? '',
          lastName: u.last_name ?? '',
          position: staffRecord?.position ?? '',
          branchId: staffRecord?.branch_id ?? null,
          branchName: staffRecord?.branch?.name ?? null,
        };
      });

    return { success: true, data: teachers };
  } catch (error: any) {
    console.error('Error fetching teachers:', error);
    return { success: false, error: error.message || 'Failed to fetch teachers' };
  }
}

export async function getClassEnrollments(classId: string) {
  try {
    const { data, error } = await supabase
      .from('class_enrollments')
      .select(`
        id,
        student_id,
        enrollment_date,
        status,
        grade,
        attendance_percentage,
        student:students!student_id(
          id,
          student_id,
          user:users!user_id(first_name, last_name, email)
        )
      `)
      .eq('class_id', classId)
      .eq('status', 'active');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching enrollments:', error);
    return { success: false, error: error.message || 'Failed to fetch enrollments' };
  }
}
