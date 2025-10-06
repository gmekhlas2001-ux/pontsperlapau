import { Library as LibraryIcon } from 'lucide-react';

export function Library() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Library</h1>
        <p className="text-slate-600">Manage books, loans, and library visits</p>
      </div>

      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <LibraryIcon className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Library Management</h2>
        <p className="text-slate-600 mb-6">Track books, manage loans, and record library visits</p>
        <button className="px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-all">
          Add First Book
        </button>
      </div>
    </div>
  );
}
