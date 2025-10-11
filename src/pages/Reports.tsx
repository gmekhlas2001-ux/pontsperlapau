import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import {
  FileText, Plus, DollarSign, TrendingUp, Calendar,
  Download, Search, Filter, X, Save, Building2,
  Users, ArrowRight, CheckCircle, Clock, XCircle, Trash2, Edit
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
  purpose: string | null;
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

interface GeneratedReport {
  id: string;
  branch_id: string | null;
  report_type: string;
  report_period: string;
  file_name: string;
  file_path: string;
  file_size: number;
  transaction_count: number;
  total_amount: number;
  currency: string;
  generated_by: string | null;
  generated_at: string | null;
  status: string;
  error_message: string | null;
  branch?: { name: string };
}

export function Reports() {
  const { isAdmin } = useAuth();
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState<'transactions' | 'budgets' | 'reports'>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportType, setReportType] = useState<'single' | 'yearly' | 'range'>('single');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [startMonth, setStartMonth] = useState(1);
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [endMonth, setEndMonth] = useState(new Date().getMonth() + 1);
  const [endYear, setEndYear] = useState(new Date().getFullYear());

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
    purpose: '',
    notes: '',
  });

  const [budgetForm, setBudgetForm] = useState({
    branch_id: '',
    budget_period: 'monthly',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    allocated_amount: '',
    spent_amount: '',
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
        loadGeneratedReports(),
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

  async function loadGeneratedReports() {
    const { data, error } = await supabase
      .from('generated_reports')
      .select('*, branch:branches(name)')
      .order('generated_at', { ascending: false });

    if (error) {
      console.error('Error loading generated reports:', error);
    } else {
      setGeneratedReports(data || []);
    }
  }

  async function generateMonthlyReport(branchId: string | null) {
    setGeneratingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-monthly-reports`;

      let requestBody: any = { branchId };

      if (reportType === 'single') {
        requestBody.year = selectedYear;
        requestBody.month = selectedMonth;
        requestBody.reportType = 'single';
      } else if (reportType === 'yearly') {
        requestBody.year = selectedYear;
        requestBody.reportType = 'yearly';
      } else if (reportType === 'range') {
        requestBody.startYear = startYear;
        requestBody.startMonth = startMonth;
        requestBody.endYear = endYear;
        requestBody.endMonth = endMonth;
        requestBody.reportType = 'range';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate report');
      }

      showSuccess('Report generated successfully!');
      await loadGeneratedReports();

      if (result.report) {
        await downloadReport(result.report);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  }

  async function downloadReport(report: GeneratedReport) {
    try {
      console.log('Downloading report:', report.file_path);

      const { data, error } = await supabase.storage
        .from('reports')
        .download(report.file_path);

      if (error) {
        console.error('Download error:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No data received from storage');
      }

      console.log('Download successful, file size:', data.size);

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.file_name;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      showSuccess('Report downloaded successfully!');
    } catch (error: any) {
      console.error('Download failed:', error);
      showError('Failed to download report: ' + error.message);
    }
  }

  async function deleteReport(reportId: string) {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
      const report = generatedReports.find(r => r.id === reportId);
      if (!report) return;

      await supabase.storage
        .from('reports')
        .remove([report.file_path]);

      const { error } = await supabase
        .from('generated_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      showSuccess('Report deleted successfully!');
      await loadGeneratedReports();
    } catch (error: any) {
      showError('Failed to delete report: ' + error.message);
    }
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
      purpose: transactionForm.purpose || null,
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
        purpose: '',
        notes: '',
      });
      loadTransactions();
    }
  }

  async function handleChangeTransactionStatus(id: string, currentStatus: string, transactionNumber: string) {
    const newStatus = currentStatus === 'pending' ? 'confirmed' : 'pending';
    const statusLabel = newStatus === 'confirmed' ? 'confirm' : 'mark as pending';

    if (!confirm(`Are you sure you want to ${statusLabel} transaction ${transactionNumber}?\n\nNote: Budget changes only apply when status is "confirmed".`)) {
      return;
    }

    const { error } = await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      showError('Error updating transaction status: ' + error.message);
    } else {
      showSuccess(`Transaction ${newStatus === 'confirmed' ? 'confirmed' : 'marked as pending'} successfully!`);
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

    if (editingBudget) {
      const { error } = await supabase
        .from('branch_budgets')
        .update({
          branch_id: budgetForm.branch_id,
          budget_period: budgetForm.budget_period,
          year: budgetForm.year,
          month: budgetForm.budget_period === 'yearly' ? null : budgetForm.month,
          allocated_amount: parseFloat(budgetForm.allocated_amount),
          currency: budgetForm.currency,
          notes: budgetForm.notes || null,
        })
        .eq('id', editingBudget.id);

      if (error) {
        showError('Error updating budget: ' + error.message);
      } else {
        showSuccess('Budget updated successfully!');
        setShowAddBudget(false);
        setEditingBudget(null);
        resetBudgetForm();
        loadBudgets();
      }
    } else {
      const { error } = await supabase.from('branch_budgets').insert({
        branch_id: budgetForm.branch_id,
        budget_period: budgetForm.budget_period,
        year: budgetForm.year,
        month: budgetForm.budget_period === 'yearly' ? null : budgetForm.month,
        allocated_amount: parseFloat(budgetForm.allocated_amount),
        spent_amount: 0,
        currency: budgetForm.currency,
        notes: budgetForm.notes || null,
        created_by: profileData?.id,
      });

      if (error) {
        showError('Error creating budget: ' + error.message);
      } else {
        showSuccess('Budget created successfully!');
        setShowAddBudget(false);
        resetBudgetForm();
        loadBudgets();
      }
    }
  }

  function resetBudgetForm() {
    setBudgetForm({
      branch_id: '',
      budget_period: 'monthly',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      allocated_amount: '',
      spent_amount: '',
      currency: 'AFN',
      notes: '',
    });
  }

  function handleEditBudget(budget: Budget) {
    setEditingBudget(budget);
    setBudgetForm({
      branch_id: budget.branch_id,
      budget_period: budget.budget_period,
      year: budget.year,
      month: budget.month || new Date().getMonth() + 1,
      allocated_amount: budget.allocated_amount.toString(),
      spent_amount: budget.spent_amount.toString(),
      currency: budget.currency,
      notes: budget.notes || '',
    });
    setShowAddBudget(true);
  }

  async function handleDeleteBudget(id: string) {
    if (!confirm('Are you sure you want to delete this budget?')) {
      return;
    }

    const { error } = await supabase
      .from('branch_budgets')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Error deleting budget: ' + error.message);
    } else {
      showSuccess('Budget deleted successfully!');
      loadBudgets();
    }
  }


  function getFilteredTransactionsByPeriod(branchFilter?: (t: Transaction) => boolean) {
    if (reportType === 'single') {
      const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
      const endOfMonth = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
      return transactions.filter(t => {
        const transDate = new Date(t.transaction_date);
        const inPeriod = transDate >= startOfMonth && transDate <= endOfMonth;
        return inPeriod && (branchFilter ? branchFilter(t) : true);
      });
    } else if (reportType === 'yearly') {
      const startOfYear = new Date(selectedYear, 0, 1);
      const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);
      return transactions.filter(t => {
        const transDate = new Date(t.transaction_date);
        const inPeriod = transDate >= startOfYear && transDate <= endOfYear;
        return inPeriod && (branchFilter ? branchFilter(t) : true);
      });
    } else if (reportType === 'range') {
      const startDate = new Date(startYear, startMonth - 1, 1);
      const endDate = new Date(endYear, endMonth, 0, 23, 59, 59);
      return transactions.filter(t => {
        const transDate = new Date(t.transaction_date);
        const inPeriod = transDate >= startDate && transDate <= endDate;
        return inPeriod && (branchFilter ? branchFilter(t) : true);
      });
    }
    return [];
  }

  function getPeriodDescription() {
    if (reportType === 'single') {
      return new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (reportType === 'yearly') {
      return `${selectedYear}`;
    } else if (reportType === 'range') {
      const start = new Date(startYear, startMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const end = new Date(endYear, endMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return `${start} - ${end}`;
    }
    return '';
  }

  const filteredTransactions = transactions.filter(t => {
    const searchLower = searchTerm.toLowerCase();

    // Format dates for better matching (converts to MM/DD/YYYY format)
    const transactionDateFormatted = t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '';
    const receivedDateFormatted = t.received_date ? new Date(t.received_date).toLocaleDateString() : '';

    const matchesSearch =
      t.transaction_number.toLowerCase().includes(searchLower) ||
      t.from_branch?.name?.toLowerCase().includes(searchLower) ||
      t.to_branch?.name?.toLowerCase().includes(searchLower) ||
      t.from_staff?.full_name?.toLowerCase().includes(searchLower) ||
      t.to_staff?.full_name?.toLowerCase().includes(searchLower) ||
      t.transaction_date?.includes(searchTerm) ||
      transactionDateFormatted.includes(searchTerm) ||
      t.received_date?.includes(searchTerm) ||
      receivedDateFormatted.includes(searchTerm) ||
      t.purpose?.toLowerCase().includes(searchLower) ||
      t.notes?.toLowerCase().includes(searchLower) ||
      t.confirmation_code?.toLowerCase().includes(searchLower);

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
                  placeholder="Search by MTCN, date, branch, staff name, purpose..."
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Transaction Status:</strong> Budget changes only apply when a transaction status is "confirmed". You can change the status by clicking the status toggle button in the Actions column. Pending transactions do not affect budgets.
            </p>
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
                      <th className="text-left px-6 py-3 text-sm font-semibold text-slate-900">Purpose</th>
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
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {transaction.purpose || <span className="text-slate-400 italic">No purpose specified</span>}
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleChangeTransactionStatus(transaction.id, transaction.status, transaction.transaction_number)}
                              className={`p-2 rounded-lg transition-colors ${
                                transaction.status === 'pending'
                                  ? 'text-green-600 hover:bg-green-50'
                                  : 'text-yellow-600 hover:bg-yellow-50'
                              }`}
                              title={transaction.status === 'pending' ? 'Confirm transaction' : 'Mark as pending'}
                            >
                              {transaction.status === 'pending' ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <Clock className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(transaction.id, transaction.transaction_number)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete transaction"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Auto-deduction:</strong> When you create a confirmed transaction to a branch, the spent amount automatically deducts from the budget for that branch, matching the currency and period.
            </p>
          </div>

          <div className="grid gap-4">
            {budgets.map((budget) => {
              const remaining = budget.allocated_amount - budget.spent_amount;
              const percentageSpent = budget.allocated_amount > 0 ? (budget.spent_amount / budget.allocated_amount) * 100 : 0;

              return (
                <div key={budget.id} className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-bold text-slate-900">{budget.branch?.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditBudget(budget)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit budget"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteBudget(budget.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete budget"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-slate-500">Period</p>
                      <p className="text-sm font-medium text-slate-900">
                        {budget.budget_period === 'monthly' && `${budget.month}/${budget.year}`}
                        {budget.budget_period === 'yearly' && budget.year}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Currency</p>
                      <p className="text-sm font-medium text-slate-900">{budget.currency}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Allocated</span>
                      <span className="text-lg font-bold text-slate-900">
                        {budget.allocated_amount.toLocaleString()} {budget.currency}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Spent</span>
                      <span className="text-lg font-semibold text-red-600">
                        {budget.spent_amount.toLocaleString()} {budget.currency}
                      </span>
                    </div>

                    <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          percentageSpent >= 100
                            ? 'bg-red-500'
                            : percentageSpent >= 75
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(percentageSpent, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-sm font-medium text-slate-600">Remaining</span>
                      <span className={`text-xl font-bold ${
                        remaining >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {remaining.toLocaleString()} {budget.currency}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 text-center">
                      {percentageSpent.toFixed(1)}% of budget used
                    </div>
                  </div>

                  {budget.notes && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-sm text-slate-600">{budget.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Generate Transaction Reports</h2>
            <p className="text-slate-600 mb-4">Generate comprehensive transaction reports for specific periods.</p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Report Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="single"
                    checked={reportType === 'single'}
                    onChange={(e) => setReportType(e.target.value as 'single' | 'yearly' | 'range')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-slate-700">Single Month</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="yearly"
                    checked={reportType === 'yearly'}
                    onChange={(e) => setReportType(e.target.value as 'single' | 'yearly' | 'range')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-slate-700">Full Year</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="range"
                    checked={reportType === 'range'}
                    onChange={(e) => setReportType(e.target.value as 'single' | 'yearly' | 'range')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-slate-700">Date Range</span>
                </label>
              </div>
            </div>

            {reportType === 'single' && (
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Month
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={1}>January</option>
                    <option value={2}>February</option>
                    <option value={3}>March</option>
                    <option value={4}>April</option>
                    <option value={5}>May</option>
                    <option value={6}>June</option>
                    <option value={7}>July</option>
                    <option value={8}>August</option>
                    <option value={9}>September</option>
                    <option value={10}>October</option>
                    <option value={11}>November</option>
                    <option value={12}>December</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {reportType === 'yearly' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            )}

            {reportType === 'range' && (
              <div className="space-y-4 mb-6">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      From Month
                    </label>
                    <select
                      value={startMonth}
                      onChange={(e) => setStartMonth(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={1}>January</option>
                      <option value={2}>February</option>
                      <option value={3}>March</option>
                      <option value={4}>April</option>
                      <option value={5}>May</option>
                      <option value={6}>June</option>
                      <option value={7}>July</option>
                      <option value={8}>August</option>
                      <option value={9}>September</option>
                      <option value={10}>October</option>
                      <option value={11}>November</option>
                      <option value={12}>December</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      From Year
                    </label>
                    <select
                      value={startYear}
                      onChange={(e) => setStartYear(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      To Month
                    </label>
                    <select
                      value={endMonth}
                      onChange={(e) => setEndMonth(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={1}>January</option>
                      <option value={2}>February</option>
                      <option value={3}>March</option>
                      <option value={4}>April</option>
                      <option value={5}>May</option>
                      <option value={6}>June</option>
                      <option value={7}>July</option>
                      <option value={8}>August</option>
                      <option value={9}>September</option>
                      <option value={10}>October</option>
                      <option value={11}>November</option>
                      <option value={12}>December</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      To Year
                    </label>
                    <select
                      value={endYear}
                      onChange={(e) => setEndYear(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {branches.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No branches available. Create branches first.</p>
                </div>
              ) : (
                <>
                  {branches.map((branch) => {
                    const branchTransactions = getFilteredTransactionsByPeriod(
                      (t) => t.from_branch_id === branch.id || t.to_branch_id === branch.id
                    );

                    return (
                      <div key={branch.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <div>
                            <span className="font-medium text-slate-900">{branch.name}</span>
                            <p className="text-sm text-slate-500">
                              {branchTransactions.length} transaction{branchTransactions.length !== 1 ? 's' : ''} in {getPeriodDescription()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => generateMonthlyReport(branch.id)}
                          disabled={branchTransactions.length === 0 || generatingReport}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                            branchTransactions.length === 0 || generatingReport
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                          title={branchTransactions.length === 0 ? 'No transactions for this period' : 'Generate PDF report'}
                        >
                          <Download className="w-4 h-4" />
                          {generatingReport ? 'Generating...' : 'Generate PDF Report'}
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
                        const allTransactions = getFilteredTransactionsByPeriod();
                        return `${allTransactions.length} transaction${allTransactions.length !== 1 ? 's' : ''} in ${getPeriodDescription()}`;
                      })()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => generateMonthlyReport(null)}
                  disabled={(() => {
                    const allTransactions = getFilteredTransactionsByPeriod();
                    return allTransactions.length === 0 || generatingReport;
                  })()}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    (() => {
                      const allTransactions = getFilteredTransactionsByPeriod();
                      return allTransactions.length === 0 || generatingReport;
                    })()
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  title={(() => {
                    const allTransactions = getFilteredTransactionsByPeriod();
                    return allTransactions.length === 0 ? 'No transactions for this period' : 'Generate combined PDF report';
                  })()}
                >
                  <Download className="w-4 h-4" />
                  {generatingReport ? 'Generating...' : 'Generate Combined PDF Report'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Generated Reports</h2>
                <p className="text-slate-600 mt-1">View and download previously generated PDF reports.</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by branch, period, type, date, file name, currency..."
                  value={reportSearchTerm}
                  onChange={(e) => setReportSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {generatedReports.filter(report => {
              if (!reportSearchTerm) return true;
              const searchLower = reportSearchTerm.toLowerCase();
              return (
                (report.branch?.name || 'All Branches').toLowerCase().includes(searchLower) ||
                report.report_period.toLowerCase().includes(searchLower) ||
                report.report_type.toLowerCase().includes(searchLower) ||
                report.file_name.toLowerCase().includes(searchLower) ||
                report.currency.toLowerCase().includes(searchLower) ||
                (report.generated_at && new Date(report.generated_at).toLocaleDateString().includes(reportSearchTerm)) ||
                (report.generated_at && report.generated_at.includes(reportSearchTerm))
              );
            }).length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>No reports generated yet.</p>
                <p className="text-sm mt-2">Generate your first report above!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {generatedReports.filter(report => {
                  if (!reportSearchTerm) return true;
                  const searchLower = reportSearchTerm.toLowerCase();
                  return (
                    (report.branch?.name || 'All Branches').toLowerCase().includes(searchLower) ||
                    report.report_period.toLowerCase().includes(searchLower) ||
                    report.report_type.toLowerCase().includes(searchLower) ||
                    report.file_name.toLowerCase().includes(searchLower) ||
                    report.currency.toLowerCase().includes(searchLower) ||
                    (report.generated_at && new Date(report.generated_at).toLocaleDateString().includes(reportSearchTerm)) ||
                    (report.generated_at && report.generated_at.includes(reportSearchTerm))
                  );
                }).map((report) => (
                  <div key={report.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`p-3 rounded-lg ${
                        report.status === 'completed' ? 'bg-green-100' :
                        report.status === 'failed' ? 'bg-red-100' : 'bg-yellow-100'
                      }`}>
                        <FileText className={`w-6 h-6 ${
                          report.status === 'completed' ? 'text-green-600' :
                          report.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">{report.branch?.name || 'All Branches'}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {report.report_period}
                          </span>
                          <span>{report.transaction_count} transactions</span>
                          <span className="font-medium">{report.total_amount.toLocaleString()} {report.currency}</span>
                        </div>
                        {report.generated_at && (
                          <p className="text-xs text-slate-500 mt-1">
                            Generated {new Date(report.generated_at).toLocaleString()}
                          </p>
                        )}
                        {report.error_message && (
                          <p className="text-xs text-red-600 mt-1">Error: {report.error_message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.status === 'completed' && (
                        <button
                          onClick={() => downloadReport(report)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      )}
                      <button
                        onClick={() => deleteReport(report.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete report"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Purpose / Reason *</label>
                <textarea
                  value={transactionForm.purpose}
                  onChange={(e) => setTransactionForm({ ...transactionForm, purpose: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Monthly staff salaries, Office supplies, Equipment purchase..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Additional Notes</label>
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
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingBudget ? 'Edit Budget' : 'Add Budget'}
              </h2>
              <button
                onClick={() => {
                  setShowAddBudget(false);
                  setEditingBudget(null);
                  resetBudgetForm();
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBudget} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Branch</label>
                <select
                  value={budgetForm.branch_id}
                  onChange={(e) => setBudgetForm({ ...budgetForm, branch_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Budget Period</label>
                <select
                  value={budgetForm.budget_period}
                  onChange={(e) => setBudgetForm({ ...budgetForm, budget_period: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Year</label>
                  <input
                    type="number"
                    value={budgetForm.year}
                    onChange={(e) => setBudgetForm({ ...budgetForm, year: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {budgetForm.budget_period === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Month</label>
                    <select
                      value={budgetForm.month}
                      onChange={(e) => setBudgetForm({ ...budgetForm, month: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                        <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetForm.allocated_amount}
                    onChange={(e) => setBudgetForm({ ...budgetForm, allocated_amount: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Spent Amount (Auto-calculated)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetForm.spent_amount}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100 cursor-not-allowed"
                    placeholder="Auto-calculated from transactions"
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-slate-500 mt-1">Automatically updated when confirmed transactions are added</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
                <select
                  value={budgetForm.currency}
                  onChange={(e) => setBudgetForm({ ...budgetForm, currency: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="AFN">AFN (Afghan Afghani)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea
                  value={budgetForm.notes}
                  onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {editingBudget ? 'Update' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBudget(false);
                    setEditingBudget(null);
                    resetBudgetForm();
                  }}
                  className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
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
