import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Library } from './Library';

// Mock Services
vi.mock('@/services/libraryService', () => ({
  getBooks: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getLoans: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  addBook: vi.fn().mockResolvedValue({ success: true }),
  updateBook: vi.fn().mockResolvedValue({ success: true }),
  deleteBook: vi.fn().mockResolvedValue({ success: true }),
  borrowBook: vi.fn().mockResolvedValue({ success: true }),
  returnBook: vi.fn().mockResolvedValue({ success: true }),
  getLibraryStats: vi.fn().mockResolvedValue({
    success: true,
    data: {
      totalBooks: 0,
      activeLoans: 0,
      overdueLoans: 0
    }
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Library Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders library page title', async () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Library Management')).toBeInTheDocument();
    });
  });
});
