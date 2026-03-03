import type { Staff, Student, Class, Book, BookLoan, Activity, DashboardStats } from '@/types';

export const mockStaff: Staff[] = [];

export const mockStudents: Student[] = [];

export const mockClasses: Class[] = [];

export const mockBooks: Book[] = [];

export const mockBookLoans: BookLoan[] = [];

export const mockActivities: Activity[] = [];

export function getDashboardStats(): DashboardStats {
  const activeStaff = mockStaff.filter(s => s.status === 'active').length;
  const activeStudents = mockStudents.filter(s => s.status === 'active').length;
  const availableBooks = mockBooks.reduce((sum, b) => sum + b.availableCopies, 0);
  const borrowedBooks = mockBooks.reduce((sum, b) => sum + (b.totalCopies - b.availableCopies), 0);
  
  return {
    totalStaff: mockStaff.length,
    activeStaff,
    inactiveStaff: mockStaff.length - activeStaff,
    totalStudents: mockStudents.length,
    activeStudents,
    inactiveStudents: mockStudents.length - activeStudents,
    totalClasses: mockClasses.length,
    totalBooks: mockBooks.reduce((sum, b) => sum + b.totalCopies, 0),
    availableBooks,
    borrowedBooks,
    overdueBooks: 0,
  };
}
