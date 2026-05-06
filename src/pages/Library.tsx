import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui-custom/DataTable';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import { StatCard } from '@/components/ui-custom/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, MoveHorizontal as MoreHorizontal, BookOpen, CircleCheck as CheckCircle, Pencil, Trash2, Clock, BookMarked } from 'lucide-react';
import { toast } from 'sonner';
import {
  getBooks,
  createBook,
  updateBook,
  deleteBook,
  type BookRow,
  type CreateBookData,
  type UpdateBookData,
} from '@/services/libraryService';
import { getBranches, type Branch } from '@/services/branchService';
import { useAuth } from '@/contexts/AuthContext';

const EMPTY_FORM: CreateBookData = {
  title: '',
  author: '',
  isbn: '',
  publisher: '',
  publication_year: undefined,
  category: '',
  description: '',
  language: 'English',
  total_copies: 1,
  location_shelf: '',
};

export function Library() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = ['superadmin', 'admin', 'librarian'].includes(user?.role ?? '');
  const [books, setBooks] = useState<BookRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedBook, setSelectedBook] = useState<BookRow | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<BookRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [addForm, setAddForm] = useState<CreateBookData>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<UpdateBookData>({});

  const [isBorrowDialogOpen, setIsBorrowDialogOpen] = useState(false);
  const [borrowBook, setBorrowBook] = useState<BookRow | null>(null);
  const [borrowedCount, setBorrowedCount] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);

  const fetchBooks = useCallback(async () => {
    const result = await getBooks();
    if (result.success && result.data) {
      setBooks(result.data);
    } else {
      toast.error(result.error || t('common.error'));
    }
  }, [t]);

  useEffect(() => {
    fetchBooks();
    getBranches().then((r) => { if (r.success && r.data) setBranches(r.data); });
  }, [fetchBooks]);

  const totalBooks = books.reduce((sum, b) => sum + b.total_copies, 0);
  const availableBooks = books.reduce((sum, b) => sum + b.available_copies, 0);
  const borrowedBooks = totalBooks - availableBooks;

  const handleAddSubmit = async () => {
    if (!addForm.title.trim() || !addForm.author.trim()) {
      toast.error(t('validation.required'));
      return;
    }
    setSaving(true);
    const result = await createBook(addForm);
    setSaving(false);
    if (result.success) {
      toast.success(t('common.success'));
      setIsAddDialogOpen(false);
      setAddForm(EMPTY_FORM);
      fetchBooks();
    } else {
      toast.error(result.error || t('common.error'));
    }
  };

  const handleEditOpen = (book: BookRow) => {
    setSelectedBook(book);
    setEditForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn || '',
      publisher: book.publisher || '',
      publication_year: book.publication_year || undefined,
      category: book.category || '',
      description: book.description || '',
      language: book.language || 'English',
      total_copies: book.total_copies,
      available_copies: book.available_copies,
      location_shelf: book.location_shelf || '',
      physical_condition: book.physical_condition || 'good',
      branch_id: book.branch_id || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!selectedBook) return;
    if (!editForm.title?.trim() || !editForm.author?.trim()) {
      toast.error(t('validation.required'));
      return;
    }
    setSaving(true);
    const result = await updateBook(selectedBook.id, editForm);
    setSaving(false);
    if (result.success) {
      toast.success(t('common.success'));
      setIsEditDialogOpen(false);
      setSelectedBook(null);
      fetchBooks();
    } else {
      toast.error(result.error || t('common.error'));
    }
  };

  const handleBorrowOpen = (book: BookRow) => {
    setBorrowBook(book);
    setBorrowedCount(book.total_copies - book.available_copies);
    setIsBorrowDialogOpen(true);
  };

  const handleBorrowSubmit = async () => {
    if (!borrowBook) return;
    const newBorrowed = Math.max(0, Math.min(borrowedCount, borrowBook.total_copies));
    const newAvailable = borrowBook.total_copies - newBorrowed;
    setSaving(true);
    const result = await updateBook(borrowBook.id, { available_copies: newAvailable });
    setSaving(false);
    if (result.success) {
      toast.success(t('common.success'));
      setIsBorrowDialogOpen(false);
      setBorrowBook(null);
      fetchBooks();
    } else {
      toast.error(result.error || t('common.error'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!bookToDelete) return;
    setDeleting(true);
    const result = await deleteBook(bookToDelete.id, bookToDelete.title);
    setDeleting(false);
    if (result.success) {
      toast.success(t('common.success'));
      setIsDeleteDialogOpen(false);
      setBookToDelete(null);
      fetchBooks();
    } else {
      toast.error(result.error || t('common.error'));
      setIsDeleteDialogOpen(false);
      setBookToDelete(null);
    }
  };

  const getBookStatus = (book: BookRow): 'active' | 'inactive' | 'pending' => {
    if (book.available_copies === 0) return 'inactive';
    if (book.available_copies < book.total_copies) return 'pending';
    return 'active';
  };

  const columns = [
    {
      key: 'title',
      header: t('library.title'),
      cell: (book: BookRow) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{book.title}</p>
            <p className="text-sm text-muted-foreground">{book.author}</p>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'isbn',
      header: t('library.isbn'),
      cell: (book: BookRow) => book.isbn || '-',
    },
    {
      key: 'category',
      header: t('library.category'),
      cell: (book: BookRow) => book.category || '-',
      sortable: true,
    },
    {
      key: 'copies',
      header: t('library.copies'),
      cell: (book: BookRow) => (
        <span>
          {book.available_copies} / {book.total_copies}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('library.status'),
      cell: (book: BookRow) => <StatusBadge status={getBookStatus(book)} />,
      sortable: true,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (book: BookRow) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSelectedBook(book); setIsDetailOpen(true); }}>
              <BookOpen className="mr-2 h-4 w-4" />
              {t('common.view')}
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuItem onClick={() => handleEditOpen(book)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBorrowOpen(book)}>
                  <BookMarked className="mr-2 h-4 w-4" />
                  Update Borrowed Copies
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => { setBookToDelete(book); setIsDeleteDialogOpen(true); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('library.management')}</h1>
          <p className="text-muted-foreground">{t('library.bookList')}</p>
        </div>
        {canManage && (
          <Button onClick={() => { setAddForm(EMPTY_FORM); setIsAddDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t('library.addBook')}
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t('dashboard.totalBooks')}
          value={totalBooks}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.availableBooks')}
          value={availableBooks}
          icon={CheckCircle}
          iconClassName="bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        />
        <StatCard
          title={t('dashboard.borrowedBooks')}
          value={borrowedBooks}
          icon={BookMarked}
          iconClassName="bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
        />
      </div>

      <Tabs defaultValue="books">
        <TabsList>
          <TabsTrigger value="books">{t('library.bookList')}</TabsTrigger>
          {canManage && <TabsTrigger value="borrowed">{t('library.borrowedBooks')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="books">
          <DataTable
            data={books}
            columns={columns}
            keyExtractor={(book) => book.id}
            searchKeys={['title', 'author', 'isbn', 'category']}
          />
        </TabsContent>

        <TabsContent value="borrowed">
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="text-center space-y-2">
              <Clock className="h-10 w-10 mx-auto opacity-40" />
              <p>{t('common.noData')}</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Book Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('library.addBook')}</DialogTitle>
            <VisuallyHidden>
              <DialogDescription>Add a new book to the library</DialogDescription>
            </VisuallyHidden>
          </DialogHeader>
          <BookForm
            form={addForm}
            onChange={(k, v) => setAddForm((prev) => ({ ...prev, [k]: v }))}
            onSubmit={handleAddSubmit}
            onCancel={() => setIsAddDialogOpen(false)}
            saving={saving}
            t={t}
            branches={branches}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Book Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('library.editBook')}</DialogTitle>
            <VisuallyHidden>
              <DialogDescription>Edit book details</DialogDescription>
            </VisuallyHidden>
          </DialogHeader>
          <BookForm
            form={editForm as CreateBookData}
            onChange={(k, v) => setEditForm((prev) => ({ ...prev, [k]: v }))}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditDialogOpen(false)}
            saving={saving}
            t={t}
            showCondition
            condition={editForm.physical_condition}
            onConditionChange={(v) => setEditForm((prev) => ({ ...prev, physical_condition: v as 'excellent' | 'good' | 'fair' | 'poor' }))}
            branches={branches}
          />
        </DialogContent>
      </Dialog>

      {/* Book Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedBook && (
            <>
              <DialogHeader>
                <VisuallyHidden>
                  <DialogDescription>Book details</DialogDescription>
                </VisuallyHidden>
                <DialogTitle>{selectedBook.title}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="flex gap-4">
                  <div className="w-24 h-32 bg-muted rounded flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">{t('library.author')}</Label>
                      <p className="font-medium">{selectedBook.author}</p>
                    </div>
                    {selectedBook.isbn && (
                      <div>
                        <Label className="text-muted-foreground">{t('library.isbn')}</Label>
                        <p>{selectedBook.isbn}</p>
                      </div>
                    )}
                    {selectedBook.category && (
                      <div>
                        <Label className="text-muted-foreground">{t('library.category')}</Label>
                        <p>{selectedBook.category}</p>
                      </div>
                    )}
                    {selectedBook.publisher && (
                      <div>
                        <Label className="text-muted-foreground">{t('library.publisher')}</Label>
                        <p>{selectedBook.publisher}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">{t('library.status')}</Label>
                      <div className="mt-1">
                        <StatusBadge status={getBookStatus(selectedBook)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{selectedBook.total_copies}</p>
                      <p className="text-sm text-muted-foreground">{t('library.totalCopies')}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{selectedBook.available_copies}</p>
                      <p className="text-sm text-muted-foreground">{t('library.availableCopies')}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">
                        {selectedBook.total_copies - selectedBook.available_copies}
                      </p>
                      <p className="text-sm text-muted-foreground">{t('library.borrowedCopies')}</p>
                    </CardContent>
                  </Card>
                </div>

                {selectedBook.description && (
                  <div>
                    <Label className="text-muted-foreground">{t('library.description')}</Label>
                    <p className="mt-1">{selectedBook.description}</p>
                  </div>
                )}

                {selectedBook.location_shelf && (
                  <div>
                    <Label className="text-muted-foreground">{t('library.location')}</Label>
                    <p className="mt-1">{selectedBook.location_shelf}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Borrow Copies Dialog */}
      <Dialog open={isBorrowDialogOpen} onOpenChange={setIsBorrowDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Borrowed Copies</DialogTitle>
            <VisuallyHidden>
              <DialogDescription>Set how many copies of this book are currently borrowed</DialogDescription>
            </VisuallyHidden>
          </DialogHeader>
          {borrowBook && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <p className="font-medium">{borrowBook.title}</p>
                <p className="text-sm text-muted-foreground">{borrowBook.author}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-lg font-bold">{borrowBook.total_copies}</p>
                  <p className="text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-lg font-bold text-amber-600">{borrowedCount}</p>
                  <p className="text-muted-foreground">Borrowed</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-lg font-bold text-green-600">{borrowBook.total_copies - borrowedCount}</p>
                  <p className="text-muted-foreground">Available</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="borrowed_count">Number of Borrowed Copies</Label>
                <Input
                  id="borrowed_count"
                  type="number"
                  min={0}
                  max={borrowBook.total_copies}
                  value={borrowedCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setBorrowedCount(Math.max(0, Math.min(val, borrowBook.total_copies)));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Max {borrowBook.total_copies} (total copies)
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsBorrowDialogOpen(false)} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleBorrowSubmit} disabled={saving}>
                  {saving ? t('common.loading') : t('common.save')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {bookToDelete?.title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? t('common.loading') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface BookFormProps {
  form: CreateBookData;
  onChange: (key: string, value: string | number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  t: (key: string) => string;
  showCondition?: boolean;
  condition?: string;
  onConditionChange?: (value: string) => void;
  branches?: Branch[];
}

function BookForm({ form, onChange, onSubmit, onCancel, saving, t, showCondition, condition, onConditionChange, branches = [] }: BookFormProps) {
  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">{t('library.title')} *</Label>
          <Input
            id="title"
            value={form.title || ''}
            onChange={(e) => onChange('title', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="author">{t('library.author')} *</Label>
          <Input
            id="author"
            value={form.author || ''}
            onChange={(e) => onChange('author', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="isbn">{t('library.isbn')}</Label>
          <Input
            id="isbn"
            value={form.isbn || ''}
            onChange={(e) => onChange('isbn', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="publisher">{t('library.publisher')}</Label>
          <Input
            id="publisher"
            value={form.publisher || ''}
            onChange={(e) => onChange('publisher', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">{t('library.category')}</Label>
          <Input
            id="category"
            value={form.category || ''}
            onChange={(e) => onChange('category', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="publication_year">Publication Year</Label>
          <Input
            id="publication_year"
            type="number"
            value={form.publication_year || ''}
            onChange={(e) => onChange('publication_year', parseInt(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="total_copies">{t('library.totalCopies')} *</Label>
          <Input
            id="total_copies"
            type="number"
            min={1}
            value={form.total_copies || 1}
            onChange={(e) => onChange('total_copies', parseInt(e.target.value) || 1)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location_shelf">{t('library.location')}</Label>
          <Input
            id="location_shelf"
            value={form.location_shelf || ''}
            onChange={(e) => onChange('location_shelf', e.target.value)}
          />
        </div>
      </div>
      {showCondition && onConditionChange && (
        <div className="space-y-2">
          <Label>{t('library.condition')}</Label>
          <Select value={condition || 'good'} onValueChange={onConditionChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excellent">Excellent</SelectItem>
              <SelectItem value="good">{t('library.good')}</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="poor">Poor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {branches.length > 0 && (
        <div className="space-y-2">
          <Label>Branch <span className="text-red-500">*</span></Label>
          <Select
            value={(form as any).branch_id || ''}
            onValueChange={(v) => onChange('branch_id', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>{branch.name} — {branch.province}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="description">{t('library.description')}</Label>
        <Textarea
          id="description"
          rows={3}
          value={form.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
