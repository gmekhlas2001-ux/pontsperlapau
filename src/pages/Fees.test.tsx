import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Fees from './Fees';

// Mock Services
vi.mock('@/services/studentService', () => ({
  getStudentsList: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
}));

vi.mock('@/services/feeService', () => ({
  getFeesForStudent: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getFees: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  createFee: vi.fn().mockResolvedValue({ success: true }),
  updateFee: vi.fn().mockResolvedValue({ success: true }),
  deleteFee: vi.fn().mockResolvedValue({ success: true }),
  recordPayment: vi.fn().mockResolvedValue({ success: true }),
  getFeeStats: vi.fn().mockResolvedValue({
    success: true,
    data: {
      totalCollected: 0,
      totalPending: 0,
      collectionRate: 0,
      recentPayments: []
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

describe('Fees Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fees page title', async () => {
    render(
      <MemoryRouter>
        <Fees />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Fee Management')).toBeInTheDocument();
    });
  });
});
