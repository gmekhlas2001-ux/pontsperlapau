import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Calendar, MapPin, Save, FileText, Briefcase, CreditCard, Building2, Upload, FileUp, Lock, Key } from 'lucide-react';
import { DocumentUpload } from '../components/DocumentUpload';

interface Branch {
  id: string;
  name: string;
  province: string | null;
}

interface StaffDetails {
  first_name: string | null;
  last_name: string | null;
  national_id: string | null;
  age: number | null;
  gender: string | null;
  position: string | null;
  dob: string | null;
  branch_id: string | null;
  date_joined: string | null;
  date_left: string | null;
  address: string | null;
  passport_number: string | null;
  phone: string | null;
  email: string | null;
  job_description: string | null;
  short_bio: string | null;
  profile_photo_url: string | null;
  cv_url: string | null;
  nid_photo_url: string | null;
  passport_photo_url: string | null;
  education_docs_url: string | null;
  family_parents_tazkira_url: string | null;
  other_documents_urls: string[] | null;
  created_at: string | null;
}

interface StudentDetails {
  first_name: string | null;
  last_name: string | null;
  national_id: string | null;
  age: number | null;
  gender: string | null;
  education_level: string | null;
  dob: string | null;
  branch_id: string | null;
  date_joined: string | null;
  date_left: string | null;
  address: string | null;
  passport_number: string | null;
  phone: string | null;
  email: string | null;
  job_description: string | null;
  short_bio: string | null;
  profile_photo_url: string | null;
  other_documents_urls: string[] | null;
  created_at: string | null;
}

const STAFF_POSITIONS = [
  'Teacher',
  'Librarian',
  'Administrator',
  'Coordinator',
  'Assistant',
  'Other'
];

const EDUCATION_LEVELS = [
  'Elementary School',
  'Middle School',
  'High School',
  'University',
  'Graduate',
  'Other'
];

