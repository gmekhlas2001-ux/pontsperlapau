import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Calendar, MapPin, Save, FileText, Briefcase, CreditCard, Users } from 'lucide-react';

interface StaffDetails {
  first_name: string | null;
  last_name: string | null;
  father_name: string | null;
  dob: string | null;
  gender: string | null;
  national_id: string | null;
  passport_number: string | null;
  home_address: string | null;
  phone: string | null;
  email: string | null;
  emergency_contact: string | null;
  position: string | null;
  job_description: string | null;
  date_joined: string | null;
  date_left: string | null;
  history_activities: string | null;
  short_bio: string | null;
  notes: string | null;
}

interface StudentDetails {
  first_name: string | null;
  last_name: string | null;
  father_name: string | null;
  age: number | null;
  gender: string | null;
  national_id: string | null;
  address: string | null;
  phone: string | null;
  parent_phone: string | null;
  education_level: string | null;
  date_joined: string | null;
  date_left: string | null;
  notes: string | null;
}

export function Profile() {
  const { profile, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [staffDetails, setStaffDetails] = useState<StaffDetails | null>(null);
  const [studentDetails, setStudentDetails] = useState<StudentDetails | null>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    loadExtendedProfile();
  }, [profile]);

  async function loadExtendedProfile() {
    if (!profile) return;

    setLoadingDetails(true);
    try {
      if (profile.role_id === 'teacher' || profile.role_id === 'librarian') {
        const { data, error } = await supabase
          .from('staff')
          .select('*')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (!error && data) {
          setStaffDetails(data);
          setFormData({
            full_name: profile.full_name || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            father_name: data.father_name || '',
            dob: data.dob || '',
            gender: data.gender || '',
            national_id: data.national_id || '',
            passport_number: data.passport_number || '',
            home_address: data.home_address || '',
            phone: data.phone || '',
            email: data.email || profile.email,
            emergency_contact: data.emergency_contact || '',
            position: data.position || '',
            job_description: data.job_description || '',
            date_joined: data.date_joined || '',
            history_activities: data.history_activities || '',
            short_bio: data.short_bio || '',
            notes: data.notes || '',
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
            full_name: profile.full_name || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            father_name: data.father_name || '',
            age: data.age || '',
            gender: data.gender || '',
            national_id: data.national_id || '',
            address: data.address || '',
            phone: data.phone || '',
            parent_phone: data.parent_phone || '',
            education_level: data.education_level || '',
            date_joined: data.date_joined || '',
            notes: data.notes || '',
          });
        }
      } else {
        setFormData({
          full_name: profile.full_name || '',
          phone: profile.phone || '',
          address: profile.address || '',
        });
      }
    } catch (error) {
      console.error('Error loading extended profile:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
        })
        .eq('auth_user_id', user?.id);

      if (profile?.role_id === 'teacher' || profile?.role_id === 'librarian') {
        if (staffDetails) {
          await supabase
            .from('staff')
            .update({
              first_name: formData.first_name,
              last_name: formData.last_name,
              father_name: formData.father_name,
              dob: formData.dob || null,
              gender: formData.gender,
              national_id: formData.national_id,
              passport_number: formData.passport_number,
              home_address: formData.home_address,
              phone: formData.phone,
              email: formData.email,
              emergency_contact: formData.emergency_contact,
              position: formData.position,
              job_description: formData.job_description,
              date_joined: formData.date_joined || null,
              history_activities: formData.history_activities,
              short_bio: formData.short_bio,
              notes: formData.notes,
            })
            .eq('profile_id', profile.id);
        } else {
          await supabase
            .from('staff')
            .insert({
              profile_id: profile.id,
              first_name: formData.first_name,
              last_name: formData.last_name,
              father_name: formData.father_name,
              dob: formData.dob || null,
              gender: formData.gender,
              national_id: formData.national_id,
              passport_number: formData.passport_number,
              home_address: formData.home_address,
              phone: formData.phone,
              email: formData.email,
              emergency_contact: formData.emergency_contact,
              position: formData.position,
              job_description: formData.job_description,
              date_joined: formData.date_joined || null,
              history_activities: formData.history_activities,
              short_bio: formData.short_bio,
              notes: formData.notes,
            });
        }
      } else if (profile?.role_id === 'student') {
        if (studentDetails) {
          await supabase
            .from('students')
            .update({
              first_name: formData.first_name,
              last_name: formData.last_name,
              father_name: formData.father_name,
              age: formData.age || null,
              gender: formData.gender,
              national_id: formData.national_id,
              address: formData.address,
              phone: formData.phone,
              parent_phone: formData.parent_phone,
              education_level: formData.education_level,
              date_joined: formData.date_joined || null,
              notes: formData.notes,
            })
            .eq('profile_id', profile.id);
        } else {
          await supabase
            .from('students')
            .insert({
              profile_id: profile.id,
              first_name: formData.first_name,
              last_name: formData.last_name,
              father_name: formData.father_name,
              age: formData.age || null,
              gender: formData.gender,
              national_id: formData.national_id,
              address: formData.address,
              phone: formData.phone,
              parent_phone: formData.parent_phone,
              education_level: formData.education_level,
              date_joined: formData.date_joined || null,
              notes: formData.notes,
            });
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

  if (loadingDetails) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

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
            <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center text-white text-4xl font-bold border-4 border-white shadow-xl">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>

            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                Edit Profile
              </button>
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
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    required
                    value={formData.full_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Father's Name
                  </label>
                  <input
                    type="text"
                    name="father_name"
                    value={formData.father_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {(profile?.role_id === 'teacher' || profile?.role_id === 'librarian') && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        name="dob"
                        value={formData.dob}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Position
                      </label>
                      <input
                        type="text"
                        name="position"
                        value={formData.position}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Date Joined
                      </label>
                      <input
                        type="date"
                        name="date_joined"
                        value={formData.date_joined}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </>
                )}

                {profile?.role_id === 'student' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Age
                      </label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Education Level
                      </label>
                      <input
                        type="text"
                        name="education_level"
                        value={formData.education_level}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Date Joined
                      </label>
                      <input
                        type="date"
                        name="date_joined"
                        value={formData.date_joined}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Parent Phone
                      </label>
                      <input
                        type="tel"
                        name="parent_phone"
                        value={formData.parent_phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Gender
                  </label>
                  <select
                    name="gender"
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    National ID
                  </label>
                  <input
                    type="text"
                    name="national_id"
                    value={formData.national_id}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {(profile?.role_id === 'teacher' || profile?.role_id === 'librarian') && (
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
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {(profile?.role_id === 'teacher' || profile?.role_id === 'librarian') && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Emergency Contact
                      </label>
                      <input
                        type="tel"
                        name="emergency_contact"
                        value={formData.emergency_contact}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {profile?.role_id === 'teacher' || profile?.role_id === 'librarian' ? 'Home Address' : 'Address'}
                </label>
                <textarea
                  name={profile?.role_id === 'teacher' || profile?.role_id === 'librarian' ? 'home_address' : 'address'}
                  rows={3}
                  value={profile?.role_id === 'teacher' || profile?.role_id === 'librarian' ? formData.home_address : formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              {(profile?.role_id === 'teacher' || profile?.role_id === 'librarian') && (
                <>
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

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      History & Activities
                    </label>
                    <textarea
                      name="history_activities"
                      rows={3}
                      value={formData.history_activities}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
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
                    <p className="text-slate-900 font-medium">{profile?.full_name || 'Not set'}</p>
                  </div>
                </div>

                {formData.first_name && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">First Name</p>
                      <p className="text-slate-900 font-medium">{formData.first_name}</p>
                    </div>
                  </div>
                )}

                {formData.last_name && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Last Name</p>
                      <p className="text-slate-900 font-medium">{formData.last_name}</p>
                    </div>
                  </div>
                )}

                {formData.father_name && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Father's Name</p>
                      <p className="text-slate-900 font-medium">{formData.father_name}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Email</p>
                    <p className="text-slate-900 font-medium">{profile?.email || 'Not set'}</p>
                  </div>
                </div>

                {formData.phone && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Phone</p>
                      <p className="text-slate-900 font-medium">{formData.phone}</p>
                    </div>
                  </div>
                )}

                {formData.parent_phone && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-fuchsia-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-fuchsia-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Parent Phone</p>
                      <p className="text-slate-900 font-medium">{formData.parent_phone}</p>
                    </div>
                  </div>
                )}

                {formData.emergency_contact && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Emergency Contact</p>
                      <p className="text-slate-900 font-medium">{formData.emergency_contact}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Role</p>
                    <p className="text-slate-900 font-medium capitalize">{profile?.role_id || 'Not set'}</p>
                  </div>
                </div>

                {formData.gender && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-pink-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Gender</p>
                      <p className="text-slate-900 font-medium capitalize">{formData.gender}</p>
                    </div>
                  </div>
                )}

                {formData.dob && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Date of Birth</p>
                      <p className="text-slate-900 font-medium">{new Date(formData.dob).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}

                {formData.age && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-lime-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-lime-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Age</p>
                      <p className="text-slate-900 font-medium">{formData.age}</p>
                    </div>
                  </div>
                )}

                {formData.national_id && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">National ID</p>
                      <p className="text-slate-900 font-medium">{formData.national_id}</p>
                    </div>
                  </div>
                )}

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

                {formData.position && (
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

                {formData.education_level && (
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

                {formData.date_joined && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Date Joined</p>
                      <p className="text-slate-900 font-medium">{new Date(formData.date_joined).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </div>

              {(formData.home_address || formData.address) && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Address</p>
                    <p className="text-slate-900 font-medium">{formData.home_address || formData.address}</p>
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

              {formData.history_activities && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">History & Activities</p>
                    <p className="text-slate-900 font-medium">{formData.history_activities}</p>
                  </div>
                </div>
              )}

              {formData.notes && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Notes</p>
                    <p className="text-slate-900 font-medium">{formData.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
