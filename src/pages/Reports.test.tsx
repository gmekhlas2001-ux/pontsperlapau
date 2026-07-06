import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Reports } from './Reports';

// Mock Services
vi.mock('@/services/transactionService', () => ({
  getTransactions: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getTransactionStats: vi.fn().mockResolvedValue({
    success: true,
    data: {
      totalAmount: 0,
      totalAmountCompleted: 0,
      totalAmountPending: 0,
      totalAmountFailed: 0,
      count: 0
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

describe('Reports Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders reports page title', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Reports')).toBeInTheDocument();
    });
  });
});
