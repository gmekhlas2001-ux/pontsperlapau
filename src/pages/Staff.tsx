import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserCheck, Search, Plus, Edit, Eye, ShieldCheck, Trash2, X, Mail, Phone, MapPin, Calendar, User, Building2, Briefcase, FileText, File, ExternalLink } from 'lucide-react';
import { DocumentUpload } from '../components/DocumentUpload';
import { AddStaffModal } from '../components/AddStaffModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';

interface StaffMember {
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
  emergency_contact: string | null;
  position: string | null;
  job_description: string | null;
  date_joined: string | null;
  date_left: string | null;
  history_activities: string | null;
  short_bio: string | null;
  branch_id: string | null;
  branch_name: string | null;
  notes: string | null;
  profile_photo_url: string | null;
  nid_photo_url: string | null;
  passport_photo_url: string | null;
  cv_url: string | null;
  education_docs_url: string | null;
  family_parents_tazkira_url: string | null;
  other_documents_urls: string[] | null;
}

export function Staff() {
  const { isSuperAdmin } = useAuth();
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [addForm, setAddForm] = useState<any>({
    first_name: '',
    last_name: '',
    father_name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    national_id: '',
    passport_number: '',
    age: '',
    gender: '',
    dob: '',
    position: '',
    role_id: 'teacher',
    branch_id: '',
    date_joined: '',
    job_description: '',
    short_bio: '',
  });

  useEffect(() => {
    loadStaff();
    loadBranches();
  }, []);

  async function loadBranches() {
    const { data } = await supabase.from('branches').select('id, name').order('name');
    setBranches(data || []);
  }

  async function loadStaff() {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('role_id', ['admin', 'teacher', 'librarian'])
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      if (profilesData) {
        const staffWithDetails = await Promise.all(
          profilesData.map(async (profile) => {
            const { data: staffData } = await supabase
              .from('staff')
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
              first_name: staffData?.first_name || null,
              last_name: staffData?.last_name || null,
              father_name: staffData?.father_name || null,
              dob: staffData?.dob || null,
              age: staffData?.age || null,
              gender: staffData?.gender || null,
              national_id: staffData?.national_id || null,
              passport_number: staffData?.passport_number || null,
              address: staffData?.address || null,
              phone: staffData?.phone || null,
              emergency_contact: staffData?.emergency_contact || null,
              position: staffData?.position || null,
              job_description: staffData?.job_description || null,
              date_joined: staffData?.date_joined || null,
              date_left: staffData?.date_left || null,
              history_activities: staffData?.history_activities || null,
              short_bio: staffData?.short_bio || null,
              branch_id: staffData?.branch_id || null,
              branch_name: staffData?.branches?.name || null,
              notes: staffData?.notes || null,
              profile_photo_url: staffData?.profile_photo_url || null,
              nid_photo_url: staffData?.nid_photo_url || null,
              passport_photo_url: staffData?.passport_photo_url || null,
              cv_url: staffData?.cv_url || null,
              education_docs_url: staffData?.education_docs_url || null,
              family_parents_tazkira_url: staffData?.family_parents_tazkira_url || null,
              other_documents_urls: staffData?.other_documents_urls || null,
            };
          })
        );

        setStaff(staffWithDetails);
      }
    } catch (error) {
      console.error('Error loading staff:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePromoteToAdmin(member: StaffMember) {
    if (!confirm(`Are you sure you want to promote ${member.full_name} to admin?`)) return;

    const { error } = await supabase
      .from('profiles')
      .update({ role_id: 'admin' })
      .eq('id', member.id);

    if (error) {
      showError('Error promoting to admin: ' + error.message);
    } else {
      showSuccess('Successfully promoted to admin!');
      loadStaff();
    }
  }

  async function handleDelete(member: StaffMember) {
    if (!confirm(`Are you sure you want to delete ${member.full_name}? This action cannot be undone. They will be removed from both the database and authentication system.`)) return;

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
          body: JSON.stringify({ profileId: member.id }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        showError(`Error deleting staff member: ${result.error}`);
      } else {
        showSuccess('Staff member deleted successfully!');
        loadStaff();
      }
    } catch (error: any) {
      showError(`Error deleting staff member: ${error.message}`);
    }
  }

  function openEdit(member: StaffMember) {
    setSelectedMember(member);
    setEditForm({
      full_name: member.full_name || '',
      email: member.email || '',
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      father_name: member.father_name || '',
      dob: member.dob || '',
      age: member.age || '',
      gender: member.gender || '',
      national_id: member.national_id || '',
      passport_number: member.passport_number || '',
      address: member.address || '',
      phone: member.phone || '',
      emergency_contact: member.emergency_contact || '',
      position: member.position || '',
      job_description: member.job_description || '',
      date_joined: member.date_joined || '',
      date_left: member.date_left || '',
      history_activities: member.history_activities || '',
      short_bio: member.short_bio || '',
      branch_id: member.branch_id || '',
      notes: member.notes || '',
      role_id: member.role_id || '',
      status: member.status || '',
      profile_photo_url: member.profile_photo_url || '',
      nid_photo_url: member.nid_photo_url || '',
      passport_photo_url: member.passport_photo_url || '',
      cv_url: member.cv_url || '',
      education_docs_url: member.education_docs_url || '',
      family_parents_tazkira_url: member.family_parents_tazkira_url || '',
    });
    setShowEdit(true);
  }

  function openDetails(member: StaffMember) {
    setSelectedMember(member);
    setShowDetails(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          email: editForm.email,
          role_id: editForm.role_id,
          status: editForm.status,
        })
        .eq('id', selectedMember.id);

      if (profileError) throw profileError;

      const { data: existingStaff } = await supabase
        .from('staff')
        .select('id')
        .eq('profile_id', selectedMember.profile_id)
        .maybeSingle();

      const staffData = {
        profile_id: selectedMember.profile_id,
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
        emergency_contact: editForm.emergency_contact || null,
        position: editForm.position || null,
        job_description: editForm.job_description || null,
        date_joined: editForm.date_joined || null,
        date_left: editForm.date_left || null,
        history_activities: editForm.history_activities || null,
        short_bio: editForm.short_bio || null,
        branch_id: editForm.branch_id || null,
        notes: editForm.notes || null,
        status: editForm.status || 'active',
        profile_photo_url: editForm.profile_photo_url || null,
        nid_photo_url: editForm.nid_photo_url || null,
        passport_photo_url: editForm.passport_photo_url || null,
        cv_url: editForm.cv_url || null,
        education_docs_url: editForm.education_docs_url || null,
        family_parents_tazkira_url: editForm.family_parents_tazkira_url || null,
      };

      if (existingStaff) {
        const { error: staffError } = await supabase
          .from('staff')
          .update(staffData)
          .eq('profile_id', selectedMember.profile_id);

        if (staffError) throw staffError;
      } else {
        const { error: staffError } = await supabase
          .from('staff')
          .insert(staffData);

        if (staffError) throw staffError;
      }

      showSuccess('Staff member updated successfully!');
      setShowEdit(false);
      loadStaff();
    } catch (error: any) {
      showError('Error updating staff member: ' + error.message);
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
          role_id: addForm.role_id,
          user_data: {
            first_name: addForm.first_name,
            last_name: addForm.last_name,
            father_name: addForm.father_name,
            email: addForm.email,
            phone: addForm.phone,
            address: addForm.address,
            national_id: addForm.national_id,
            passport_number: addForm.passport_number,
            age: addForm.age ? parseInt(addForm.age) : null,
            gender: addForm.gender,
            dob: addForm.dob || null,
            position: addForm.position,
            branch_id: addForm.branch_id || null,
            date_joined: addForm.date_joined || null,
            job_description: addForm.job_description,
            short_bio: addForm.short_bio,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        showError('Error creating staff member: ' + (result.error || 'Unknown error'));
        return;
      }

      showSuccess('Staff member added successfully!');
      setShowAdd(false);
      setAddForm({
        first_name: '',
        last_name: '',
        father_name: '',
        email: '',
        password: '',
        phone: '',
        address: '',
        national_id: '',
        passport_number: '',
        age: '',
        gender: '',
        dob: '',
        position: '',
        role_id: 'teacher',
        branch_id: '',
        date_joined: '',
        job_description: '',
        short_bio: '',
      });
      loadStaff();
    } catch (error: any) {
      showError('Error creating staff member: ' + error.message);
    }
  }

  const filteredStaff = staff.filter((member) => {
    const searchLower = search.toLowerCase();
    return (
      member.full_name?.toLowerCase().includes(searchLower) ||
      member.email?.toLowerCase().includes(searchLower) ||
      member.role_id?.toLowerCase().includes(searchLower) ||
      member.position?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Staff</h1>
          <p className="text-slate-600 mt-1">Manage staff members and their information</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Staff
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search staff by name, email, role, or position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No staff members found</h2>
          <p className="text-slate-600">
            {search ? 'Try adjusting your search terms' : 'No staff members available'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStaff.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden hover:shadow-lg transition-all"
            >
              <div className={`h-24 ${member.role_id === 'admin' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}></div>

              <div className="p-6 -mt-12">
                {member.profile_photo_url ? (
                  <img
                    src={member.profile_photo_url}
                    alt={member.full_name}
                    className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-lg mb-4"
                  />
                ) : (
                  <div className="w-24 h-24 bg-white rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-3xl font-bold text-slate-700 mb-4">
                    {member.full_name?.charAt(0) || 'U'}
                  </div>
                )}

                <div className="space-y-2 mb-4">
                  <h3 className="text-xl font-bold text-slate-900">{member.full_name}</h3>
                  <p className="text-sm text-slate-600 capitalize">
                    {member.position || member.role_id}
                  </p>
                  {member.branch_name && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {member.branch_name}
                    </p>
                  )}
                </div>

                <div className="space-y-2 mb-6 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{member.email}</span>
                  </div>
                  {member.phone && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="w-4 h-4" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openDetails(member)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    Details
                  </button>
                  <button
                    onClick={() => openEdit(member)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  {isSuperAdmin && (member.role_id === 'teacher' || member.role_id === 'librarian') && (
                    <button
                      onClick={() => handlePromoteToAdmin(member)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium"
                      title="Promote to Admin"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Admin
                    </button>
                  )}
                  {(isSuperAdmin || member.role_id !== 'admin') && (
                    <button
                      onClick={() => handleDelete(member)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                      title={member.role_id === 'admin' && !isSuperAdmin ? 'Only super admin can delete admins' : ''}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDetails && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Staff Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                {selectedMember.profile_photo_url ? (
                  <img
                    src={selectedMember.profile_photo_url}
                    alt={selectedMember.full_name}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold">
                    {selectedMember.full_name?.charAt(0) || 'U'}
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedMember.full_name}</h3>
                  <p className="text-slate-600 capitalize">{selectedMember.position || selectedMember.role_id}</p>
                  {selectedMember.branch_name && (
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <Building2 className="w-4 h-4" />
                      {selectedMember.branch_name}
                    </p>
                  )}
                </div>
              </div>

              {selectedMember.short_bio && (
                <div className="bg-blue-50 p-4 rounded-xl">
                  <h4 className="font-semibold text-slate-900 mb-2">Bio</h4>
                  <p className="text-slate-700">{selectedMember.short_bio}</p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <DetailItem icon={User} label="First Name" value={selectedMember.first_name} />
                <DetailItem icon={User} label="Last Name" value={selectedMember.last_name} />
                <DetailItem icon={User} label="Father's Name" value={selectedMember.father_name} />
                <DetailItem icon={Calendar} label="Date of Birth" value={selectedMember.dob} />
                <DetailItem icon={User} label="Age" value={selectedMember.age?.toString()} />
                <DetailItem icon={User} label="Gender" value={selectedMember.gender} />
                <DetailItem icon={FileText} label="National ID" value={selectedMember.national_id} />
                <DetailItem icon={FileText} label="Passport Number" value={selectedMember.passport_number} />
                <DetailItem icon={Mail} label="Email" value={selectedMember.email} />
                <DetailItem icon={Phone} label="Phone" value={selectedMember.phone} />
                <DetailItem icon={Phone} label="Emergency Contact" value={selectedMember.emergency_contact} />
                <DetailItem icon={MapPin} label="Address" value={selectedMember.address} />
                <DetailItem icon={Briefcase} label="Position" value={selectedMember.position} />
                <DetailItem icon={Calendar} label="Date Joined" value={selectedMember.date_joined} />
                <DetailItem icon={Calendar} label="Date Left" value={selectedMember.date_left} />
                <DetailItem icon={User} label="Role" value={selectedMember.role_id} />
                <DetailItem icon={User} label="Status" value={selectedMember.status} />
              </div>

              {selectedMember.job_description && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Job Description</h4>
                  <p className="text-slate-700 bg-slate-50 p-4 rounded-xl">{selectedMember.job_description}</p>
                </div>
              )}

              {selectedMember.history_activities && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">History & Activities</h4>
                  <p className="text-slate-700 bg-slate-50 p-4 rounded-xl">{selectedMember.history_activities}</p>
                </div>
              )}

              {selectedMember.notes && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Notes</h4>
                  <p className="text-slate-700 bg-slate-50 p-4 rounded-xl">{selectedMember.notes}</p>
                </div>
              )}

              {(selectedMember.profile_photo_url || selectedMember.cv_url || selectedMember.nid_photo_url ||
                selectedMember.passport_photo_url || selectedMember.education_docs_url ||
                selectedMember.family_parents_tazkira_url) && (
                <div className="border-t border-slate-200 pt-6">
                  <h4 className="font-semibold text-slate-900 mb-4">Documents</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    {selectedMember.profile_photo_url && (
                      <a
                        href={selectedMember.profile_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                      >
                        <File className="w-5 h-5 text-blue-600" />
                        <span className="text-sm text-blue-700 font-medium">Profile Photo</span>
                        <ExternalLink className="w-4 h-4 text-blue-600 ml-auto" />
                      </a>
                    )}
                    {selectedMember.cv_url && (
                      <a
                        href={selectedMember.cv_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors"
                      >
                        <File className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-700 font-medium">CV/Resume</span>
                        <ExternalLink className="w-4 h-4 text-green-600 ml-auto" />
                      </a>
                    )}
                    {selectedMember.nid_photo_url && (
                      <a
                        href={selectedMember.nid_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors"
                      >
                        <File className="w-5 h-5 text-purple-600" />
                        <span className="text-sm text-purple-700 font-medium">National ID Photo</span>
                        <ExternalLink className="w-4 h-4 text-purple-600 ml-auto" />
                      </a>
                    )}
                    {selectedMember.passport_photo_url && (
                      <a
                        href={selectedMember.passport_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors"
                      >
                        <File className="w-5 h-5 text-orange-600" />
                        <span className="text-sm text-orange-700 font-medium">Passport Photo</span>
                        <ExternalLink className="w-4 h-4 text-orange-600 ml-auto" />
                      </a>
                    )}
                    {selectedMember.education_docs_url && (
                      <a
                        href={selectedMember.education_docs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                      >
                        <File className="w-5 h-5 text-indigo-600" />
                        <span className="text-sm text-indigo-700 font-medium">Education Documents</span>
                        <ExternalLink className="w-4 h-4 text-indigo-600 ml-auto" />
                      </a>
                    )}
                    {selectedMember.family_parents_tazkira_url && (
                      <a
                        href={selectedMember.family_parents_tazkira_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-pink-50 border border-pink-200 rounded-xl hover:bg-pink-100 transition-colors"
                      >
                        <File className="w-5 h-5 text-pink-600" />
                        <span className="text-sm text-pink-700 font-medium">Family/Parents Tazkira</span>
                        <ExternalLink className="w-4 h-4 text-pink-600 ml-auto" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showEdit && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Edit Staff Member</h2>
              <button
                onClick={() => setShowEdit(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                  <input
                    type="text"
                    value={editForm.first_name}
                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={editForm.last_name}
                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Father's Name</label>
                  <input
                    type="text"
                    value={editForm.father_name}
                    onChange={(e) => setEditForm({ ...editForm, father_name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={editForm.dob}
                    onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Age</label>
                  <input
                    type="number"
                    value={editForm.age}
                    onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">National ID</label>
                  <input
                    type="text"
                    value={editForm.national_id}
                    onChange={(e) => setEditForm({ ...editForm, national_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Passport Number</label>
                  <input
                    type="text"
                    value={editForm.passport_number}
                    onChange={(e) => setEditForm({ ...editForm, passport_number: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Emergency Contact</label>
                  <input
                    type="tel"
                    value={editForm.emergency_contact}
                    onChange={(e) => setEditForm({ ...editForm, emergency_contact: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Position</label>
                  <select
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="">Select Position</option>
                    <option value="Teacher">Teacher</option>
                    <option value="Librarian">Librarian</option>
                    <option value="Administrator">Administrator</option>
                    <option value="Coordinator">Coordinator</option>
                    <option value="Assistant">Assistant</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date Joined</label>
                  <input
                    type="date"
                    value={editForm.date_joined}
                    onChange={(e) => setEditForm({ ...editForm, date_joined: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date Left</label>
                  <input
                    type="date"
                    value={editForm.date_left}
                    onChange={(e) => setEditForm({ ...editForm, date_left: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Branch</label>
                  <select
                    value={editForm.branch_id}
                    onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                  <select
                    value={editForm.role_id}
                    onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="teacher">Teacher</option>
                    <option value="librarian">Librarian</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Address</label>
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Job Description</label>
                <textarea
                  rows={3}
                  value={editForm.job_description}
                  onChange={(e) => setEditForm({ ...editForm, job_description: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Short Bio</label>
                <textarea
                  rows={3}
                  value={editForm.short_bio}
                  onChange={(e) => setEditForm({ ...editForm, short_bio: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">History & Activities</label>
                <textarea
                  rows={3}
                  value={editForm.history_activities}
                  onChange={(e) => setEditForm({ ...editForm, history_activities: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="border-t border-slate-200 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Documents</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <DocumentUpload
                    userId={selectedMember.auth_user_id}
                    documentType="profile_photo"
                    currentUrl={editForm.profile_photo_url}
                    onUploadComplete={(url) => setEditForm({ ...editForm, profile_photo_url: url })}
                    label="Profile Photo"
                    accept="image/*"
                  />
                  <DocumentUpload
                    userId={selectedMember.auth_user_id}
                    documentType="cv"
                    currentUrl={editForm.cv_url}
                    onUploadComplete={(url) => setEditForm({ ...editForm, cv_url: url })}
                    label="CV/Resume"
                    accept=".pdf,.doc,.docx"
                  />
                  <DocumentUpload
                    userId={selectedMember.auth_user_id}
                    documentType="nid_photo"
                    currentUrl={editForm.nid_photo_url}
                    onUploadComplete={(url) => setEditForm({ ...editForm, nid_photo_url: url })}
                    label="National ID Photo"
                    accept="image/*,.pdf"
                  />
                  <DocumentUpload
                    userId={selectedMember.auth_user_id}
                    documentType="passport_photo"
                    currentUrl={editForm.passport_photo_url}
                    onUploadComplete={(url) => setEditForm({ ...editForm, passport_photo_url: url })}
                    label="Passport Photo"
                    accept="image/*,.pdf"
                  />
                  <DocumentUpload
                    userId={selectedMember.auth_user_id}
                    documentType="education_docs"
                    currentUrl={editForm.education_docs_url}
                    onUploadComplete={(url) => setEditForm({ ...editForm, education_docs_url: url })}
                    label="Education Documents"
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  <DocumentUpload
                    userId={selectedMember.auth_user_id}
                    documentType="family_parents_tazkira"
                    currentUrl={editForm.family_parents_tazkira_url}
                    onUploadComplete={(url) => setEditForm({ ...editForm, family_parents_tazkira_url: url })}
                    label="Family/Parents Tazkira"
                    accept="image/*,.pdf"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AddStaffModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAddSubmit}
        formData={addForm}
        setFormData={setAddForm}
        branches={branches}
      />
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
