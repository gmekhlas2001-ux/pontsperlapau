import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { MemoryRouter, Route, Routes } from 'react-router';

const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderRoute = (requiredRoles?: any[], moduleId?: string) => {
    return render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute requiredRoles={requiredRoles} moduleId={moduleId}>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('shows loading state when auth is loading', () => {
    mockUseAuth.mockReturnValue({ isLoading: true, isAuthenticated: false, hasPermission: vi.fn() });
    renderRoute();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, hasPermission: vi.fn() });
    renderRoute();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('blocks protected content while keeping a temporary verification failure retryable', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, sessionError: true, retrySession: vi.fn(), hasPermission: vi.fn() });
    renderRoute();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('redirects to / when authenticated but lacks permission', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: true, hasPermission: () => false });
    renderRoute(['admin']);
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('renders children when authenticated and has permission', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: true, hasPermission: () => true });
    renderRoute(['admin']);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children when authenticated and no roles required', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: true, hasPermission: vi.fn() });
    renderRoute();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('blocks a directly opened module route after access is revoked', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, accessLoading: false, isAuthenticated: true, hasPermission: () => true, hasModuleAccess: () => false });
    renderRoute(['admin'], 'library');
    expect(screen.getByText('Module access unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
