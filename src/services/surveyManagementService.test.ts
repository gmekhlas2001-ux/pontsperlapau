import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/edge', () => ({ callEdgeFunction: vi.fn() }));

import { callEdgeFunction } from '@/lib/edge';
import { getBranchSurveyDashboard, getSurveyManagementOverview } from './surveyManagementService';

describe('survey management service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the global overview through the authenticated action gateway', async () => {
    const data = { definitions: {}, summary: {}, branches: [], surveys: [] };
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data },
    });

    await expect(getSurveyManagementOverview()).resolves.toEqual({ success: true, data });
    expect(callEdgeFunction).toHaveBeenCalledWith('app-actions', {
      operation: 'get-survey-management-overview',
      branchId: null,
    });
  });

  it('scopes detailed analytics to the requested branch', async () => {
    const data = {
      branch: { id: 'branch-a', name: 'A' },
      surveys: [],
      respondents: [],
      questions: [],
      dataQuality: {
        additionalSurveys: [],
        duplicateSurveyCodes: [],
        titleBranchMismatches: [],
        orphanedRegisteredAssignments: [],
        mixedResponseSources: [],
        historicalCompletionRule: 'Historical rule',
        manualIdentityRule: 'Manual rule',
      },
    };
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data },
    });

    await expect(getBranchSurveyDashboard('branch-a')).resolves.toEqual({ success: true, data });
    expect(callEdgeFunction).toHaveBeenCalledWith('app-actions', {
      operation: 'get-branch-survey-dashboard',
      branchId: 'branch-a',
    });
  });

  it('returns a useful gateway error without inventing analytics', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({ ok: false, status: 500, error: 'analytics unavailable' });

    await expect(getBranchSurveyDashboard('branch-a')).resolves.toEqual({
      success: false,
      error: 'analytics unavailable',
    });
  });

  it('rejects a successful gateway response with a malformed dashboard payload', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: { branch: {}, surveys: [] } },
    });

    await expect(getBranchSurveyDashboard('branch-a')).resolves.toEqual({
      success: false,
      error: 'Failed to load branch survey analysis',
    });
  });

  it('does not accept an application-level failure returned with HTTP 200', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: false, data: { definitions: {}, summary: {}, branches: [], surveys: [] } },
    });

    await expect(getSurveyManagementOverview()).resolves.toEqual({
      success: false,
      error: 'Failed to load survey overview',
    });
  });
});
