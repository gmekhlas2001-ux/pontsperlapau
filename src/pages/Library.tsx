import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockBooks, mockBookLoans, mockStudents } from '@/lib/mockData';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  MoreHorizontal,
  BookOpen,
  Users,
  CheckCircle,
  AlertCircle,
  Pencil,
  Trash2,
  Clock,
  User,
} from 'lucide-react';
import type { Book, BookLoan } from '@/types';

export function Library() {
  const { t } = useTranslation();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLendDialogOpen, setIsLendDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const totalBooks = mockBooks.reduce((sum, b) => sum + b.totalCopies, 0);
  const availableBooks = mockBooks.reduce((sum, b) => sum + b.availableCopies, 0);
  const borrowedBooks = totalBooks - availableBooks;
  const overdueBooks = mockBookLoans.filter((l) => l.status === 'overdue').length;

  const getBookLoans = (bookId: string) => {
    return mockBookLoans.filter((loan) => loan.bookId === bookId);
  };

  const columns = [
    {
      key: 'title',
      header: t('library.title'),
      cell: (book: Book) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
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
      cell: (book: Book) => book.isbn,
    },
    {
      key: 'category',
      header: t('library.category'),
      cell: (book: Book) => book.category || '-',
      sortable: true,
    },
    {
      key: 'copies',
      header: t('library.copies'),
      cell: (book: Book) => (
        <span>
          {book.availableCopies} / {book.totalCopies}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('library.status'),
      cell: (book: Book) => <StatusBadge status={book.status} />,
      sortable: true,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (book: Book) => (
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
            {book.availableCopies > 0 && (
              <DropdownMenuItem onClick={() => { setSelectedBook(book); setIsLendDialogOpen(true); }}>
                <User className="mr-2 h-4 w-4" />
                {t('library.lendBook')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const loanColumns = [
    {
      key: 'book',
      header: t('library.title'),
      cell: (loan: BookLoan) => loan.bookTitle,
    },
    {
      key: 'borrower',
      header: t('library.borrower'),
      cell: (loan: BookLoan) => loan.borrowerName,
    },
    {
      key: 'lendingDate',
      header: t('library.lendingDate'),
      cell: (loan: BookLoan) => loan.lendingDate,
    },
    {
      key: 'dueDate',
      header: t('library.dueDate'),
      cell: (loan: BookLoan) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {loan.dueDate}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('library.status'),
      cell: (loan: BookLoan) => <StatusBadge status={loan.status} />,
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (_loan: BookLoan) => (
        <Button variant="outline" size="sm">
          <CheckCircle className="mr-2 h-4 w-4" />
          {t('library.returnBook')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('library.title')}</h1>
          <p className="text-muted-foreground">{t('library.bookList')}</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('library.addBook')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('library.addBook')}</DialogTitle>
              <VisuallyHidden>
                <DialogDescription>Add a new book to the library</DialogDescription>
              </VisuallyHidden>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('library.title')}</Label>
                <Input id="title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author">{t('library.author')}</Label>
                <Input id="author" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="isbn">{t('library.isbn')}</Label>
                <Input id="isbn" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="publisher">{t('library.publisher')}</Label>
                  <Input id="publisher" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">{t('library.category')}</Label>
                  <Input id="category" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="copies">{t('library.totalCopies')}</Label>
                <Input id="copies" type="number" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button>{t('common.save')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.totalBooks')}
          value={totalBooks}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.availableBooks')}
          value={availableBooks}
          icon={CheckCircle}
          iconClassName="bg-green-100"
        />
        <StatCard
          title={t('dashboard.borrowedBooks')}
          value={borrowedBooks}
          icon={Users}
          iconClassName="bg-blue-100"
        />
        <StatCard
          title={t('dashboard.overdueBooks')}
          value={overdueBooks}
          icon={AlertCircle}
          iconClassName="bg-red-100"
        />
      </div>

      <Tabs defaultValue="books">
        <TabsList>
          <TabsTrigger value="books">{t('library.bookList')}</TabsTrigger>
          <TabsTrigger value="borrowed">{t('library.borrowedBooks')}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="books">
          <DataTable
            data={mockBooks}
            columns={columns}
            keyExtractor={(book) => book.id}
            searchKeys={['title', 'author', 'isbn', 'category']}
          />
        </TabsContent>
        
        <TabsContent value="borrowed">
          <DataTable
            data={mockBookLoans}
            columns={loanColumns}
            keyExtractor={(loan) => loan.id}
            searchKeys={['bookTitle', 'borrowerName']}
          />
        </TabsContent>
      </Tabs>

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
                    <div>
                      <Label className="text-muted-foreground">{t('library.isbn')}</Label>
                      <p>{selectedBook.isbn}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('library.category')}</Label>
                      <p>{selectedBook.category}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('library.status')}</Label>
                      <div className="mt-1">
                        <StatusBadge status={selectedBook.status} />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{selectedBook.totalCopies}</p>
                      <p className="text-sm text-muted-foreground">{t('library.totalCopies')}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{selectedBook.availableCopies}</p>
                      <p className="text-sm text-muted-foreground">{t('library.availableCopies')}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">
                        {selectedBook.totalCopies - selectedBook.availableCopies}
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
                
                <div>
                  <Label className="text-muted-foreground">{t('library.lendingHistory')}</Label>
                  <div className="mt-2 space-y-2">
                    {getBookLoans(selectedBook.id).map((loan) => (
                      <div key={loan.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{loan.borrowerName}</p>
                          <p className="text-sm text-muted-foreground">
                            {loan.lendingDate} - {loan.dueDate}
                          </p>
                        </div>
                        <StatusBadge status={loan.status} />
                      </div>
                    ))}
                    {getBookLoans(selectedBook.id).length === 0 && (
                      <p className="text-muted-foreground text-center py-4">
                        {t('common.noData')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Lend Book Dialog */}
      <Dialog open={isLendDialogOpen} onOpenChange={setIsLendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('library.lendBook')}</DialogTitle>
            <VisuallyHidden>
              <DialogDescription>Lend a book to a student</DialogDescription>
            </VisuallyHidden>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-muted-foreground">{t('library.title')}</Label>
              <p className="font-medium">{selectedBook?.title}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="borrower">{t('library.borrower')}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select borrower" />
                </SelectTrigger>
                <SelectContent>
                  {mockStudents.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.firstName} {student.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">{t('library.dueDate')}</Label>
              <Input id="dueDate" type="date" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsLendDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button>{t('common.confirm')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
