import { Clock, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export function PendingApproval() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full mb-6">
          <Clock className="w-10 h-10 text-amber-600" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-4">Approval Pending</h1>

        <p className="text-slate-600 text-lg leading-relaxed mb-8">
          Your account is awaiting approval from an administrator. You'll receive a notification once your account has been reviewed.
        </p>

        <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200 mb-6">
          <p className="text-sm text-slate-600">
            This process typically takes 1-2 business days. If you have questions, please contact your administrator.
          </p>
        </div>

        <button
          onClick={() => signOut()}
          className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
        >
          Sign out
        </button>

        <div className="mt-8">
          <div className="inline-flex items-center justify-center text-slate-400">
            <img src="/logo-ponts-per-la-pau-web.png" alt="Ponts per la Pau" className="w-12 h-12 object-contain opacity-50" />
          </div>
        </div>
      </div>
    </div>
  );
}
