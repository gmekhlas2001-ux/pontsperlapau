import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleAccessManager } from './ModuleAccessManager';

vi.mock('@/lib/edge', () => ({ callEdgeFunction: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
import { callEdgeFunction } from '@/lib/edge';

const catalog = {
  modules: [{ id: 'library', label: 'Library', enabled: true,
    default_view_roles: ['librarian'], default_write_roles: ['librarian'], default_export_roles: ['librarian'] }],
  users: [{ id: 'user-id', first_name: 'Test', last_name: 'Librarian', email: 'test@example.test', role: 'librarian', branch_id: null }],
  userCount: 1, branches: [],
};

describe('superadmin module assignment', () => {
  beforeEach(() => {
    vi.mocked(callEdgeFunction).mockReset();
    vi.mocked(callEdgeFunction).mockImplementation(async (_name, body) => {
      const operation = (body as { operation: string }).operation;
      return { ok: true, status: 200, data: operation === 'catalog' ? catalog : operation === 'rules' ? { rules: [] } : operation === 'history' ? { history: [] } : { success: true } };
    });
  });

  it('sends an individual view denial for the selected approved module', async () => {
    const user = userEvent.setup();
    render(<ModuleAccessManager />);
    await user.selectOptions(await screen.findByLabelText('moduleAccess.user'), 'user-id');
    await user.selectOptions(screen.getByLabelText('Library: moduleAccess.view'), 'deny');
    await waitFor(() => expect(callEdgeFunction).toHaveBeenCalledWith('module-access', expect.objectContaining({
      operation: 'set', moduleId: 'library', action: 'view', userId: 'user-id', decision: 'deny',
    })));
  });
});
