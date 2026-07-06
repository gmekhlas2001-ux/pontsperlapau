import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Students } from './Students';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', user_metadata: { first_name: 'Test' } },
    hasPermission: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock('@/services/studentService', () => ({
  getStudentsList: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: '1',
        student_id: 'STU-001',
        parent1_name: 'Parent One',
        parent1_phone: '123456789',
        user: {
          id: 'user1',
          first_name: 'Alice',
          last_name: 'Student',
          email: 'alice@example.com',
          role: 'student',
          status: 'active',
        },
      },
      {
        id: '2',
        student_id: 'STU-002',
        parent1_name: 'Parent Two',
        user: {
          id: 'user2',
          first_name: 'Bob',
          last_name: 'Student',
          email: 'bob@example.com',
          role: 'student',
          status: 'inactive',
        },
      },
    ]
  }),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
  updateStudentCredentials: vi.fn(),
}));

vi.mock('@/services/branchService', () => ({
  getBranches: vi.fn().mockResolvedValue([
    { id: 'branch1', name: 'Main Branch' },
  ]),
}));

describe('Students Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders students list', async () => {
    render(
      <MemoryRouter>
        <Students />
      </MemoryRouter>
    );

    await screen.findByText(/Alice Student/i, {}, { timeout: 3000 });
    await screen.findByText(/Bob Student/i, {}, { timeout: 3000 });
  });

  it('filters students by search term', async () => {
    render(
      <MemoryRouter>
        <Students />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Student')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('common.search');
    fireEvent.change(searchInput, { target: { value: 'Bob' } });

    await waitFor(() => {
      expect(screen.queryByText('Alice Student')).not.toBeInTheDocument();
      expect(screen.getByText('Bob Student')).toBeInTheDocument();
    });
  });
});
