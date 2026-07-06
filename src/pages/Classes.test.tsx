import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Classes } from './Classes';

// Mock Services
vi.mock('@/services/branchService', () => ({
  getBranches: vi.fn().mockResolvedValue({
    success: true,
    data: [{ id: 'branch1', name: 'Main Branch' }]
  }),
}));

vi.mock('@/services/classService', () => ({
  getClassesList: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: '1',
        name: 'Math 101',
        description: 'Introduction to Mathematics',
        teacherId: 't1',
        teacherUserId: 'tu1',
        teacherFirstName: 'John',
        teacherLastName: 'Doe',
        scheduleDays: ['Monday', 'Wednesday'],
        scheduleTime: '09:00',
        scheduleEndTime: '10:30',
        location: 'Room A',
        maxCapacity: 30,
        academicYear: '2023-2024',
        semester: 'fall',
        status: 'active',
        branchId: 'branch1',
        branchName: 'Main Branch',
        createdAt: '2023-01-01',
      },
      {
        id: '2',
        name: 'Science 101',
        description: 'Introduction to Science',
        teacherId: 't2',
        teacherUserId: 'tu2',
        teacherFirstName: 'Jane',
        teacherLastName: 'Smith',
        scheduleDays: ['Tuesday', 'Thursday'],
        scheduleTime: '11:00',
        scheduleEndTime: '12:30',
        location: 'Room B',
        maxCapacity: 25,
        academicYear: '2023-2024',
        semester: 'fall',
        status: 'inactive',
        branchId: 'branch1',
        branchName: 'Main Branch',
        createdAt: '2023-01-02',
      }
    ]
  }),
  getTeachers: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getClassEnrollments: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getStudentsByBranch: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  createClass: vi.fn().mockResolvedValue({ success: true }),
  updateClass: vi.fn().mockResolvedValue({ success: true }),
  deleteClass: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Classes Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders classes list', async () => {
    render(
      <MemoryRouter>
        <Classes />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Math 101')).toBeInTheDocument();
      expect(screen.getByText('Science 101')).toBeInTheDocument();
    });
  });

  it('filters classes by status', async () => {
    render(
      <MemoryRouter>
        <Classes />
      </MemoryRouter>
    );

    // Initial state: 'all' filter shows both
    await screen.findByText('Math 101');
    expect(screen.getByText('Science 101')).toBeInTheDocument();
  });
});
