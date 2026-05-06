export type UserRole = 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'student';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  department?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Staff extends User {
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  dateJoined: string;
  bio?: string;
  notes?: string;
  position: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  gradeLevel?: string;
  enrollmentDate: string;
  status: 'active' | 'inactive';
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  classes: string[];
  attendanceRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Class {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  teacherName?: string;
  schedule: ClassSchedule[];
  room?: string;
  maxCapacity: number;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ClassSchedule {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  startTime: string;
  endTime: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  publisher?: string;
  category?: string;
  description?: string;
  cover?: string;
  totalCopies: number;
  availableCopies: number;
  location?: string;
  condition: 'good' | 'damaged' | 'lost';
  status: 'available' | 'borrowed' | 'out_of_stock';
  createdAt: string;
  updatedAt: string;
}

export interface BookLoan {
  id: string;
  bookId: string;
  bookTitle?: string;
  borrowerId: string;
  borrowerName?: string;
  borrowerType: 'student' | 'staff';
  lendingDate: string;
  dueDate: string;
  returnDate?: string;
  status: 'active' | 'returned' | 'overdue';
  notes?: string;
  condition?: 'good' | 'damaged' | 'lost';
}

export interface Activity {
  id: string;
  type: 'staff_added' | 'staff_updated' | 'staff_removed' | 
        'student_added' | 'student_updated' | 'student_removed' |
        'class_created' | 'class_updated' | 'class_deleted' |
        'book_added' | 'book_updated' | 'book_deleted' |
        'book_borrowed' | 'book_returned';
  description: string;
  userId: string;
  userName?: string;
  targetId?: string;
  targetName?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  totalClasses: number;
  totalBooks: number;
  availableBooks: number;
  borrowedBooks: number;
  overdueBooks: number;
}

export type TransferMethod = 'moneygram' | 'western_union' | 'bank_transfer' | 'hawala' | 'cash' | 'paypal' | 'wise' | 'other';
export type TransactionStatus = 'pending' | 'completed' | 'cancelled' | 'failed';

export interface Transaction {
  id: string;
  reference_number: string;
  external_reference?: string;
  sender_branch_id?: string;
  receiver_branch_id?: string;
  sender_staff_id?: string;
  receiver_staff_id?: string;
  amount: number;
  currency: string;
  transfer_method: TransferMethod;
  status: TransactionStatus;
  notes?: string;
  created_by?: string;
  completed_at?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
  sender_branch?: { id: string; name: string };
  receiver_branch?: { id: string; name: string };
  sender_staff?: { id: string; user: { first_name: string; last_name: string } };
  receiver_staff?: { id: string; user: { first_name: string; last_name: string } };
  creator?: { first_name: string; last_name: string };
}

export interface CreateTransactionData {
  sender_branch_id: string;
  receiver_branch_id: string;
  sender_staff_id: string;
  receiver_staff_id: string;
  amount: number;
  currency: string;
  transfer_method: TransferMethod;
  external_reference?: string;
  notes?: string;
}

export interface TransactionStats {
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  failed: number;
  totalAmount: number;
  totalAmountCompleted: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}
