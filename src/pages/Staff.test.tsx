import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Staff } from './Staff';
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

const { mockStaffResponse } = vi.hoisted(() => ({
  mockStaffResponse: {
    success: true,
    data: [
      {
        id: '1',
        user: {
          id: 'user1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          role: 'teacher',
          status: 'active',
          phone_number: '123456789',
        },
      },
      {
        id: '2',
        user: {
          id: 'user2',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane.smith@example.com',
          role: 'admin',
          status: 'inactive',
        },
      },
    ]
  }
}));

vi.mock('@/services/staffService', () => ({
  getStaffList: vi.fn().mockResolvedValue(mockStaffResponse),
  createStaff: vi.fn(),
  updateStaff: vi.fn(),
  deleteStaff: vi.fn(),
  updateUserCredentials: vi.fn(),
}));

vi.mock('@/services/branchService', () => ({
  getBranches: vi.fn().mockResolvedValue([
    { id: 'branch1', name: 'Main Branch' },
  ]),
}));

describe('Staff Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders staff list', async () => {
    render(
      <MemoryRouter>
        <Staff />
      </MemoryRouter>
    );

    // Look for John Doe and Jane Smith
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    });
  });

  it('filters staff by search term', async () => {
    render(
      <MemoryRouter>
        <Staff />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('common.search');
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    await waitFor(() => {
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });
});
