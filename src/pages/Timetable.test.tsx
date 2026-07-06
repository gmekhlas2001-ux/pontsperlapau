import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Timetable } from './Timetable';

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
        scheduleDays: ['Monday'],
        scheduleTime: '09:00',
        scheduleEndTime: '10:30',
        location: 'Room 101',
      }
    ]
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Timetable Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders timetable page title', async () => {
    render(
      <MemoryRouter>
        <Timetable />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Timetable')).toBeInTheDocument();
    });
  });
});
