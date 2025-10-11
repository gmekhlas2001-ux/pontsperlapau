import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Search, Plus, CreditCard as Edit, Eye, Trash2, X, Mail, Phone, MapPin, Calendar, User as UserIcon, Building2, Briefcase, FileText } from 'lucide-react';
import { EditStudentModal } from '../components/EditStudentModal';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';

interface Student {
  id: string;
  profile_id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  role_id: string;
  status: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  father_name: string | null;
  dob: string | null;
  age: number | null;
  gender: string | null;
  national_id: string | null;
  passport_number: string | null;
  address: string | null;
  phone: string | null;
  parent_phone: string | null;
  education_level: string | null;
  date_joined: string | null;
  date_left: string | null;
  short_bio: string | null;
  branch_id: string | null;
  branch_name: string | null;
  notes: string | null;
  profile_photo_url: string | null;
  other_documents_urls: string[] | null;
}

export function Students() {
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [addForm, setAddForm] = useState({
    first_name: '',
    last_name: '',
    father_name: '',
    email: '',
    password: '',
    phone: '',
    parent_phone: '',
    address: '',
    national_id: '',
    passport_number: '',
    age: '',
    gender: '',
    dob: '',
    education_level: '',
    branch_id: '',
    date_joined: '',
    short_bio: '',
  });
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    loadStudents();
    loadBranches();
  }, []);

  async function loadBranches() {
    const { data } = await supabase.from('branches').select('id, name').order('name');
    setBranches(data || []);
  }

  async function loadStudents() {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role_id', 'student')
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      if (profilesData) {
        const studentsWithDetails = await Promise.all(
          profilesData.map(async (profile) => {
            const { data: studentData } = await supabase
              .from('students')
              .select('*, branches(name)')
              .eq('profile_id', profile.id)
              .maybeSingle();

            return {
              id: profile.id,
              profile_id: profile.id,
              auth_user_id: profile.auth_user_id,
              full_name: profile.full_name,
              email: profile.email,
              role_id: profile.role_id,
              status: profile.status,
              created_at: profile.created_at,
              first_name: studentData?.first_name || null,
              last_name: studentData?.last_name || null,
              father_name: studentData?.father_name || null,
              dob: studentData?.dob || null,
              age: studentData?.age || null,
              gender: studentData?.gender || null,
              national_id: studentData?.national_id || null,
              passport_number: studentData?.passport_number || null,
              address: studentData?.address || null,
              phone: studentData?.phone || null,
              parent_phone: studentData?.parent_phone || null,
              education_level: studentData?.education_level || null,
              date_joined: studentData?.date_joined || null,
              date_left: studentData?.date_left || null,
              short_bio: studentData?.short_bio || null,
              branch_id: studentData?.branch_id || null,
              branch_name: studentData?.branches?.name || null,
              notes: studentData?.notes || null,
              profile_photo_url: studentData?.profile_photo_url || null,
              other_documents_urls: studentData?.other_documents_urls || null,
            };
          })
        );

        setStudents(studentsWithDetails);
      }
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(student: Student) {
    if (!confirm(`Are you sure you want to delete ${student.full_name}? This action cannot be undone. They will be removed from both the database and authentication system.`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('You must be logged in to perform this action');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ profileId: student.id }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        showError(`Error deleting student: ${result.error}`);
      } else {
        showSuccess('Student deleted successfully!');
        loadStudents();
      }
    } catch (error: any) {
      showError(`Error deleting student: ${error.message}`);
    }
  }

  function openEdit(student: Student) {
    setSelectedStudent(student);
    setEditForm({
      full_name: student.full_name || '',
      email: student.email || '',
      role_id: student.role_id || 'student',
      status: student.status || 'approved',
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      father_name: student.father_name || '',
      dob: student.dob || '',
      age: student.age?.toString() || '',
      gender: student.gender || '',
      national_id: student.national_id || '',
      passport_number: student.passport_number || '',
      address: student.address || '',
      phone: student.phone || '',
      parent_phone: student.parent_phone || '',
      education_level: student.education_level || '',
      date_joined: student.date_joined || '',
      date_left: student.date_left || '',
      short_bio: student.short_bio || '',
      branch_id: student.branch_id || '',
      notes: student.notes || '',
      profile_photo_url: student.profile_photo_url || '',
    });
    setShowEdit(true);
  }

  function openDetails(student: Student) {
    setSelectedStudent(student);
    setShowDetails(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          email: editForm.email,
          role_id: editForm.role_id,
          status: editForm.status,
        })
        .eq('id', selectedStudent.id);

      if (profileError) throw profileError;

      const { data: existingStudent } = await supabase
        .from('students')
        .select('id')
        .eq('profile_id', selectedStudent.profile_id)
        .maybeSingle();

      const studentData = {
        profile_id: selectedStudent.profile_id,
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
        father_name: editForm.father_name || null,
        dob: editForm.dob || null,
        age: editForm.age ? parseInt(editForm.age) : null,
        gender: editForm.gender || null,
        national_id: editForm.national_id || null,
        passport_number: editForm.passport_number || null,
        address: editForm.address || null,
        phone: editForm.phone || null,
        parent_phone: editForm.parent_phone || null,
        education_level: editForm.education_level || null,
        date_joined: editForm.date_joined || null,
        date_left: editForm.date_left || null,
        short_bio: editForm.short_bio || null,
        branch_id: editForm.branch_id || null,
        notes: editForm.notes || null,
        status: editForm.status || 'active',
        profile_photo_url: editForm.profile_photo_url || null,
        email: editForm.email || null,
      };

      if (existingStudent) {
        const { error: studentError } = await supabase
          .from('students')
          .update(studentData)
          .eq('profile_id', selectedStudent.profile_id);

        if (studentError) throw studentError;
      } else {
        const { error: studentError } = await supabase
          .from('students')
          .insert(studentData);

        if (studentError) throw studentError;
      }

      showSuccess('Student updated successfully!');
      setShowEdit(false);
      loadStudents();
    } catch (error: any) {
      showError('Error updating student: ' + error.message);
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const full_name = `${addForm.first_name} ${addForm.last_name}`.trim();

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: addForm.email,
          password: addForm.password,
          full_name,
          role_id: 'student',
          user_data: {
            first_name: addForm.first_name,
            last_name: addForm.last_name,
            father_name: addForm.father_name,
            email: addForm.email,
            phone: addForm.phone,
            parent_phone: addForm.parent_phone,
            address: addForm.address,
            national_id: addForm.national_id,
            passport_number: addForm.passport_number,
            age: addForm.age ? parseInt(addForm.age) : null,
            gender: addForm.gender,
            dob: addForm.dob || null,
            education_level: addForm.education_level,
            branch_id: addForm.branch_id || null,
            date_joined: addForm.date_joined || null,
            short_bio: addForm.short_bio,
            status: 'active',
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        showError('Error creating student: ' + (result.error || 'Unknown error'));
        return;
      }

      showSuccess('Student added successfully!');
      setShowAdd(false);
      setAddForm({
        first_name: '',
        last_name: '',
        father_name: '',
        email: '',
        password: '',
        phone: '',
        parent_phone: '',
        address: '',
        national_id: '',
        passport_number: '',
        age: '',
        gender: '',
        dob: '',
        education_level: '',
        branch_id: '',
        date_joined: '',
        short_bio: '',
      });
      loadStudents();
    } catch (error: any) {
      showError('Error creating student: ' + error.message);
    }
  }

  const filteredStudents = students.filter((student) => {
    const searchLower = search.toLowerCase();
    return (
      student.full_name?.toLowerCase().includes(searchLower) ||
      student.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Students</h1>
          <p className="text-slate-600">Manage student records and information</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Student
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search students by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No students found</h2>
          <p className="text-slate-600">
            {search ? 'Try adjusting your search terms' : 'Get started by adding your first student'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map((student) => (
            <div
              key={student.id}
              className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden hover:shadow-lg transition-all"
            >
              <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-500"></div>

              <div className="p-6 -mt-12">
                <div className="w-24 h-24 bg-white rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-3xl font-bold text-slate-700 mb-4">
                  {student.full_name?.charAt(0) || 'S'}
                </div>

                <div className="space-y-2 mb-4">
                  <h3 className="text-xl font-bold text-slate-900">{student.full_name}</h3>
                  <p className="text-sm text-slate-600">Student</p>
                </div>

                <div className="space-y-2 mb-6 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{student.email}</span>
                  </div>
                  {student.phone && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="w-4 h-4" />
                      <span>{student.phone}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => openDetails(student)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    Details
                  </button>
                  <button
                    onClick={() => openEdit(student)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(student)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDetails && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Student Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold">
                  {selectedStudent.full_name?.charAt(0) || 'S'}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedStudent.full_name}</h3>
                  <p className="text-slate-600">Student</p>
                  {selectedStudent.branch_name && (
                    <p className="text-sm text-slate-500 mt-1">{selectedStudent.branch_name}</p>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <DetailItem icon={UserIcon} label="First Name" value={selectedStudent.first_name} />
                <DetailItem icon={UserIcon} label="Last Name" value={selectedStudent.last_name} />
                <DetailItem icon={UserIcon} label="Father Name" value={selectedStudent.father_name} />
                <DetailItem icon={Mail} label="Email" value={selectedStudent.email} />
                <DetailItem icon={Phone} label="Phone" value={selectedStudent.phone} />
                <DetailItem icon={Phone} label="Parent Phone" value={selectedStudent.parent_phone} />
                <DetailItem icon={FileText} label="National ID" value={selectedStudent.national_id} />
                <DetailItem icon={FileText} label="Passport" value={selectedStudent.passport_number} />
                <DetailItem icon={Calendar} label="Date of Birth" value={selectedStudent.dob ? new Date(selectedStudent.dob).toLocaleDateString() : null} />
                <DetailItem icon={UserIcon} label="Age" value={selectedStudent.age?.toString()} />
                <DetailItem icon={UserIcon} label="Gender" value={selectedStudent.gender} />
                <DetailItem icon={Briefcase} label="Education Level" value={selectedStudent.education_level} />
                <DetailItem icon={Building2} label="Branch" value={selectedStudent.branch_name} />
                <DetailItem icon={Calendar} label="Date Joined" value={selectedStudent.date_joined ? new Date(selectedStudent.date_joined).toLocaleDateString() : null} />
                {selectedStudent.date_left && (
                  <DetailItem icon={Calendar} label="Date Left" value={new Date(selectedStudent.date_left).toLocaleDateString()} />
                )}
              </div>

              {selectedStudent.address && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Address</p>
                  <p className="text-slate-900 bg-slate-50 p-4 rounded-xl">{selectedStudent.address}</p>
                </div>
              )}

              {selectedStudent.short_bio && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Bio</p>
                  <p className="text-slate-900 bg-slate-50 p-4 rounded-xl">{selectedStudent.short_bio}</p>
                </div>
              )}

              {selectedStudent.notes && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Notes</p>
                  <p className="text-slate-900 bg-slate-50 p-4 rounded-xl">{selectedStudent.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <EditStudentModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        onSubmit={handleEditSubmit}
        formData={editForm}
        setFormData={setEditForm}
        branches={branches}
      />

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Add Student</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">First Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={addForm.first_name}
                    onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Last Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={addForm.last_name}
                    onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Father Name</label>
                  <input
                    type="text"
                    value={addForm.father_name}
                    onChange={(e) => setAddForm({ ...addForm, father_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">National ID</label>
                  <input
                    type="text"
                    value={addForm.national_id}
                    onChange={(e) => setAddForm({ ...addForm, national_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Passport Number</label>
                  <input
                    type="text"
                    value={addForm.passport_number}
                    onChange={(e) => setAddForm({ ...addForm, passport_number: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    required
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Password <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Phone</label>
                  <input
                    type="tel"
                    value={addForm.parent_phone}
                    onChange={(e) => setAddForm({ ...addForm, parent_phone: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Age</label>
                  <input
                    type="number"
                    value={addForm.age}
                    onChange={(e) => setAddForm({ ...addForm, age: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
                  <select
                    value={addForm.gender}
                    onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={addForm.dob}
                    onChange={(e) => setAddForm({ ...addForm, dob: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Education Level</label>
                  <select
                    value={addForm.education_level}
                    onChange={(e) => setAddForm({ ...addForm, education_level: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Education Level</option>
                    <option value="Elementary School">Elementary School</option>
                    <option value="Middle School">Middle School</option>
                    <option value="High School">High School</option>
                    <option value="University">University</option>
                    <option value="Graduate">Graduate</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Branch</label>
                  <select
                    value={addForm.branch_id}
                    onChange={(e) => setAddForm({ ...addForm, branch_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date Joined</label>
                  <input
                    type="date"
                    value={addForm.date_joined}
                    onChange={(e) => setAddForm({ ...addForm, date_joined: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Address</label>
                <textarea
                  rows={2}
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Short Bio</label>
                <textarea
                  rows={2}
                  value={addForm.short_bio}
                  onChange={(e) => setAddForm({ ...addForm, short_bio: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  Add Student
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-slate-900 font-medium">{value}</p>
      </div>
    </div>
  );
}
