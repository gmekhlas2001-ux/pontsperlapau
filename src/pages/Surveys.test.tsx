import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { aggregateCountValidationError, Surveys } from './Surveys';

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

  it('allows multi-select sums above the respondent total when every option count is valid', () => {
    expect(aggregateCountValidationError(10, [{
      questionType: 'checkboxes',
      counts: [7, 6],
    }])).toBeNull();
  });

  it('rejects any aggregate option count above the respondent total, including grids', () => {
    expect(aggregateCountValidationError(10, [{
      questionType: 'checkbox_grid',
      counts: [11, 2],
    }])).toBe('An answer option count cannot exceed the total respondent count');
    expect(aggregateCountValidationError(10, [{
      questionType: 'multiple_choice_grid',
      counts: [3, 12],
    }])).toBe('An answer option count cannot exceed the total respondent count');
  });

  it('still rejects single-answer question totals above the respondent total', () => {
    expect(aggregateCountValidationError(10, [{
      questionType: 'multiple_choice',
      counts: [6, 5],
    }])).toBe('A question total exceeds the respondent total');
  });
});
