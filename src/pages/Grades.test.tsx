import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Grades } from './Grades';

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

vi.mock('@/services/gradeService', () => ({
  getGradesForClass: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  saveGrade: vi.fn().mockResolvedValue({ success: true }),
  updateGrade: vi.fn().mockResolvedValue({ success: true }),
  deleteGrade: vi.fn().mockResolvedValue({ success: true }),
  getGradeStatsForClass: vi.fn().mockResolvedValue({
    success: true,
    data: null
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Grades Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders grades page title', async () => {
    render(
      <MemoryRouter>
        <Grades />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Grades')).toBeInTheDocument();
    });
  });
});
