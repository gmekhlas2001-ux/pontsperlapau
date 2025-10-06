import { GraduationCap } from 'lucide-react';

export function Classrooms() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Classrooms</h1>
        <p className="text-slate-600">Manage classrooms and student enrollments</p>
      </div>

      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
        <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <GraduationCap className="w-8 h-8 text-cyan-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Classroom Management</h2>
        <p className="text-slate-600 mb-6">Create classrooms and assign teachers and students</p>
        <button className="px-6 py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-all">
          Add First Classroom
        </button>
      </div>
    </div>
  );
}
