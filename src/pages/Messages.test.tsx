import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Messages from './Messages';

// Mock Services
vi.mock('@/services/messageService', () => ({
  getInbox: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getSent: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getConversations: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getMessages: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  markAsRead: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Messages Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders messages page title', async () => {
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Messages')).toBeInTheDocument();
    });
  });
});
