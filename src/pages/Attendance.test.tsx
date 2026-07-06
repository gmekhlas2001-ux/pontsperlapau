import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Attendance } from './Attendance';

// Mock Services
vi.mock('@/services/classService', () => ({
  getClassesList: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 'class1',
        name: 'Math 101',
        teacherFirstName: 'John',
        teacherLastName: 'Doe',
        status: 'active',
        createdAt: '2023-01-01',
        scheduleDays: [],
      }
    ]
  }),
}));

vi.mock('@/services/attendanceService', () => ({
  getClassAttendanceRecord: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getAttendanceForClass: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getStudentAttendanceStats: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  takeAttendance: vi.fn().mockResolvedValue({ success: true }),
  updateAttendance: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Attendance Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders attendance page title', async () => {
    render(
      <MemoryRouter>
        <Attendance />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Attendance')).toBeInTheDocument();
      expect(screen.getByText('Math 101')).toBeInTheDocument();
    });
  });
});