export function Profile() {
  const { profile, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [staffDetails, setStaffDetails] = useState<StaffDetails | null>(null);
  const [studentDetails, setStudentDetails] = useState<StudentDetails | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formData, setFormData] = useState<any>({});

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadBranches();
    loadExtendedProfile();
  }, [profile]);

  async function loadBranches() {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, province')
      .order('name');

    if (!error && data) {
      setBranches(data);
    }
  }

  async function loadExtendedProfile() {
    if (!profile) return;

    setLoadingDetails(true);
    try {
      if (profile.role_id === 'teacher' || profile.role_id === 'librarian' || profile.role_id === 'admin') {
        const { data, error } = await supabase
          .from('staff')
          .select('*')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (!error && data) {
          setStaffDetails(data);
          setFormData({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            national_id: data.national_id || '',
            age: data.age || '',
            gender: data.gender || '',
            position: data.position || '',
            dob: data.dob || '',
            branch_id: data.branch_id || '',
            date_joined: data.date_joined || '',
            date_left: data.date_left || '',
            address: data.address || '',
            passport_number: data.passport_number || '',
            phone: data.phone || '',
            email: data.email || profile.email,
            job_description: data.job_description || '',
            short_bio: data.short_bio || '',
            profile_photo_url: data.profile_photo_url || '',
            cv_url: data.cv_url || '',
            nid_photo_url: data.nid_photo_url || '',
            passport_photo_url: data.passport_photo_url || '',
            education_docs_url: data.education_docs_url || '',
            family_parents_tazkira_url: data.family_parents_tazkira_url || '',
          });
        } else {
          setFormData({
            first_name: '',
            last_name: '',
            national_id: '',
            age: '',
            gender: '',
            position: '',
            dob: '',
            branch_id: '',
            date_joined: '',
            date_left: '',
            address: '',
            passport_number: '',
            phone: '',
            email: profile.email,
            job_description: '',
            short_bio: '',
            profile_photo_url: '',
            cv_url: '',
          });
        }
      } else if (profile.role_id === 'student') {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (!error && data) {
          setStudentDetails(data);
          setFormData({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            national_id: data.national_id || '',
            age: data.age || '',
            gender: data.gender || '',
            education_level: data.education_level || '',
            dob: data.dob || '',
            branch_id: data.branch_id || '',
            date_joined: data.date_joined || '',
            date_left: data.date_left || '',
            address: data.address || '',
            passport_number: data.passport_number || '',
            phone: data.phone || '',
            email: data.email || profile.email,
            job_description: data.job_description || '',
            short_bio: data.short_bio || '',
            profile_photo_url: data.profile_photo_url || '',
          });
        } else {
          setFormData({
            first_name: '',
            last_name: '',
            national_id: '',
            age: '',
            gender: '',
            education_level: '',
            dob: '',
            branch_id: '',
            date_joined: '',
            date_left: '',
            address: '',
            passport_number: '',
            phone: '',
            email: profile.email,
            job_description: '',
            short_bio: '',
            profile_photo_url: '',
          });
        }
      }
    } catch (error) {
      console.error('Error loading extended profile:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  }

  function handleDateLeftChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setFormData({ ...formData, date_left: value === 'present' ? null : value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const fullName = `${formData.first_name} ${formData.last_name}`.trim();
      await supabase
        .from('profiles')
        .update({
          full_name: fullName,
        })
        .eq('auth_user_id', user?.id);

      if (profile?.role_id === 'teacher' || profile?.role_id === 'librarian' || profile?.role_id === 'admin') {
        const staffData = {
          profile_id: profile.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          national_id: formData.national_id,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender,
          position: formData.position,
          dob: formData.dob || null,
          branch_id: formData.branch_id || null,
          date_joined: formData.date_joined || null,
          date_left: formData.date_left || null,
          address: formData.address,
          passport_number: formData.passport_number,
          phone: formData.phone,
          email: formData.email,
          job_description: formData.job_description,
          short_bio: formData.short_bio,
          profile_photo_url: formData.profile_photo_url || null,
          cv_url: formData.cv_url || null,
          nid_photo_url: (formData as any).nid_photo_url || null,
          passport_photo_url: (formData as any).passport_photo_url || null,
          education_docs_url: (formData as any).education_docs_url || null,
          family_parents_tazkira_url: (formData as any).family_parents_tazkira_url || null,
        };

        if (staffDetails) {
          await supabase
            .from('staff')
            .update(staffData)
            .eq('profile_id', profile.id);
        } else {
          await supabase
            .from('staff')
            .insert(staffData);
        }
      } else if (profile?.role_id === 'student') {
        const studentData = {
          profile_id: profile.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          national_id: formData.national_id,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender,
          education_level: formData.education_level,
          dob: formData.dob || null,
          branch_id: formData.branch_id || null,
          date_joined: formData.date_joined || null,
          date_left: formData.date_left || null,
          address: formData.address,
          passport_number: formData.passport_number,
          phone: formData.phone,
          email: formData.email,
          job_description: formData.job_description,
          short_bio: formData.short_bio,
          profile_photo_url: formData.profile_photo_url || null,
        };

        if (studentDetails) {
          await supabase
            .from('students')
            .update(studentData)
            .eq('profile_id', profile.id);
        } else {
          await supabase
            .from('students')
            .insert(studentData);
        }
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setEditing(false);
      await loadExtendedProfile();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  function getBranchName(branchId: string | null) {
    if (!branchId) return 'Not set';
    const branch = branches.find(b => b.id === branchId);
    return branch ? `${branch.name}${branch.province ? ` - ${branch.province}` : ''}` : 'Not set';
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setPasswordLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setPasswordMessage({ type: 'error', text: error.message });
      } else {
        setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowChangePassword(false);
          setPasswordMessage(null);
        }, 2000);
      }
    } catch (error: any) {
      setPasswordMessage({ type: 'error', text: error.message || 'Failed to change password' });
    } finally {
      setPasswordLoading(false);
    }
  }

  if (loadingDetails) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isStaff = profile?.role_id === 'teacher' || profile?.role_id === 'librarian' || profile?.role_id === 'admin';
  const isStudent = profile?.role_id === 'student';
  const detailsData = isStaff ? staffDetails : studentDetails;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
          <p className="text-slate-600 mt-1">Manage your personal information</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-32"></div>

        <div className="px-8 pb-8">
          <div className="flex items-end justify-between -mt-16 mb-6">
            {formData.profile_photo_url ? (
              <img
                src={formData.profile_photo_url}
                alt="Profile"
                className="w-32 h-32 rounded-2xl object-cover border-4 border-white shadow-xl"
              />
            ) : (
              <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center text-white text-4xl font-bold border-4 border-white shadow-xl">
                {formData.first_name?.charAt(0) || profile?.full_name?.charAt(0) || 'U'}
              </div>
            )}

            {!editing && (
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(true)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  Change Password
                </button>
              </div>
            )}
          </div>

          {message && (
            <div
              className={`mb-6 p-4 rounded-xl ${
                message.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    National ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="national_id"
                    required
                    value={formData.national_id}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Age <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="age"
                    required
                    min="1"
                    max="120"
                    value={formData.age}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="gender"
                    required
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {isStaff && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Position <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="position"
                      required
                      value={formData.position}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Select Position</option>
                      {STAFF_POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>
                )}

                {isStudent && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Level of Education <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="education_level"
                      required
                      value={formData.education_level}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Select Education Level</option>
                      {EDUCATION_LEVELS.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="dob"
                    required
                    value={formData.dob}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="branch_id"
                    required
                    value={formData.branch_id}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}{branch.province && ` - ${branch.province}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Date Joined <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="date_joined"
                    required
                    value={formData.date_joined}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Date Left (Leave blank if present)
                  </label>
                  <input
                    type="date"
                    name="date_left"
                    value={formData.date_left || ''}
                    onChange={handleDateLeftChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Passport Number
                  </label>
                  <input
                    type="text"
                    name="passport_number"
                    value={formData.passport_number}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="address"
                  required
                  rows={3}
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Job Description
                </label>
                <textarea
                  name="job_description"
                  rows={3}
                  value={formData.job_description}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Short Bio
                </label>
                <textarea
                  name="short_bio"
                  rows={3}
                  value={formData.short_bio}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Documents</h3>

                <div className="grid md:grid-cols-2 gap-4">
                  <DocumentUpload
                    userId={user?.id || ''}
                    documentType="profile_photo"
                    currentUrl={formData.profile_photo_url}
                    onUploadComplete={(url) => setFormData({ ...formData, profile_photo_url: url })}
                    label="Profile Photo"
                    accept="image/*"
                  />

                  {isStaff && (
                    <>
                      <DocumentUpload
                        userId={user?.id || ''}
                        documentType="cv"
                        currentUrl={formData.cv_url}
                        onUploadComplete={(url) => setFormData({ ...formData, cv_url: url })}
                        label="CV/Resume"
                        accept=".pdf,.doc,.docx"
                      />
                      <DocumentUpload
                        userId={user?.id || ''}
                        documentType="nid_photo"
                        currentUrl={(formData as any).nid_photo_url}
                        onUploadComplete={(url) => setFormData({ ...formData, nid_photo_url: url } as any)}
                        label="National ID Photo"
                        accept="image/*,.pdf"
                      />
                      <DocumentUpload
                        userId={user?.id || ''}
                        documentType="passport_photo"
                        currentUrl={(formData as any).passport_photo_url}
                        onUploadComplete={(url) => setFormData({ ...formData, passport_photo_url: url } as any)}
                        label="Passport Photo"
                        accept="image/*,.pdf"
                      />
                      <DocumentUpload
                        userId={user?.id || ''}
                        documentType="education_docs"
                        currentUrl={(formData as any).education_docs_url}
                        onUploadComplete={(url) => setFormData({ ...formData, education_docs_url: url } as any)}
                        label="Education Documents"
                        accept="image/*,.pdf,.doc,.docx"
                      />
                      <DocumentUpload
                        userId={user?.id || ''}
                        documentType="family_parents_tazkira"
                        currentUrl={(formData as any).family_parents_tazkira_url}
                        onUploadComplete={(url) => setFormData({ ...formData, family_parents_tazkira_url: url } as any)}
                        label="Family/Parents Tazkira"
                        accept="image/*,.pdf"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setMessage(null);
                    loadExtendedProfile();
                  }}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Full Name</p>
                    <p className="text-slate-900 font-medium">
                      {formData.first_name && formData.last_name
                        ? `${formData.first_name} ${formData.last_name}`
                        : 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">National ID</p>
                    <p className="text-slate-900 font-medium">{formData.national_id || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-lime-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-lime-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Age</p>
                    <p className="text-slate-900 font-medium">{formData.age || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Gender</p>
                    <p className="text-slate-900 font-medium capitalize">{formData.gender || 'Not set'}</p>
                  </div>
                </div>

                {isStaff && formData.position && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Position</p>
                      <p className="text-slate-900 font-medium">{formData.position}</p>
                    </div>
                  </div>
                )}

                {isStudent && formData.education_level && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Education Level</p>
                      <p className="text-slate-900 font-medium">{formData.education_level}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Date of Birth</p>
                    <p className="text-slate-900 font-medium">
                      {formData.dob ? new Date(formData.dob).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Branch</p>
                    <p className="text-slate-900 font-medium">{getBranchName(formData.branch_id)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Date Joined</p>
                    <p className="text-slate-900 font-medium">
                      {formData.date_joined ? new Date(formData.date_joined).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Date Left</p>
                    <p className="text-slate-900 font-medium">
                      {formData.date_left ? new Date(formData.date_left).toLocaleDateString() : 'Present'}
                    </p>
                  </div>
                </div>

                {formData.passport_number && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Passport Number</p>
                      <p className="text-slate-900 font-medium">{formData.passport_number}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Phone</p>
                    <p className="text-slate-900 font-medium">{formData.phone || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Email</p>
                    <p className="text-slate-900 font-medium">{formData.email || 'Not set'}</p>
                  </div>
                </div>

                {detailsData?.created_at && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Profile Created</p>
                      <p className="text-slate-900 font-medium">
                        {new Date(detailsData.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {formData.address && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Address</p>
                    <p className="text-slate-900 font-medium">{formData.address}</p>
                  </div>
                </div>
              )}

              {formData.job_description && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Job Description</p>
                    <p className="text-slate-900 font-medium">{formData.job_description}</p>
                  </div>
                </div>
              )}

              {formData.short_bio && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Short Bio</p>
                    <p className="text-slate-900 font-medium">{formData.short_bio}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showChangePassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Key className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Change Password</h2>
                <p className="text-sm text-slate-600">Update your account password</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-2">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter new password"
                />
                <p className="text-xs text-slate-500 mt-1">Must be at least 6 characters</p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Confirm new password"
                />
              </div>

              {passwordMessage && (
                <div
                  className={`p-4 rounded-xl text-sm ${
                    passwordMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {passwordMessage.text}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordMessage(null);
                  }}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {passwordLoading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
