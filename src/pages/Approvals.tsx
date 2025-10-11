import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, Clock, User, Users } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Approval = Database['public']['Tables']['approvals']['Row'] & {
  profiles: {
    email: string;
    full_name: string | null;
  } | null;
};

export function Approvals() {
  const { profile } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadApprovals();
  }, []);

  async function loadApprovals() {
    try {
      const { data, error } = await supabase
        .from('approvals')
        .select('*, profiles!approvals_requester_profile_id_fkey(email, full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApprovals(data as Approval[]);
    } catch (error) {
      console.error('Error loading approvals:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approvalId: string, approve: boolean) {
    if (!profile?.id) return;

    setProcessing(approvalId);

    try {
      const approval = approvals.find((a) => a.id === approvalId);
      if (!approval) return;

      const payload = approval.submitted_payload as any;
      const targetRole = approval.target_role;

      if (approve) {
        await supabase.from('profiles').update({
          status: 'approved',
          full_name: payload?.full_name || `${payload?.first_name || ''} ${payload?.last_name || ''}`.trim(),
        }).eq('id', approval.requester_profile_id!);

        if (['admin', 'teacher', 'librarian', 'staff'].includes(targetRole)) {
          const { data: existingStaff } = await supabase
            .from('staff')
            .select('id')
            .eq('profile_id', approval.requester_profile_id)
            .maybeSingle();

          const staffData = {
            first_name: payload?.first_name,
            last_name: payload?.last_name,
            father_name: payload?.father_name,
            age: payload?.age ? parseInt(payload.age) : null,
            dob: payload?.dob,
            gender: payload?.gender,
            national_id: payload?.national_id,
            passport_number: payload?.passport_number,
            address: payload?.address,
            phone: payload?.phone,
            position: payload?.position,
            status: 'active',
          };

          if (!existingStaff) {
            await supabase.from('staff').insert({
              profile_id: approval.requester_profile_id,
              ...staffData,
              date_joined: new Date().toISOString().split('T')[0],
            });
          } else {
            await supabase.from('staff')
              .update(staffData)
              .eq('id', existingStaff.id);
          }
        } else if (targetRole === 'student') {
          const { data: existingStudent } = await supabase
            .from('students')
            .select('id')
            .eq('profile_id', approval.requester_profile_id)
            .maybeSingle();

          const studentData = {
            first_name: payload?.first_name,
            last_name: payload?.last_name,
            father_name: payload?.father_name,
            age: payload?.age ? parseInt(payload.age) : null,
            dob: payload?.dob,
            gender: payload?.gender,
            national_id: payload?.national_id,
            passport_number: payload?.passport_number,
            address: payload?.address,
            phone: payload?.phone,
            parent_phone: payload?.parent_phone,
            education_level: payload?.education_level,
            email: payload?.email,
            status: 'active',
          };

          if (!existingStudent) {
            await supabase.from('students').insert({
              profile_id: approval.requester_profile_id,
              ...studentData,
              date_joined: new Date().toISOString().split('T')[0],
            });
          } else {
            await supabase.from('students')
              .update(studentData)
              .eq('id', existingStudent.id);
          }
        }

        await supabase.from('notifications').insert({
          profile_id: approval.requester_profile_id,
          message: 'Your account has been approved! You can now access the system.',
        });
      } else {
        await supabase.from('profiles').update({
          status: 'rejected',
        }).eq('id', approval.requester_profile_id!);

        await supabase.from('notifications').insert({
          profile_id: approval.requester_profile_id,
          message: 'Your account application was not approved. Please contact an administrator for more information.',
        });
      }

      await supabase.from('approvals').update({
        status: approve ? 'approved' : 'rejected',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      }).eq('id', approvalId);

      await loadApprovals();
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('Error processing approval. Please try again.');
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Approvals</h1>
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Approvals</h1>
        <p className="text-slate-600">Review and approve pending user registrations</p>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">All caught up!</h2>
          <p className="text-slate-600">There are no pending approvals at this time.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => {
            const payload = approval.submitted_payload as any;
            const Icon = approval.target_role === 'staff' ? Users : User;

            return (
              <div
                key={approval.id}
                className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-all"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      approval.target_role === 'staff'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      <Icon className="w-6 h-6" />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-slate-900">
                          {payload?.first_name} {payload?.last_name}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          approval.target_role === 'staff'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {approval.target_role}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Email:</span>
                          <span className="ml-2 text-slate-900">{approval.profiles?.email}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Father's Name:</span>
                          <span className="ml-2 text-slate-900">{payload?.father_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Phone:</span>
                          <span className="ml-2 text-slate-900">{payload?.phone}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">National ID:</span>
                          <span className="ml-2 text-slate-900">{payload?.national_id}</span>
                        </div>
                        {approval.target_role === 'staff' && (
                          <div>
                            <span className="text-slate-500">Position:</span>
                            <span className="ml-2 text-slate-900">{payload?.position}</span>
                          </div>
                        )}
                        {approval.target_role === 'student' && (
                          <>
                            <div>
                              <span className="text-slate-500">Age:</span>
                              <span className="ml-2 text-slate-900">{payload?.age}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Education:</span>
                              <span className="ml-2 text-slate-900">{payload?.education_level}</span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                        <Clock className="w-4 h-4" />
                        <span>Applied {new Date(approval.created_at!).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApproval(approval.id, true)}
                      disabled={processing === approval.id}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleApproval(approval.id, false)}
                      disabled={processing === approval.id}
                      className="px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      <XCircle className="w-5 h-5" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
