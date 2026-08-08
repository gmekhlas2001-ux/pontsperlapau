import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Surveys } from './Surveys';

vi.mock('@/components/surveys/SurveyManagementDashboard', () => ({
  SurveyManagementDashboard: () => <div>Survey analytics dashboard</div>,
}));

// Mock Services
vi.mock('@/services/surveyService', () => ({
  getSurveys: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  createSurvey: vi.fn().mockResolvedValue({ success: true }),
  updateSurvey: vi.fn().mockResolvedValue({ success: true }),
  deleteSurvey: vi.fn().mockResolvedValue({ success: true }),
  getSurveyResponses: vi.fn().mockResolvedValue({
    success: true,
    data: []
  }),
  getSurveyListStats: vi.fn().mockResolvedValue({
    success: true,
    data: {}
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin1', role: 'admin' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('Surveys Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on the survey analytics workspace', async () => {
    render(
      <MemoryRouter>
        <Surveys />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Survey Management')).toBeInTheDocument();
      expect(screen.getByText('Survey analytics dashboard')).toBeInTheDocument();
    });
  });
});
