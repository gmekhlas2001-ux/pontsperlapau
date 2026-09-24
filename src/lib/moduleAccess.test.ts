import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATION_ACCESS, operationModule, resolveModuleAccess, type ModuleRecord, type ModuleRule } from '../../supabase/functions/_shared/module-access';

const module: ModuleRecord = {
  id: 'library', label: 'Library', enabled: true,
  default_view_roles: ['librarian', 'teacher'],
  default_write_roles: ['librarian'], default_export_roles: ['librarian'],
};
const actor = { id: 'user-1', role: 'librarian', branch_id: 'branch-a' };
const rule = (values: Partial<ModuleRule>): ModuleRule => ({
  module_id: 'library', action: 'view', user_id: null, role: null,
  branch_id: null, allowed: true, ...values,
});

describe('module access resolution', () => {
  it('keeps role and module ceilings even when a grant says allow', () => {
    expect(resolveModuleAccess(module, [rule({ user_id: actor.id })], actor, 'view')).toBe(true);
    expect(resolveModuleAccess(module, [rule({ action: 'create', user_id: actor.id })],
      { ...actor, role: 'teacher' }, 'create')).toBe(false);
    expect(resolveModuleAccess({ ...module, enabled: false }, [], actor, 'view')).toBe(false);
    expect(resolveModuleAccess({ ...module, enabled: false }, [], { ...actor, role: 'superadmin' }, 'view')).toBe(true);
  });

  it('prefers user rules and then branch rules over role defaults', () => {
    const rules = [
      rule({ role: 'librarian', allowed: false }),
      rule({ role: 'librarian', branch_id: 'branch-a', allowed: true }),
      rule({ user_id: actor.id, allowed: false }),
      rule({ user_id: actor.id, branch_id: 'branch-a', allowed: true }),
    ];
    expect(resolveModuleAccess(module, rules, actor, 'view')).toBe(true);
    expect(resolveModuleAccess(module, rules, { ...actor, branch_id: 'branch-b' }, 'view')).toBe(false);
  });

  it('maps privileged operations to their section and action', () => {
    expect(operationModule('delete-book', {})).toEqual({ module: 'library', action: 'delete' });
    expect(operationModule('get_survey_results_fast', {})).toEqual({ module: 'surveys', action: 'view' });
    expect(operationModule('upload-public-image', { folder: 'users' })).toEqual({ module: 'profile', action: 'edit' });
    expect(operationModule('not-a-real-operation', {})).toBeUndefined();
    expect(Object.keys(OPERATION_ACCESS)).toHaveLength(51);
  });

  it('requires an explicit access declaration for every app action', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/app-actions/index.ts'), 'utf8');
    const operations = [...source.matchAll(/op === "([^"]+)"/g)].map((match) => match[1]);
    const exempt = new Set(['logout', 'get-session', 'log-activity']);
    const missing = operations.filter((operation) => !exempt.has(operation) &&
      operation !== 'upload-public-image' && !OPERATION_ACCESS[operation]);
    expect(missing).toEqual([]);
  });
});
