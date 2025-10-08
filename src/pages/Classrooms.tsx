import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/Toast';
import {
  GraduationCap,
  Search,
  Plus,
  Eye,
  Trash2,
  X,
  Users,
  Calendar,
  Building2,
  User,
  Clock,
  UserPlus,
  CheckCircle,
  Edit,
  UserMinus
} from 'lucide-react';

interface Classroom {
  id: string;
  name: string;
  code: string;
  description: string | null;
  subject: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  schedule: string | null;
  room_number: string | null;
  capacity: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  enrollment_count: number;
  created_at: string;
}

interface Enrollment {
  id: string;
  classroom_id: string;
  student_id: string;
  student_name: string;
  enrollment_date: string;
  status: string;
  grade: string | null;
  notes: string | null;
}

export function Classrooms() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddClassroom, setShowAddClassroom] = useState(false);
  const [isEditingClassroom, setIsEditingClassroom] = useState(false);
  const [showClassroomDetails, setShowClassroomDetails] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [userProfileId, setUserProfileId] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [classroomForm, setClassroomForm] = useState({
    name: '',
    code: '',
    description: '',
    subject: '',
    teacher_id: '',
    branch_id: '',
    schedule: '',
    room_number: '',
    capacity: '',
    start_date: '',
    end_date: '',
  });

  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  useEffect(() => {
    loadUserProfile();
    loadClassrooms();
    loadTeachers();
    loadStudents();
    loadBranches();
  }, []);

  async function loadUserProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, role_id')
      .eq('auth_user_id', user?.id)
      .maybeSingle();

    if (data) {
      setUserRole(data.role_id);
      setUserProfileId(data.id);
    }
  }

  async function loadBranches() {
    const { data } = await supabase.from('branches').select('id, name').order('name');
    setBranches(data || []);
  }

  async function loadTeachers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role_id')
      .in('role_id', ['admin', 'teacher', 'librarian'])
      .in('status', ['approved', 'active'])
      .order('full_name');

    setTeachers(data || []);
  }

  async function loadStudents() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role_id', 'student')
      .eq('status', 'approved')
      .order('full_name');

    setStudents(data || []);
  }

  async function loadClassrooms() {
    try {
      const { data, error } = await supabase
        .from('classrooms')
        .select('*, branches(name), profiles!classrooms_teacher_id_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const classroomsWithCounts = await Promise.all(
        (data || []).map(async (classroom) => {
          const { count } = await supabase
            .from('classroom_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('classroom_id', classroom.id)
            .eq('status', 'active');

          return {
            id: classroom.id,
            name: classroom.name,
            code: classroom.code,
            description: classroom.description,
            subject: classroom.subject,
            teacher_id: classroom.teacher_id,
            teacher_name: classroom.profiles?.full_name || null,
            branch_id: classroom.branch_id,
            branch_name: classroom.branches?.name || null,
            schedule: classroom.schedule,
            room_number: classroom.room_number,
            capacity: classroom.capacity,
            status: classroom.status,
            start_date: classroom.start_date,
            end_date: classroom.end_date,
            enrollment_count: count || 0,
            created_at: classroom.created_at,
          };
        })
      );

      setClassrooms(classroomsWithCounts);
    } catch (error) {
      console.error('Error loading classrooms:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadEnrollments(classroomId: string) {
    try {
      const { data, error } = await supabase
        .from('classroom_enrollments')
        .select('*, profiles!classroom_enrollments_student_id_fkey(full_name)')
        .eq('classroom_id', classroomId)
        .order('enrollment_date', { ascending: false });

      if (error) throw error;

      const enrollmentsWithNames = data?.map(enrollment => ({
        id: enrollment.id,
        classroom_id: enrollment.classroom_id,
        student_id: enrollment.student_id,
        student_name: enrollment.profiles?.full_name || 'Unknown',
        enrollment_date: enrollment.enrollment_date,
        status: enrollment.status,
        grade: enrollment.grade,
        notes: enrollment.notes,
      })) || [];

      setEnrollments(enrollmentsWithNames);
    } catch (error) {
      console.error('Error loading enrollments:', error);
    }
  }

  async function handleAddClassroom(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (isEditingClassroom && selectedClassroom) {
        const { error } = await supabase.from('classrooms').update({
          name: classroomForm.name,
          code: classroomForm.code,
          description: classroomForm.description || null,
          subject: classroomForm.subject || null,
          teacher_id: classroomForm.teacher_id || null,
          branch_id: classroomForm.branch_id || null,
          schedule: classroomForm.schedule || null,
          room_number: classroomForm.room_number || null,
          capacity: classroomForm.capacity ? parseInt(classroomForm.capacity) : null,
          start_date: classroomForm.start_date || null,
          end_date: classroomForm.end_date || null,
        }).eq('id', selectedClassroom.id);

        if (error) throw error;

        setToast({ message: 'Classroom updated successfully!', type: 'success' });
      } else {
        const { data, error } = await supabase.from('classrooms').insert({
          name: classroomForm.name,
          code: classroomForm.code,
          description: classroomForm.description || null,
          subject: classroomForm.subject || null,
          teacher_id: classroomForm.teacher_id || null,
          branch_id: classroomForm.branch_id || null,
          schedule: classroomForm.schedule || null,
          room_number: classroomForm.room_number || null,
          capacity: classroomForm.capacity ? parseInt(classroomForm.capacity) : null,
          start_date: classroomForm.start_date || null,
          end_date: classroomForm.end_date || null,
          status: 'active',
        }).select().single();

        if (error) throw error;

        if (data && selectedStudents.length > 0) {
          const enrollments = selectedStudents.map(studentId => ({
            classroom_id: data.id,
            student_id: studentId,
            status: 'active',
          }));

          await supabase.from('classroom_enrollments').insert(enrollments);
        }

        setToast({ message: 'Classroom created successfully!', type: 'success' });
      }

      setShowAddClassroom(false);
      setIsEditingClassroom(false);
      setClassroomForm({
        name: '',
        code: '',
        description: '',
        subject: '',
        teacher_id: '',
        branch_id: '',
        schedule: '',
        room_number: '',
        capacity: '',
        start_date: '',
        end_date: '',
      });
      setSelectedStudents([]);
      loadClassrooms();
    } catch (error: any) {
      setToast({ message: `Error ${isEditingClassroom ? 'updating' : 'creating'} classroom: ` + error.message, type: 'error' });
    }
  }

  async function handleDeleteClassroom(classroom: Classroom) {
    if (!confirm(`Are you sure you want to delete "${classroom.name}"?`)) return;

    try {
      const { error } = await supabase.from('classrooms').delete().eq('id', classroom.id);

      if (error) throw error;

      setToast({ message: 'Classroom deleted successfully!', type: 'success' });
      loadClassrooms();
    } catch (error: any) {
      setToast({ message: 'Error deleting classroom: ' + error.message, type: 'error' });
    }
  }

  async function handleEnrollStudent() {
    if (!selectedClassroom || selectedStudents.length === 0) return;

    try {
      const { data: existingEnrollments } = await supabase
        .from('classroom_enrollments')
        .select('student_id')
        .eq('classroom_id', selectedClassroom.id)
        .in('student_id', selectedStudents);

      const alreadyEnrolled = new Set(existingEnrollments?.map(e => e.student_id) || []);
      const newStudents = selectedStudents.filter(id => !alreadyEnrolled.has(id));

      if (newStudents.length === 0) {
        setToast({ message: 'All selected students are already enrolled', type: 'error' });
        return;
      }

      const enrollments = newStudents.map(studentId => ({
        classroom_id: selectedClassroom.id,
        student_id: studentId,
        status: 'active',
      }));

      const { error } = await supabase.from('classroom_enrollments').insert(enrollments);

      if (error) throw error;

      const message = alreadyEnrolled.size > 0
        ? `${newStudents.length} student(s) enrolled. ${alreadyEnrolled.size} already enrolled.`
        : 'Students enrolled successfully!';

      setToast({ message, type: 'success' });
      setShowEnrollModal(false);
      setSelectedStudents([]);
      loadClassrooms();
      if (selectedClassroom) {
        loadEnrollments(selectedClassroom.id);
      }
    } catch (error: any) {
      setToast({ message: 'Error enrolling students: ' + error.message, type: 'error' });
    }
  }

  async function handleSelfEnroll(classroomCode: string) {
    try {
      const { data: classroom } = await supabase
        .from('classrooms')
        .select('id')
        .eq('code', classroomCode)
        .eq('status', 'active')
        .maybeSingle();

      if (!classroom) {
        setToast({ message: 'Invalid classroom code', type: 'error' });
        return;
      }

      const { data: existingEnrollment } = await supabase
        .from('classroom_enrollments')
        .select('id')
        .eq('classroom_id', classroom.id)
        .eq('student_id', userProfileId)
        .maybeSingle();

      if (existingEnrollment) {
        setToast({ message: 'You are already enrolled in this classroom', type: 'error' });
        return;
      }

      const { error } = await supabase.from('classroom_enrollments').insert({
        classroom_id: classroom.id,
        student_id: userProfileId,
        status: 'active',
      });

      if (error) throw error;

      setToast({ message: 'Enrolled successfully!', type: 'success' });
      loadClassrooms();
    } catch (error: any) {
      setToast({ message: 'Error enrolling: ' + error.message, type: 'error' });
    }
  }

  async function handleDropEnrollment(enrollmentId: string) {
    if (!confirm('Are you sure you want to drop this enrollment?')) return;

    try {
      const { error } = await supabase
        .from('classroom_enrollments')
        .update({ status: 'dropped' })
        .eq('id', enrollmentId);

      if (error) throw error;

      setToast({ message: 'Enrollment dropped', type: 'success' });
      if (selectedClassroom) {
        loadEnrollments(selectedClassroom.id);
      }
      loadClassrooms();
    } catch (error: any) {
      setToast({ message: 'Error dropping enrollment: ' + error.message, type: 'error' });
    }
  }

  function openClassroomDetails(classroom: Classroom) {
    setSelectedClassroom(classroom);
    loadEnrollments(classroom.id);
    setShowClassroomDetails(true);
  }

  function openEnrollModal(classroom: Classroom) {
    setSelectedClassroom(classroom);
    setSelectedStudents([]);
    setShowEnrollModal(true);
  }

  function openEditClassroom(classroom: Classroom) {
    setSelectedClassroom(classroom);
    setIsEditingClassroom(true);
    setClassroomForm({
      name: classroom.name,
      code: classroom.code,
      description: classroom.description || '',
      subject: classroom.subject || '',
      teacher_id: classroom.teacher_id || '',
      branch_id: classroom.branch_id || '',
      schedule: classroom.schedule || '',
      room_number: classroom.room_number || '',
      capacity: classroom.capacity?.toString() || '',
      start_date: classroom.start_date || '',
      end_date: classroom.end_date || '',
    });
    setShowAddClassroom(true);
  }

  async function handleUnenrollStudent(enrollmentId: string) {
    if (!confirm('Are you sure you want to unenroll this student? This will permanently remove them from the classroom.')) return;

    try {
      const { error } = await supabase
        .from('classroom_enrollments')
        .delete()
        .eq('id', enrollmentId);

      if (error) throw error;

      setToast({ message: 'Student unenrolled successfully', type: 'success' });
      if (selectedClassroom) {
        loadEnrollments(selectedClassroom.id);
      }
      loadClassrooms();
    } catch (error: any) {
      setToast({ message: 'Error unenrolling student: ' + error.message, type: 'error' });
    }
  }

  const filteredClassrooms = classrooms.filter(classroom =>
    classroom.name.toLowerCase().includes(search.toLowerCase()) ||
    classroom.subject?.toLowerCase().includes(search.toLowerCase()) ||
    classroom.teacher_name?.toLowerCase().includes(search.toLowerCase()) ||
    classroom.code.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = userRole === 'admin';
  const isTeacher = userRole === 'teacher';
  const isStudent = userRole === 'student';

  const myClassrooms = isTeacher
    ? classrooms.filter(c => c.teacher_id === userProfileId)
    : isStudent
    ? classrooms.filter(c =>
        enrollments.some(e => e.classroom_id === c.id && e.student_id === userProfileId && e.status === 'active')
      )
    : [];

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Classrooms</h1>
          <p className="text-slate-600">Manage classrooms and enrollments</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddClassroom(true)}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            Add Classroom
          </button>
        )}
      </div>

      {isStudent && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
          <h3 className="font-medium text-cyan-900 mb-2">Enroll in a Class</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter classroom code"
              id="classroomCode"
              className="flex-1 px-4 py-2 border border-cyan-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
            />
            <button
              onClick={() => {
                const input = document.getElementById('classroomCode') as HTMLInputElement;
                if (input.value) handleSelfEnroll(input.value);
              }}
              className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
            >
              Enroll
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search classrooms by name, subject, teacher, or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClassrooms.map((classroom) => (
          <div key={classroom.id} className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 mb-1">{classroom.name}</h3>
                <p className="text-sm text-slate-600 mb-2">{classroom.code}</p>
                {classroom.subject && (
                  <span className="inline-block px-2 py-1 bg-cyan-100 text-cyan-700 rounded-lg text-xs font-medium">
                    {classroom.subject}
                  </span>
                )}
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0">
                {classroom.name.charAt(0)}
              </div>
            </div>

            <div className="space-y-2 mb-4 text-sm">
              {classroom.teacher_name && (
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="w-4 h-4" />
                  <span>{classroom.teacher_name}</span>
                </div>
              )}
              {classroom.branch_name && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Building2 className="w-4 h-4" />
                  <span>{classroom.branch_name}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <Users className="w-4 h-4" />
                <span>{classroom.enrollment_count} students{classroom.capacity ? ` / ${classroom.capacity}` : ''}</span>
              </div>
              {classroom.schedule && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span>{classroom.schedule}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openClassroomDetails(classroom)}
                className="flex-1 min-w-[100px] px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Eye className="w-4 h-4" />
                Details
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => openEditClassroom(classroom)}
                    className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                    title="Edit Classroom"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEnrollModal(classroom)}
                    className="px-3 py-2 bg-cyan-100 text-cyan-600 rounded-lg hover:bg-cyan-200 transition-colors"
                    title="Add Students"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClassroom(classroom)}
                    className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">{isEditingClassroom ? 'Edit Classroom' : 'Add Classroom'}</h2>
              <button onClick={() => { setShowAddClassroom(false); setIsEditingClassroom(false); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddClassroom} className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Classroom Name *</label>
                  <input
                    type="text"
                    required
                    value={classroomForm.name}
                    onChange={(e) => setClassroomForm({ ...classroomForm, name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Classroom Code *</label>
                  <input
                    type="text"
                    required
                    value={classroomForm.code}
                    onChange={(e) => setClassroomForm({ ...classroomForm, code: e.target.value })}
                    placeholder="e.g., MATH101"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Subject</label>
                  <input
                    type="text"
                    value={classroomForm.subject}
                    onChange={(e) => setClassroomForm({ ...classroomForm, subject: e.target.value })}
                    placeholder="e.g., Mathematics"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Teacher *</label>
                  <select
                    required
                    value={classroomForm.teacher_id}
                    onChange={(e) => setClassroomForm({ ...classroomForm, teacher_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select Teacher</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Branch</label>
                  <select
                    value={classroomForm.branch_id}
                    onChange={(e) => setClassroomForm({ ...classroomForm, branch_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select Branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Room Number</label>
                  <input
                    type="text"
                    value={classroomForm.room_number}
                    onChange={(e) => setClassroomForm({ ...classroomForm, room_number: e.target.value })}
                    placeholder="e.g., Room 101"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={classroomForm.capacity}
                    onChange={(e) => setClassroomForm({ ...classroomForm, capacity: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Schedule</label>
                  <input
                    type="text"
                    value={classroomForm.schedule}
                    onChange={(e) => setClassroomForm({ ...classroomForm, schedule: e.target.value })}
                    placeholder="e.g., Mon/Wed 10:00-11:30"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={classroomForm.start_date}
                    onChange={(e) => setClassroomForm({ ...classroomForm, start_date: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={classroomForm.end_date}
                    onChange={(e) => setClassroomForm({ ...classroomForm, end_date: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  rows={2}
                  value={classroomForm.description}
                  onChange={(e) => setClassroomForm({ ...classroomForm, description: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Enroll Students (Optional)</label>
                <div className="border border-slate-300 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
                  {students.map((student) => (
                    <label key={student.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudents([...selectedStudents, student.id]);
                          } else {
                            setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                          }
                        }}
                        className="w-4 h-4 text-cyan-600"
                      />
                      <span className="text-sm text-slate-900">{student.full_name}</span>
                    </label>
                  ))}
                </div>
                {selectedStudents.length > 0 && (
                  <p className="text-sm text-slate-600 mt-2">{selectedStudents.length} student(s) selected</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700"
                >
                  {isEditingClassroom ? 'Update Classroom' : 'Create Classroom'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddClassroom(false); setIsEditingClassroom(false); }}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEnrollModal && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Enroll Students</h2>
              <button onClick={() => setShowEnrollModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-slate-50 p-4 rounded-xl mb-4">
                <h3 className="font-bold text-slate-900">{selectedClassroom.name}</h3>
                <p className="text-sm text-slate-600">{selectedClassroom.code}</p>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {students.map((student) => (
                  <label key={student.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-3 rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudents([...selectedStudents, student.id]);
                        } else {
                          setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                        }
                      }}
                      className="w-4 h-4 text-cyan-600"
                    />
                    <span className="text-slate-900">{student.full_name}</span>
                  </label>
                ))}
              </div>

              {selectedStudents.length > 0 && (
                <p className="text-sm text-slate-600 mt-4">{selectedStudents.length} student(s) selected</p>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleEnrollStudent}
                  disabled={selectedStudents.length === 0}
                  className="flex-1 px-6 py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enroll Selected
                </button>
                <button
                  onClick={() => setShowEnrollModal(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showClassroomDetails && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Classroom Details</h2>
              <button onClick={() => setShowClassroomDetails(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedClassroom.name}</h3>
                <p className="text-slate-600 mb-2">Code: {selectedClassroom.code}</p>
                {selectedClassroom.description && (
                  <p className="text-slate-700 bg-slate-50 p-4 rounded-xl">{selectedClassroom.description}</p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {selectedClassroom.subject && <DetailItem label="Subject" value={selectedClassroom.subject} />}
                {selectedClassroom.teacher_name && <DetailItem label="Teacher" value={selectedClassroom.teacher_name} />}
                {selectedClassroom.branch_name && <DetailItem label="Branch" value={selectedClassroom.branch_name} />}
                {selectedClassroom.room_number && <DetailItem label="Room" value={selectedClassroom.room_number} />}
                {selectedClassroom.schedule && <DetailItem label="Schedule" value={selectedClassroom.schedule} />}
                {selectedClassroom.capacity && <DetailItem label="Capacity" value={selectedClassroom.capacity.toString()} />}
                <DetailItem label="Enrolled" value={selectedClassroom.enrollment_count.toString()} />
                {selectedClassroom.start_date && <DetailItem label="Start Date" value={new Date(selectedClassroom.start_date).toLocaleDateString()} />}
                {selectedClassroom.end_date && <DetailItem label="End Date" value={new Date(selectedClassroom.end_date).toLocaleDateString()} />}
              </div>

              <div>
                <h4 className="font-bold text-lg mb-4">Enrolled Students ({enrollments.filter(e => e.status === 'active').length})</h4>
                <div className="space-y-2">
                  {enrollments.filter(e => e.status === 'active').map((enrollment) => (
                    <div key={enrollment.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center text-cyan-700 font-bold">
                          {enrollment.student_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{enrollment.student_name}</p>
                          <p className="text-xs text-slate-500">
                            Enrolled: {new Date(enrollment.enrollment_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {(isAdmin || (isTeacher && selectedClassroom.teacher_id === userProfileId)) && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDropEnrollment(enrollment.id)}
                            className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                            title="Mark as dropped (student can re-enroll)"
                          >
                            Drop
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleUnenrollStudent(enrollment.id)}
                              className="px-3 py-1 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200 flex items-center gap-1"
                              title="Permanently remove student"
                            >
                              <UserMinus className="w-3 h-3" />
                              Unenroll
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {enrollments.filter(e => e.status === 'active').length === 0 && (
                    <p className="text-center py-8 text-slate-500">No students enrolled yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 p-3 rounded-xl">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-slate-900 font-medium">{value}</p>
    </div>
  );
}
