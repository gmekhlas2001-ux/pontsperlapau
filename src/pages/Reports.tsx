import { FileText } from 'lucide-react';

export function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports</h1>
        <p className="text-slate-600">Generate and export reports</p>
      </div>

      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Reporting & Analytics</h2>
        <p className="text-slate-600">Export data and generate comprehensive reports</p>
      </div>
    </div>
  );
}
