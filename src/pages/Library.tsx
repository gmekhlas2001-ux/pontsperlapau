import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/Toast';
import {
  Library as LibraryIcon,
  Search,
  Plus,
  Eye,
  Trash2,
  X,
  BookOpen,
  Calendar,
  User,
  Building2,
  CreditCard as Edit,
  Check,
  XCircle,
  Clock,
  CheckCircle
} from 'lucide-react';

interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  publication_year: number | null;
  category: string | null;
  description: string | null;
  total_copies: number;
  available_copies: number;
  branch_id: string | null;
  branch_name: string | null;
  cover_image_url: string | null;
  created_at: string;
}

interface BookLoan {
  id: string;
  book_id: string;
  book_title: string;
  borrower_id: string;
  borrower_name: string;
  borrower_type: string;
  loan_date: string | null;
  due_date: string | null;
  return_date: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
}

export function Library() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<BookLoan[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'books' | 'loans' | 'myLoans'>('books');
  const [showAddBook, setShowAddBook] = useState(false);
  const [showEditBook, setShowEditBook] = useState(false);
  const [showBookDetails, setShowBookDetails] = useState(false);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userProfileId, setUserProfileId] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    publication_year: '',
    category: '',
    description: '',
    total_copies: '1',
    branch_id: '',
  });

  const [borrowForm, setBorrowForm] = useState({
    loan_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
  });

  useEffect(() => {
    loadUserProfile();
    loadBooks();
    loadLoans();
    loadBranches();
  }, []);

  async function loadUserProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, role_id')
      .eq('auth_user_id', user?.id)
      .maybeSingle();

    if (data) {
      setUserRole(data.role_id);
      setUserProfileId(data.id);
    }
  }

  async function loadBranches() {
    const { data } = await supabase.from('branches').select('id, name').order('name');
    setBranches(data || []);
  }

  async function loadBooks() {
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*, branches(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const booksWithBranch = data?.map(book => ({
        ...book,
        branch_name: book.branches?.name || null,
      })) || [];

      setBooks(booksWithBranch);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadLoans() {
    try {
      const { data, error } = await supabase
        .from('book_loans')
        .select('*, books(title), profiles!book_loans_borrower_id_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const loansWithDetails = data?.map(loan => ({
        id: loan.id,
        book_id: loan.book_id,
        book_title: loan.books?.title || 'Unknown',
        borrower_id: loan.borrower_id,
        borrower_name: loan.profiles?.full_name || 'Unknown',
        borrower_type: loan.borrower_type,
        loan_date: loan.loan_date,
        due_date: loan.due_date,
        return_date: loan.return_date,
        status: loan.status,
        approved_by: loan.approved_by,
        approved_at: loan.approved_at,
        notes: loan.notes,
        created_at: loan.created_at,
      })) || [];

      setLoans(loansWithDetails);
    } catch (error) {
      console.error('Error loading loans:', error);
    }
  }

  async function handleAddBook(e: React.FormEvent) {
    e.preventDefault();

    try {
      const { error } = await supabase.from('books').insert({
        title: bookForm.title,
        author: bookForm.author || null,
        isbn: bookForm.isbn || null,
        publisher: bookForm.publisher || null,
        publication_year: bookForm.publication_year ? parseInt(bookForm.publication_year) : null,
        category: bookForm.category || null,
        description: bookForm.description || null,
        total_copies: parseInt(bookForm.total_copies),
        available_copies: parseInt(bookForm.total_copies),
        branch_id: bookForm.branch_id || null,
      });

      if (error) throw error;

      setToast({ message: 'Book added successfully!', type: 'success' });
      setShowAddBook(false);
      setBookForm({
        title: '',
        author: '',
        isbn: '',
        publisher: '',
        publication_year: '',
        category: '',
        description: '',
        total_copies: '1',
        branch_id: '',
      });
      loadBooks();
    } catch (error: any) {
      setToast({ message: 'Error adding book: ' + error.message, type: 'error' });
    }
  }

  async function handleDeleteBook(book: Book) {
    if (!confirm(`Are you sure you want to delete "${book.title}"?`)) return;

    try {
      const { error } = await supabase.from('books').delete().eq('id', book.id);

      if (error) throw error;

      setToast({ message: 'Book deleted successfully!', type: 'success' });
      loadBooks();
    } catch (error: any) {
      setToast({ message: 'Error deleting book: ' + error.message, type: 'error' });
    }
  }

  async function handleBorrowBook(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedBook || !userProfileId) return;

    try {
      const { error } = await supabase.from('book_loans').insert({
        book_id: selectedBook.id,
        borrower_id: userProfileId,
        borrower_type: userRole === 'student' ? 'student' : 'staff',
        loan_date: borrowForm.loan_date,
        due_date: borrowForm.due_date,
        status: 'pending',
        notes: borrowForm.notes || null,
      });

      if (error) throw error;

      setToast({ message: 'Book borrow request submitted! Awaiting approval.', type: 'success' });
      setShowBorrowModal(false);
      setBorrowForm({
        loan_date: new Date().toISOString().split('T')[0],
        due_date: '',
        notes: '',
      });
      loadLoans();
    } catch (error: any) {
      setToast({ message: 'Error requesting book: ' + error.message, type: 'error' });
    }
  }

  async function handleApproveLoan(loanId: string) {
    try {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) return;

      const book = books.find(b => b.id === loan.book_id);
      if (!book || book.available_copies < 1) {
        setToast({ message: 'No copies available', type: 'error' });
        return;
      }

      const { error: loanError } = await supabase
        .from('book_loans')
        .update({
          status: 'active',
          approved_by: userProfileId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', loanId);

      if (loanError) throw loanError;

      const { error: bookError } = await supabase
        .from('books')
        .update({ available_copies: book.available_copies - 1 })
        .eq('id', book.id);

      if (bookError) throw bookError;

      setToast({ message: 'Loan approved!', type: 'success' });
      loadLoans();
      loadBooks();
    } catch (error: any) {
      setToast({ message: 'Error approving loan: ' + error.message, type: 'error' });
    }
  }

  async function handleRejectLoan(loanId: string) {
    if (!confirm('Are you sure you want to reject this loan request?')) return;

    try {
      const { error } = await supabase
        .from('book_loans')
        .update({ status: 'rejected' })
        .eq('id', loanId);

      if (error) throw error;

      setToast({ message: 'Loan rejected', type: 'success' });
      loadLoans();
    } catch (error: any) {
      setToast({ message: 'Error rejecting loan: ' + error.message, type: 'error' });
    }
  }

  async function handleRequestReturn(loanId: string) {
    try {
      const { error } = await supabase
        .from('book_loans')
        .update({ status: 'return_requested' })
        .eq('id', loanId);

      if (error) throw error;

      setToast({ message: 'Return request submitted! Awaiting admin confirmation.', type: 'success' });
      loadLoans();
    } catch (error: any) {
      setToast({ message: 'Error requesting return: ' + error.message, type: 'error' });
    }
  }

  async function handleReturnBook(loanId: string) {
    try {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) return;

      const { error: loanError } = await supabase
        .from('book_loans')
        .update({
          status: 'returned',
          return_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', loanId);

      if (loanError) throw loanError;

      const book = books.find(b => b.id === loan.book_id);
      if (book) {
        const { error: bookError } = await supabase
          .from('books')
          .update({ available_copies: book.available_copies + 1 })
          .eq('id', book.id);

        if (bookError) throw bookError;
      }

      setToast({ message: 'Book return confirmed successfully!', type: 'success' });
      loadLoans();
      loadBooks();
    } catch (error: any) {
      setToast({ message: 'Error confirming return: ' + error.message, type: 'error' });
    }
  }

  function openEditBook(book: Book) {
    setSelectedBook(book);
    setBookForm({
      title: book.title,
      author: book.author || '',
      isbn: book.isbn || '',
      publisher: book.publisher || '',
      publication_year: book.publication_year?.toString() || '',
      category: book.category || '',
      description: book.description || '',
      total_copies: book.total_copies.toString(),
      branch_id: book.branch_id || '',
    });
    setShowEditBook(true);
  }

  async function handleEditBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBook) return;

    try {
      const { error } = await supabase
        .from('books')
        .update({
          title: bookForm.title,
          author: bookForm.author || null,
          isbn: bookForm.isbn || null,
          publisher: bookForm.publisher || null,
          publication_year: bookForm.publication_year ? parseInt(bookForm.publication_year) : null,
          category: bookForm.category || null,
          description: bookForm.description || null,
          total_copies: parseInt(bookForm.total_copies),
          branch_id: bookForm.branch_id || null,
        })
        .eq('id', selectedBook.id);

      if (error) throw error;

      setToast({ message: 'Book updated successfully!', type: 'success' });
      setShowEditBook(false);
      loadBooks();
    } catch (error: any) {
      setToast({ message: 'Error updating book: ' + error.message, type: 'error' });
    }
  }

  function openBorrowModal(book: Book) {
    setSelectedBook(book);
    setShowBorrowModal(true);
  }

  function openBookDetails(book: Book) {
    setSelectedBook(book);
    setShowBookDetails(true);
  }

  const filteredBooks = books.filter(book =>
    book.title.toLowerCase().includes(search.toLowerCase()) ||
    book.author?.toLowerCase().includes(search.toLowerCase()) ||
    book.category?.toLowerCase().includes(search.toLowerCase())
  );

  const myLoans = loans.filter(loan => loan.borrower_id === userProfileId);
  const pendingLoans = loans.filter(loan => loan.status === 'pending');
  const activeLoans = loans.filter(loan => loan.status === 'active');
  const returnRequestedLoans = loans.filter(loan => loan.status === 'return_requested');
  const isAdmin = userRole === 'admin' || userRole === 'librarian';

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Library</h1>
          <p className="text-slate-600">Manage books and borrowing</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddBook(true)}
            className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            Add Book
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('books')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'books'
              ? 'text-amber-600 border-b-2 border-amber-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Books ({books.length})
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('loans')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'loans'
                ? 'text-amber-600 border-b-2 border-amber-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Loans ({loans.length})
          </button>
        )}
        <button
          onClick={() => setActiveTab('myLoans')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'myLoans'
              ? 'text-amber-600 border-b-2 border-amber-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          My Loans ({myLoans.length})
        </button>
      </div>

      {activeTab === 'books' && (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search books by title, author, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBooks.map((book) => (
              <div key={book.id} className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
                    {book.title.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 mb-1 truncate">{book.title}</h3>
                    {book.author && <p className="text-sm text-slate-600 mb-2">{book.author}</p>}
                    {book.category && (
                      <span className="inline-block px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                        {book.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  {book.branch_name && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="w-4 h-4" />
                      <span>{book.branch_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-600">
                    <BookOpen className="w-4 h-4" />
                    <span>{book.available_copies} of {book.total_copies} available</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openBookDetails(book)}
                    className="flex-1 min-w-[100px] px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    Details
                  </button>
                  {book.available_copies > 0 && (
                    <button
                      onClick={() => openBorrowModal(book)}
                      className="flex-1 min-w-[100px] px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
                    >
                      Borrow
                    </button>
                  )}
                  {(() => {
                    const userActiveLoan = loans.find(
                      l => l.book_id === book.id &&
                      l.borrower_id === userProfileId &&
                      (l.status === 'active' || l.status === 'return_requested')
                    );
                    if (userActiveLoan && userActiveLoan.status === 'active') {
                      return (
                        <button
                          onClick={() => handleRequestReturn(userActiveLoan.id)}
                          className="flex-1 min-w-[100px] px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          Return
                        </button>
                      );
                    }
                    if (userActiveLoan && userActiveLoan.status === 'return_requested') {
                      return (
                        <button
                          disabled
                          className="flex-1 min-w-[100px] px-3 py-2 bg-slate-300 text-slate-500 rounded-lg cursor-not-allowed text-sm"
                        >
                          Pending Return
                        </button>
                      );
                    }
                    return null;
                  })()}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openEditBook(book)}
                        className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteBook(book)}
                        className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'loans' && isAdmin && (
        <div className="space-y-4">
          {pendingLoans.length > 0 && (
            <div>
              <h3 className="font-bold text-lg mb-4">Pending Approvals ({pendingLoans.length})</h3>
              <div className="space-y-3">
                {pendingLoans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    onApprove={handleApproveLoan}
                    onReject={handleRejectLoan}
                    onReturn={handleReturnBook}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          )}

          {returnRequestedLoans.length > 0 && (
            <div>
              <h3 className="font-bold text-lg mb-4">Return Requests ({returnRequestedLoans.length})</h3>
              <div className="space-y-3">
                {returnRequestedLoans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    onApprove={handleApproveLoan}
                    onReject={handleRejectLoan}
                    onReturn={handleReturnBook}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-bold text-lg mb-4">Active Loans ({activeLoans.length})</h3>
            <div className="space-y-3">
              {activeLoans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  onApprove={handleApproveLoan}
                  onReject={handleRejectLoan}
                  onReturn={handleReturnBook}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">All Loans History</h3>
            <div className="space-y-3">
              {loans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  onApprove={handleApproveLoan}
                  onReject={handleRejectLoan}
                  onReturn={handleReturnBook}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'myLoans' && (
        <div className="space-y-3">
          {myLoans.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              You haven't borrowed any books yet
            </div>
          ) : (
            myLoans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                onApprove={handleApproveLoan}
                onReject={handleRejectLoan}
                onReturn={handleReturnBook}
                isAdmin={false}
              />
            ))
          )}
        </div>
      )}

      {showAddBook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Add Book</h2>
              <button onClick={() => setShowAddBook(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddBook} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={bookForm.title}
                  onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Author</label>
                  <input
                    type="text"
                    value={bookForm.author}
                    onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">ISBN</label>
                  <input
                    type="text"
                    value={bookForm.isbn}
                    onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Publisher</label>
                  <input
                    type="text"
                    value={bookForm.publisher}
                    onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Publication Year</label>
                  <input
                    type="number"
                    value={bookForm.publication_year}
                    onChange={(e) => setBookForm({ ...bookForm, publication_year: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <input
                    type="text"
                    value={bookForm.category}
                    onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })}
                    placeholder="e.g., Fiction, Science, History"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Total Copies *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={bookForm.total_copies}
                    onChange={(e) => setBookForm({ ...bookForm, total_copies: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Branch</label>
                <select
                  value={bookForm.branch_id}
                  onChange={(e) => setBookForm({ ...bookForm, branch_id: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select Branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  rows={3}
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700"
                >
                  Add Book
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBook(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBorrowModal && selectedBook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Borrow Book</h2>
              <button onClick={() => setShowBorrowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleBorrowBook} className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl">
                <h3 className="font-bold text-slate-900">{selectedBook.title}</h3>
                {selectedBook.author && <p className="text-sm text-slate-600">{selectedBook.author}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Loan Date *</label>
                <input
                  type="date"
                  required
                  value={borrowForm.loan_date}
                  onChange={(e) => setBorrowForm({ ...borrowForm, loan_date: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Due Date *</label>
                <input
                  type="date"
                  required
                  value={borrowForm.due_date}
                  onChange={(e) => setBorrowForm({ ...borrowForm, due_date: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea
                  rows={2}
                  value={borrowForm.notes}
                  onChange={(e) => setBorrowForm({ ...borrowForm, notes: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700"
                >
                  Submit Request
                </button>
                <button
                  type="button"
                  onClick={() => setShowBorrowModal(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBookDetails && selectedBook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Book Details</h2>
              <button onClick={() => setShowBookDetails(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedBook.title}</h3>
                {selectedBook.author && <p className="text-lg text-slate-600 mb-4">{selectedBook.author}</p>}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {selectedBook.isbn && <DetailItem label="ISBN" value={selectedBook.isbn} />}
                {selectedBook.publisher && <DetailItem label="Publisher" value={selectedBook.publisher} />}
                {selectedBook.publication_year && <DetailItem label="Year" value={selectedBook.publication_year.toString()} />}
                {selectedBook.category && <DetailItem label="Category" value={selectedBook.category} />}
                {selectedBook.branch_name && <DetailItem label="Branch" value={selectedBook.branch_name} />}
                <DetailItem label="Total Copies" value={selectedBook.total_copies.toString()} />
                <DetailItem label="Available" value={selectedBook.available_copies.toString()} />
              </div>

              {selectedBook.description && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Description</p>
                  <p className="text-slate-900 bg-slate-50 p-4 rounded-xl">{selectedBook.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showEditBook && selectedBook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Edit Book</h2>
              <button onClick={() => setShowEditBook(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditBook} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={bookForm.title}
                  onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Author</label>
                  <input
                    type="text"
                    value={bookForm.author}
                    onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">ISBN</label>
                  <input
                    type="text"
                    value={bookForm.isbn}
                    onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Publisher</label>
                  <input
                    type="text"
                    value={bookForm.publisher}
                    onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Publication Year</label>
                  <input
                    type="number"
                    value={bookForm.publication_year}
                    onChange={(e) => setBookForm({ ...bookForm, publication_year: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <input
                    type="text"
                    value={bookForm.category}
                    onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })}
                    placeholder="e.g., Fiction, Science, History"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Total Copies *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={bookForm.total_copies}
                    onChange={(e) => setBookForm({ ...bookForm, total_copies: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Branch</label>
                <select
                  value={bookForm.branch_id}
                  onChange={(e) => setBookForm({ ...bookForm, branch_id: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select Branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  rows={3}
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700"
                >
                  Update Book
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditBook(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300"
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
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function LoanCard({
  loan,
  onApprove,
  onReject,
  onReturn,
  isAdmin
}: {
  loan: BookLoan;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReturn: (id: string) => void;
  isAdmin: boolean;
}) {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    return_requested: 'bg-orange-100 text-orange-700',
    returned: 'bg-slate-100 text-slate-700',
    overdue: 'bg-red-100 text-red-700',
    rejected: 'bg-red-100 text-red-700',
  };

  const statusIcons = {
    pending: Clock,
    approved: Check,
    active: CheckCircle,
    return_requested: Clock,
    returned: CheckCircle,
    overdue: XCircle,
    rejected: XCircle,
  };

  const StatusIcon = statusIcons[loan.status as keyof typeof statusIcons];

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="font-bold text-slate-900">{loan.book_title}</h4>
          <p className="text-sm text-slate-600">{loan.borrower_name} ({loan.borrower_type})</p>
        </div>
        <span className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium ${statusColors[loan.status as keyof typeof statusColors]}`}>
          <StatusIcon className="w-3 h-3" />
          {loan.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        {loan.loan_date && (
          <div>
            <span className="text-slate-500">Loan Date:</span>
            <span className="ml-2 text-slate-900">{new Date(loan.loan_date).toLocaleDateString()}</span>
          </div>
        )}
        {loan.due_date && (
          <div>
            <span className="text-slate-500">Due Date:</span>
            <span className="ml-2 text-slate-900">{new Date(loan.due_date).toLocaleDateString()}</span>
          </div>
        )}
        {loan.return_date && (
          <div>
            <span className="text-slate-500">Returned:</span>
            <span className="ml-2 text-slate-900">{new Date(loan.return_date).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {loan.notes && (
        <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded mb-3">{loan.notes}</p>
      )}

      {isAdmin && loan.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(loan.id)}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={() => onReject(loan.id)}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}

      {isAdmin && loan.status === 'return_requested' && (
        <button
          onClick={() => onReturn(loan.id)}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Confirm Return
        </button>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 p-3 rounded-xl">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-slate-900 font-medium">{value}</p>
    </div>
  );
}
