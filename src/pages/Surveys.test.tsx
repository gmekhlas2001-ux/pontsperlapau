import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Surveys } from './Surveys';

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

  it('renders surveys page title', async () => {
    render(
      <MemoryRouter>
        <Surveys />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Surveys')).toBeInTheDocument();
    });
  });
});
