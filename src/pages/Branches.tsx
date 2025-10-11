import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Plus, Users, BookOpen, School, Library, Edit2, Trash2, X } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  province: string | null;
  address: string | null;
  phone: string | null;
  year_built: number | null;
  year_closed: number | null;
  is_main_branch: boolean;
  created_at: string;
  staff_count?: number;
  students_count?: number;
  classrooms_count?: number;
  books_count?: number;
}

export function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    province: '',
    address: '',
    phone: '',
    year_built: '',
    year_closed: '',
    is_main_branch: false,
  });

  useEffect(() => {
    loadBranches();
  }, []);

  async function loadBranches() {
    setLoading(true);
    try {
      const { data: branchesData, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (branchesData) {
        const branchesWithCounts = await Promise.all(
          branchesData.map(async (branch) => {
            const [staffCount, studentsCount, classroomsCount, booksCount] = await Promise.all([
              supabase.from('staff').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id),
              supabase.from('students').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id),
              supabase.from('classrooms').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id),
              supabase.from('books').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id),
            ]);

            return {
              ...branch,
              staff_count: staffCount.count || 0,
              students_count: studentsCount.count || 0,
              classrooms_count: classroomsCount.count || 0,
              books_count: booksCount.count || 0,
            };
          })
        );

        setBranches(branchesWithCounts);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      province: '',
      address: '',
      phone: '',
      year_built: '',
      year_closed: '',
      is_main_branch: false,
    });
  }

  function openAddModal() {
    resetForm();
    setShowAddModal(true);
  }

  function openEditModal(branch: Branch) {
    setSelectedBranch(branch);
    setFormData({
      name: branch.name,
      province: branch.province || '',
      address: branch.address || '',
      phone: branch.phone || '',
      year_built: branch.year_built?.toString() || '',
      year_closed: branch.year_closed?.toString() || '',
      is_main_branch: branch.is_main_branch || false,
    });
    setShowEditModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const branchData = {
      name: formData.name,
      province: formData.province || null,
      address: formData.address || null,
      phone: formData.phone || null,
      year_built: formData.year_built ? parseInt(formData.year_built) : null,
      year_closed: formData.year_closed ? parseInt(formData.year_closed) : null,
      is_main_branch: formData.is_main_branch,
    };

    try {
      const { error } = await supabase.from('branches').insert(branchData);

      if (error) throw error;

      alert('Branch added successfully!');
      setShowAddModal(false);
      resetForm();
      loadBranches();
    } catch (error: any) {
      alert('Error adding branch: ' + error.message);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBranch) return;

    const branchData = {
      name: formData.name,
      province: formData.province || null,
      address: formData.address || null,
      phone: formData.phone || null,
      year_built: formData.year_built ? parseInt(formData.year_built) : null,
      year_closed: formData.year_closed ? parseInt(formData.year_closed) : null,
      is_main_branch: formData.is_main_branch,
    };

    try {
      const { error } = await supabase
        .from('branches')
        .update(branchData)
        .eq('id', selectedBranch.id);

      if (error) throw error;

      alert('Branch updated successfully!');
      setShowEditModal(false);
      setSelectedBranch(null);
      resetForm();
      loadBranches();
    } catch (error: any) {
      alert('Error updating branch: ' + error.message);
    }
  }

  async function handleDelete(branch: Branch) {
    if (!confirm(`Are you sure you want to delete ${branch.name}? This will affect all staff, students, classrooms, and books associated with this branch.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('branches').delete().eq('id', branch.id);

      if (error) throw error;

      alert('Branch deleted successfully!');
      loadBranches();
    } catch (error: any) {
      if (error.message?.includes('foreign key constraint')) {
        alert('Cannot delete this branch because it has staff, students, classrooms, or books assigned to it. Please reassign or remove them first.');
      } else {
        alert('Error deleting branch: ' + error.message);
      }
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  }

  if (loading) {
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
          <h1 className="text-3xl font-bold text-slate-900">Branches</h1>
          <p className="text-slate-600 mt-1">Manage organization branches and locations</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Branch
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No Branches Yet</h2>
          <p className="text-slate-600 mb-6">Get started by creating your first branch</p>
          <button
            onClick={openAddModal}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all"
          >
            Add First Branch
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <div key={branch.id} className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(branch)}
                    className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(branch)}
                    className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 mb-1">
                <h3 className="text-xl font-bold text-slate-900">{branch.name}</h3>
                {branch.is_main_branch && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                    Main
                  </span>
                )}
              </div>
              {branch.province && (
                <p className="text-sm text-slate-600 mb-4">{branch.province}</p>
              )}

              <div className="space-y-2 mb-4">
                {branch.year_built && (
                  <div className="text-sm">
                    <span className="text-slate-500">Built: </span>
                    <span className="text-slate-900 font-medium">{branch.year_built}</span>
                  </div>
                )}
                {branch.year_closed && (
                  <div className="text-sm">
                    <span className="text-slate-500">Closed: </span>
                    <span className="text-slate-900 font-medium">{branch.year_closed}</span>
                  </div>
                )}
                {branch.address && (
                  <div className="text-sm text-slate-600">{branch.address}</div>
                )}
                {branch.phone && (
                  <div className="text-sm text-slate-600">{branch.phone}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Staff</p>
                    <p className="text-lg font-bold text-slate-900">{branch.staff_count}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Students</p>
                    <p className="text-lg font-bold text-slate-900">{branch.students_count}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <School className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Classrooms</p>
                    <p className="text-lg font-bold text-slate-900">{branch.classrooms_count}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Books</p>
                    <p className="text-lg font-bold text-slate-900">{branch.books_count}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Add New Branch</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter branch name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Province
                </label>
                <input
                  type="text"
                  name="province"
                  value={formData.province}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter province"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Year Built
                  </label>
                  <input
                    type="number"
                    name="year_built"
                    min="1900"
                    max="2100"
                    value={formData.year_built}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 2020"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Year Closed (Optional)
                  </label>
                  <input
                    type="number"
                    name="year_closed"
                    min="1900"
                    max="2100"
                    value={formData.year_closed}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave empty if active"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  rows={3}
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Enter full address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter phone number"
                />
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <input
                  type="checkbox"
                  id="is_main_branch_add"
                  checked={formData.is_main_branch}
                  onChange={(e) => setFormData({ ...formData, is_main_branch: e.target.checked })}
                  className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="is_main_branch_add" className="text-sm font-medium text-slate-700 cursor-pointer">
                  This is a main branch (Budget deducts when sending money to other branches)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  Add Branch
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && selectedBranch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Edit Branch</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedBranch(null);
                  resetForm();
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter branch name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Province
                </label>
                <input
                  type="text"
                  name="province"
                  value={formData.province}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter province"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Year Built
                  </label>
                  <input
                    type="number"
                    name="year_built"
                    min="1900"
                    max="2100"
                    value={formData.year_built}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 2020"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Year Closed (Optional)
                  </label>
                  <input
                    type="number"
                    name="year_closed"
                    min="1900"
                    max="2100"
                    value={formData.year_closed}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave empty if active"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  rows={3}
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Enter full address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter phone number"
                />
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <input
                  type="checkbox"
                  id="is_main_branch_edit"
                  checked={formData.is_main_branch}
                  onChange={(e) => setFormData({ ...formData, is_main_branch: e.target.checked })}
                  className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="is_main_branch_edit" className="text-sm font-medium text-slate-700 cursor-pointer">
                  This is a main branch (Budget deducts when sending money to other branches)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedBranch(null);
                    resetForm();
                  }}
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
  );
}
