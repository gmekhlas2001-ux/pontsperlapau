import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Login } from './Login';
import { MemoryRouter } from 'react-router-dom';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: {
        changeLanguage: vi.fn(),
      },
    }),
    initReactI18next: {
      type: '3rdParty',
      init: vi.fn(),
    },
  };
});

const mockLogin = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

const renderLogin = () => {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form', () => {
    renderLogin();
    expect(screen.getByLabelText('auth.email')).toBeInTheDocument();
    expect(screen.getByLabelText('auth.password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'auth.loginButton' })).toBeInTheDocument();
  });

  it('calls login function with credentials when submitted', async () => {
    mockLogin.mockResolvedValue({ success: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123', false);
    });
  });

  it('displays error message on invalid credentials', async () => {
    mockLogin.mockResolvedValue({ success: false, code: 'invalid_credentials' });
    renderLogin();

    fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'wrongpass' } });
    
    fireEvent.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    await waitFor(() => {
      expect(screen.getByText('auth.invalidCredentials')).toBeInTheDocument();
    });
  });
});
