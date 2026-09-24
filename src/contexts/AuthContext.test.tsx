import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/edge', () => ({ callEdgeFunction: vi.fn() }));
import { callEdgeFunction } from '@/lib/edge';
import { AuthProvider, useAuth } from './AuthContext';
import { getSessionToken, storeSession, clearSession } from '@/lib/session';
const user = { id: 'actor', email: 'person@example.com', firstName: 'Test', lastName: 'User', role: 'admin' as const, branchId: null };
function Status() {
  const auth = useAuth();
  return <><p>{auth.isLoading ? 'loading' : auth.sessionError ? 'retryable' : auth.isAuthenticated && auth.hasModuleAccess('dashboard') ? 'signed in' : 'signed out'}</p><button onClick={auth.retrySession}>Retry</button></>;
}
describe('session recovery', () => {
  beforeEach(() => { vi.clearAllMocks(); clearSession(); });
  it('keeps credentials during an outage, blocks access, and restores the session on retry', async () => {
    storeSession('existing-token', user, false);
    vi.mocked(callEdgeFunction)
      .mockResolvedValue({ ok: true, status: 200, data: { success: true, access: { dashboard: { view: true } } } })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, user } });
    render(<AuthProvider><Status /></AuthProvider>);
    await screen.findByText('retryable');
    expect(getSessionToken()).toBe('existing-token');
    await act(async () => { screen.getByRole('button').click(); });
    await screen.findByText('signed in');
  });
  it('clears credentials when the server actually rejects the session', async () => {
    storeSession('rejected-token', user, false);
    vi.mocked(callEdgeFunction).mockResolvedValue({ ok: false, status: 401 });
    render(<AuthProvider><Status /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument());
    expect(getSessionToken()).toBeNull();
  });
  it('finishes loading when the HTTP client already cleared an expired token', async () => {
    storeSession('expired-token', user, false);
    vi.mocked(callEdgeFunction).mockImplementationOnce(async () => {
      clearSession();
      return { ok: false, status: 401 };
    });
    render(<AuthProvider><Status /></AuthProvider>);
    await screen.findByText('signed out');
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
  });
});
