import { Building2 } from 'lucide-react';

export function Branches() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Branches</h1>
        <p className="text-slate-600">Manage organization branches and locations</p>
      </div>

      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Branch Management</h2>
        <p className="text-slate-600 mb-6">Create and manage your organization's branches</p>
        <button className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-all">
          Add First Branch
        </button>
      </div>
    </div>
  );
}
