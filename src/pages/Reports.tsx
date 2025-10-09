import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import {
  FileText, Plus, DollarSign, TrendingUp, Calendar,
  Download, Search, Filter, X, Save, Building2,
  Users, ArrowRight, CheckCircle, Clock, XCircle, Trash2
} from 'lucide-react';

interface Transaction {
  id: string;
  transaction_number: string;
  from_branch_id: string;
  to_branch_id: string;
  from_staff_id: string;
  to_staff_id: string;
  amount: number;
  currency: string;
  transfer_method: string;
  transaction_date: string;
  received_date: string | null;
  status: string;
  confirmation_code: string | null;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  from_branch?: { name: string };
  to_branch?: { name: string };
  from_staff?: { full_name: string };
  to_staff?: { full_name: string };
}

interface Budget {
  id: string;
  branch_id: string;
  budget_period: string;
  year: number;
  month: number | null;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  notes: string | null;
  branch?: { name: string };
}

interface Branch {
  id: string;
  name: string;
}

interface BranchWithTransactionCount extends Branch {
  transactionCount: number;
}

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
}

export function Reports() {
  const { isAdmin } = useAuth();
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState<'transactions' | 'budgets' | 'reports'>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [transactionForm, setTransactionForm] = useState({
    from_branch_id: '',
    to_branch_id: '',
    from_staff_id: '',
    to_staff_id: '',
    amount: '',
    currency: 'AFN',
    transfer_method: 'MoneyGram',
    transaction_date: new Date().toISOString().split('T')[0],
    received_date: '',
    status: 'pending',
    confirmation_code: '',
    notes: '',
  });

  const [budgetForm, setBudgetForm] = useState({
    branch_id: '',
    budget_period: 'monthly',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    allocated_amount: '',
    currency: 'AFN',
    notes: '',
  });

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadTransactions(),
        loadBudgets(),
        loadBranches(),
        loadStaff(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        from_branch:branches!transactions_from_branch_id_fkey(name),
        to_branch:branches!transactions_to_branch_id_fkey(name),
        from_staff:profiles!transactions_from_staff_id_fkey(full_name),
        to_staff:profiles!transactions_to_staff_id_fkey(full_name)
      `)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error loading transactions:', error);
    } else {
      setTransactions(data || []);
    }
  }

  async function loadBudgets() {
    const { data, error } = await supabase
      .from('branch_budgets')
      .select('*, branch:branches(name)')
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) {
      console.error('Error loading budgets:', error);
    } else {
      setBudgets(data || []);
    }
  }

  async function loadBranches() {
    const { data } = await supabase
      .from('branches')
      .select('id, name')
      .order('name');
    setBranches(data || []);
  }

  async function loadStaff() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('role_id', ['admin', 'teacher', 'librarian'])
      .order('full_name');
    setStaff(data || []);
  }

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { error } = await supabase.from('transactions').insert({
      ...transactionForm,
      amount: parseFloat(transactionForm.amount),
      received_date: transactionForm.received_date || null,
      confirmation_code: transactionForm.confirmation_code || null,
      notes: transactionForm.notes || null,
      created_by: profileData?.id,
    });

    if (error) {
      showError('Error creating transaction: ' + error.message);
    } else {
      showSuccess('Transaction created successfully!');
      setShowAddTransaction(false);
      setTransactionForm({
        from_branch_id: '',
        to_branch_id: '',
        from_staff_id: '',
        to_staff_id: '',
        amount: '',
        currency: 'AFN',
        transfer_method: 'MoneyGram',
        transaction_date: new Date().toISOString().split('T')[0],
        received_date: '',
        status: 'pending',
        confirmation_code: '',
        notes: '',
      });
      loadTransactions();
    }
  }

  async function handleDeleteTransaction(id: string, transactionNumber: string) {
    if (!confirm(`Are you sure you want to delete transaction ${transactionNumber}?`)) {
      return;
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Error deleting transaction: ' + error.message);
    } else {
      showSuccess('Transaction deleted successfully!');
      loadTransactions();
    }
  }

  async function handleAddBudget(e: React.FormEvent) {
    e.preventDefault();

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { error } = await supabase.from('branch_budgets').insert({
      ...budgetForm,
      allocated_amount: parseFloat(budgetForm.allocated_amount),
      month: budgetForm.budget_period === 'yearly' ? null : budgetForm.month,
      notes: budgetForm.notes || null,
      created_by: profileData?.id,
    });

    if (error) {
      showError('Error creating budget: ' + error.message);
    } else {
      showSuccess('Budget created successfully!');
      setShowAddBudget(false);
      setBudgetForm({
        branch_id: '',
        budget_period: 'monthly',
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        allocated_amount: '',
        currency: 'AFN',
        notes: '',
      });
      loadBudgets();
    }
  }

  async function generateMonthlyReport(branchId: string | null, year: number, month: number) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    let query = supabase
      .from('transactions')
      .select(`
        *,
        from_branch:branches!transactions_from_branch_id_fkey(name),
        to_branch:branches!transactions_to_branch_id_fkey(name),
        from_staff:profiles!transactions_from_staff_id_fkey(full_name),
        to_staff:profiles!transactions_to_staff_id_fkey(full_name)
      `)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    if (branchId) {
      query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
    }

    const { data: transactionData, error } = await query;

    if (error) {
      showError('Error fetching transactions: ' + error.message);
      return;
    }

    if (!transactionData || transactionData.length === 0) {
      showError('No transactions found for this period');
      return;
    }

    generatePDFReport(transactionData, branchId, startDate, endDate);
  }

  function generatePDFReport(data: Transaction[], branchId: string | null, startDate: string, endDate: string) {
    const branchName = branchId
      ? branches.find(b => b.id === branchId)?.name || 'Unknown Branch'
      : 'All Branches';

    const totalAmount = data.reduce((sum, t) => sum + t.amount, 0);

    let reportContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Transaction Report - ${branchName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #1e293b; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    .header { margin-bottom: 30px; }
    .summary { background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #1e293b; color: white; padding: 12px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
    tr:hover { background: #f8fafc; }
    .status-confirmed { color: #10b981; font-weight: bold; }
    .status-pending { color: #f59e0b; font-weight: bold; }
    .status-cancelled { color: #ef4444; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Transaction Report</h1>
    <p><strong>Branch:</strong> ${branchName}</p>
    <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  </div>

  <div class="summary">
    <h2>Summary</h2>
    <p><strong>Total Transactions:</strong> ${data.length}</p>
    <p><strong>Total Amount:</strong> ${totalAmount.toLocaleString()} AFN</p>
    <p><strong>Confirmed:</strong> ${data.filter(t => t.status === 'confirmed').length}</p>
    <p><strong>Pending:</strong> ${data.filter(t => t.status === 'pending').length}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Transaction #</th>
        <th>Date</th>
        <th>From</th>
        <th>To</th>
        <th>Amount</th>
        <th>Method</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(t => `
        <tr>
          <td>${t.transaction_number}</td>
          <td>${new Date(t.transaction_date).toLocaleDateString()}</td>
          <td>${t.from_branch?.name || 'N/A'} - ${t.from_staff?.full_name || 'N/A'}</td>
          <td>${t.to_branch?.name || 'N/A'} - ${t.to_staff?.full_name || 'N/A'}</td>
          <td>${t.amount.toLocaleString()} ${t.currency}</td>
          <td>${t.transfer_method}</td>
          <td class="status-${t.status}">${t.status.toUpperCase()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `;

    const blob = new Blob([reportContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().getTime();
    a.download = `transaction-report-${branchName.replace(/\s+/g, '-')}-${startDate}-${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccess(`Report generated with ${data.length} transaction(s)!`);
  }

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch =
      t.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.from_branch?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.to_branch?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">You must be an admin to access reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports & Transactions</h1>
          <p className="text-slate-600">Manage transactions, budgets, and generate reports</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'transactions'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-5 h-5 inline mr-2" />
          Transactions
        </button>
        <button
          onClick={() => setActiveTab('budgets')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'budgets'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-5 h-5 inline mr-2" />
          Budgets
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'reports'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-5 h-5 inline mr-2" />
          Generate Reports
        </button>
      </div>

      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex gap-4 items-center justify-between">
            <div className="flex gap-4 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <button
              onClick={() => setShowAddTransaction(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Transaction
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Transaction #</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Date</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">From</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">To</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Amount</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Method</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Status</th>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {transaction.transaction_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {new Date(transaction.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div className="font-medium">{transaction.from_branch?.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{transaction.from_staff?.full_name || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div className="font-medium">{transaction.to_branch?.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{transaction.to_staff?.full_name || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                          {transaction.amount.toLocaleString()} {transaction.currency}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {transaction.transfer_method}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            transaction.status === 'confirmed'
                              ? 'bg-green-100 text-green-700'
                              : transaction.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {transaction.status === 'confirmed' && <CheckCircle className="w-3 h-3" />}
                            {transaction.status === 'pending' && <Clock className="w-3 h-3" />}
                            {transaction.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                            {transaction.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button
                            onClick={() => handleDeleteTransaction(transaction.id, transaction.transaction_number)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete transaction"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'budgets' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-900">Branch Budgets</h2>
            <button
              onClick={() => setShowAddBudget(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Budget
            </button>
          </div>

          <div className="grid gap-4">
            {budgets.map((budget) => (
              <div key={budget.id} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-bold text-slate-900">{budget.branch?.name}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-500">Period</p>
                        <p className="text-sm font-medium text-slate-900">
                          {budget.budget_period === 'monthly' && `${budget.month}/${budget.year}`}
                          {budget.budget_period === 'yearly' && budget.year}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Allocated Amount</p>
                        <p className="text-sm font-medium text-slate-900">
                          {budget.allocated_amount.toLocaleString()} {budget.currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Spent Amount</p>
                        <p className="text-sm font-medium text-slate-900">
                          {budget.spent_amount.toLocaleString()} {budget.currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Remaining</p>
                        <p className="text-sm font-medium text-green-600">
                          {(budget.allocated_amount - budget.spent_amount).toLocaleString()} {budget.currency}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Generate Monthly Reports</h2>
            <p className="text-slate-600 mb-6">Generate transaction reports for each branch or all branches for the current month.</p>

            <div className="space-y-4">
              {branches.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No branches available. Create branches first.</p>
                </div>
              ) : (
                <>
                  {branches.map((branch) => {
                    const now = new Date();
                    const currentMonthTransactions = transactions.filter(t => {
                      const transDate = new Date(t.transaction_date);
                      return (
                        transDate.getMonth() === now.getMonth() &&
                        transDate.getFullYear() === now.getFullYear() &&
                        (t.from_branch_id === branch.id || t.to_branch_id === branch.id)
                      );
                    });

                    return (
                      <div key={branch.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <div>
                            <span className="font-medium text-slate-900">{branch.name}</span>
                            <p className="text-sm text-slate-500">
                              {currentMonthTransactions.length} transaction{currentMonthTransactions.length !== 1 ? 's' : ''} this month
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            generateMonthlyReport(branch.id, now.getFullYear(), now.getMonth() + 1);
                          }}
                          disabled={currentMonthTransactions.length === 0}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                            currentMonthTransactions.length === 0
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                          title={currentMonthTransactions.length === 0 ? 'No transactions this month' : 'Generate report'}
                        >
                          <Download className="w-4 h-4" />
                          Generate This Month
                        </button>
                      </div>
                    );
                  })}
                </>
              )}

              <div className="flex items-center justify-between p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <div>
                    <span className="font-medium text-slate-900">All Branches Combined</span>
                    <p className="text-sm text-slate-600">
                      {(() => {
                        const now = new Date();
                        const currentMonthTransactions = transactions.filter(t => {
                          const transDate = new Date(t.transaction_date);
                          return (
                            transDate.getMonth() === now.getMonth() &&
                            transDate.getFullYear() === now.getFullYear()
                          );
                        });
                        return `${currentMonthTransactions.length} transaction${currentMonthTransactions.length !== 1 ? 's' : ''} this month`;
                      })()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const now = new Date();
                    generateMonthlyReport(null, now.getFullYear(), now.getMonth() + 1);
                  }}
                  disabled={(() => {
                    const now = new Date();
                    const currentMonthTransactions = transactions.filter(t => {
                      const transDate = new Date(t.transaction_date);
                      return (
                        transDate.getMonth() === now.getMonth() &&
                        transDate.getFullYear() === now.getFullYear()
                      );
                    });
                    return currentMonthTransactions.length === 0;
                  })()}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    (() => {
                      const now = new Date();
                      const currentMonthTransactions = transactions.filter(t => {
                        const transDate = new Date(t.transaction_date);
                        return (
                          transDate.getMonth() === now.getMonth() &&
                          transDate.getFullYear() === now.getFullYear()
                        );
                      });
                      return currentMonthTransactions.length === 0;
                    })()
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  title={(() => {
                    const now = new Date();
                    const currentMonthTransactions = transactions.filter(t => {
                      const transDate = new Date(t.transaction_date);
                      return (
                        transDate.getMonth() === now.getMonth() &&
                        transDate.getFullYear() === now.getFullYear()
                      );
                    });
                    return currentMonthTransactions.length === 0 ? 'No transactions this month' : 'Generate combined report';
                  })()}
                >
                  <Download className="w-4 h-4" />
                  Generate Combined Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Add New Transaction</h2>
              <button
                onClick={() => setShowAddTransaction(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">From Branch</label>
                  <select
                    value={transactionForm.from_branch_id}
                    onChange={(e) => setTransactionForm({ ...transactionForm, from_branch_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">To Branch</label>
                  <select
                    value={transactionForm.to_branch_id}
                    onChange={(e) => setTransactionForm({ ...transactionForm, to_branch_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">From Staff</label>
                  <select
                    value={transactionForm.from_staff_id}
                    onChange={(e) => setTransactionForm({ ...transactionForm, from_staff_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select staff</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">To Staff</label>
                  <select
                    value={transactionForm.to_staff_id}
                    onChange={(e) => setTransactionForm({ ...transactionForm, to_staff_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select staff</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={transactionForm.amount}
                    onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Currency</label>
                  <select
                    value={transactionForm.currency}
                    onChange={(e) => setTransactionForm({ ...transactionForm, currency: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="AFN">AFN (Afghan Afghani)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Transfer Method</label>
                  <select
                    value={transactionForm.transfer_method}
                    onChange={(e) => setTransactionForm({ ...transactionForm, transfer_method: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="MoneyGram">MoneyGram</option>
                    <option value="Western Union">Western Union</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Hawala">Hawala</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Transaction Date</label>
                  <input
                    type="date"
                    value={transactionForm.transaction_date}
                    onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Received Date</label>
                  <input
                    type="date"
                    value={transactionForm.received_date}
                    onChange={(e) => setTransactionForm({ ...transactionForm, received_date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                  <select
                    value={transactionForm.status}
                    onChange={(e) => setTransactionForm({ ...transactionForm, status: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Confirmation Code</label>
                  <input
                    type="text"
                    value={transactionForm.confirmation_code}
                    onChange={(e) => setTransactionForm({ ...transactionForm, confirmation_code: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., MTCN or tracking number"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea
                  value={transactionForm.notes}
                  onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional notes about this transaction..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save className="w-5 h-5" />
                  Save Transaction
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTransaction(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddBudget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Add Branch Budget</h2>
              <button
                onClick={() => setShowAddBudget(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddBudget} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Branch</label>
                <select
                  value={budgetForm.branch_id}
                  onChange={(e) => setBudgetForm({ ...budgetForm, branch_id: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Budget Period</label>
                <select
                  value={budgetForm.budget_period}
                  onChange={(e) => setBudgetForm({ ...budgetForm, budget_period: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
                  <input
                    type="number"
                    value={budgetForm.year}
                    onChange={(e) => setBudgetForm({ ...budgetForm, year: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {budgetForm.budget_period === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Month</label>
                    <select
                      value={budgetForm.month}
                      onChange={(e) => setBudgetForm({ ...budgetForm, month: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                        <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Allocated Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={budgetForm.allocated_amount}
                    onChange={(e) => setBudgetForm({ ...budgetForm, allocated_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Currency</label>
                  <select
                    value={budgetForm.currency}
                    onChange={(e) => setBudgetForm({ ...budgetForm, currency: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="AFN">AFN</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea
                  value={budgetForm.notes}
                  onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save className="w-5 h-5" />
                  Save Budget
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBudget(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}
    </div>
  );
}
