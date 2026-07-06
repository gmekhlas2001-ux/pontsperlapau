import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dashboard } from './Dashboard';
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

vi.mock('@/services/dashboardService', () => ({
  fetchDashboardStats: vi.fn().mockResolvedValue({
    totalStaff: 10,
    activeStaff: 9,
    inactiveStaff: 1,
    totalStudents: 100,
    activeStudents: 95,
    inactiveStudents: 5,
    totalClasses: 5,
    totalBooks: 500,
    availableBooks: 400,
    borrowedBooks: 100,
    overdueBooks: 10,
    totalBranches: 2,
    lowAttendanceCount: 3,
    failingStudentsCount: 2,
    gradedEnrollments: 50,
    outstandingFeesCount: 5,
    outstandingFeesAmount: 1000,
    activeGrantsCount: 2,
    activeGrantsAmount: 500,
    unreadMessagesCount: 0,
  }),
  fetchBranchStats: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/activityService', () => ({
  fetchRecentActivities: vi.fn().mockResolvedValue([]),
}));

// Mock Recharts to avoid jsdom rendering issues with SVG/canvas
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: () => <div>BarChart</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>CartesianGrid</div>,
  Tooltip: () => <div>Tooltip</div>,
  PieChart: () => <div>PieChart</div>,
  Pie: () => <div>Pie</div>,
  Cell: () => <div>Cell</div>,
}));

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the admin dashboard and displays mock stats', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Initial render might show 0, wait for the mock data to populate
    await waitFor(() => {
      // Look for the total students stat which should be 100
      expect(screen.getAllByText(/100/i).length).toBeGreaterThan(0);
      // Look for total staff which should be 10
      expect(screen.getAllByText(/10/i).length).toBeGreaterThan(0);
      // Look for total classes which should be 5
      expect(screen.getAllByText(/5/i).length).toBeGreaterThan(0);
    });
  });
});
