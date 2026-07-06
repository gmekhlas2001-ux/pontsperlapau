import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderRoute = (requiredRoles?: any[]) => {
    return render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute requiredRoles={requiredRoles}>
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
});
