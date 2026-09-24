import { describe, expect, it } from 'vitest';
import { prepareDataReadTarget, dataReadHeaders } from '../../supabase/functions/_shared/data-read-request';
import { applyScope, type Caller } from '../../supabase/functions/_shared/data-read-scope';

const origin = 'https://example.supabase.co';
const request = (path: string, headers?: HeadersInit) => new Request(`${origin}/functions/v1/data-read?path=${encodeURIComponent(path)}`, { headers });
const caller = (role: string): Caller => ({ role, id: 'actor', branch_id: 'branch-a' });
function clientWith(rows: Record<string, Record<string, string>[]>) {
  return { from(table: string) {
    const query = {
      select() { return query; }, order() { return query; }, range() { return query; },
      eq() { return query; }, is() { return query; }, in() { return query; }, not() { return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve); },
    };
    return query;
  } };
}

describe('privileged read request boundary', () => {
  it.each([
    '/rest/v1/users?select=id&select=password_hash',
    '/rest/v1/users?limit=1&limit=100',
    '/rest/v1/users?offset=-1', '/rest/v1/users?offset=1.5',
    '/rest/v1/../../auth/users', '/rest/v1/rpc/delete_user',
    '/rest/v1/users#ignored', 'https://attacker.test/rest/v1/users',
  ])('rejects ambiguous or invalid path %s', path => {
    expect(() => prepareDataReadTarget(request(path), origin)).toThrow();
  });
  it.each(['Accept-Profile', 'Content-Profile'])('rejects a nonpublic %s', header => {
    expect(() => prepareDataReadTarget(request('/rest/v1/users', { [header]: 'auth' }), origin)).toThrow();
  });
  it('allows repeated boolean filters but pins the upstream schema and credentials', () => {
    const req = request('/rest/v1/messages?select=id&or=(sender_id.eq.a)&or=(branch_id.eq.b)', { 'X-App-Actor': 'forged', Authorization: 'bad', Range: '0-49' });
    expect(prepareDataReadTarget(req, origin).searchParams.getAll('or')).toHaveLength(2);
    const headers = dataReadHeaders(req, 'server-key');
    expect(headers.get('Accept-Profile')).toBe('public');
    expect(headers.get('Authorization')).toBe('Bearer server-key');
    expect(headers.get('X-App-Actor')).toBeNull();
    expect(headers.get('Range')).toBe('0-49');
  });
  it('rejects two target paths', () => {
    const req = new Request(`${request('/rest/v1/users').url}&path=/rest/v1/students`);
    expect(() => prepareDataReadTarget(req, origin)).toThrow();
  });
});

describe('server role and branch isolation', () => {
  const client = clientWith({ parent_student_links: [{ student_id: 'child-a' }], staff: [{ id: 'teacher-staff' }], classes: [{ id: 'assigned-class' }], users: [{ id: 'branch-user' }] });
  it.each(['teacher', 'librarian', 'student', 'parent'])('denies surveys, audit, and finance to %s', async role => {
    for (const table of ['surveys', 'activity_logs', 'grants', 'transactions']) {
      expect(await applyScope(client, caller(role), table, new URLSearchParams())).toBe(false);
    }
  });
  it('overwrites a branch administrator’s forged branch filter', async () => {
    const params = new URLSearchParams('branch_id=eq.other&branch_id=eq.third');
    expect(await applyScope(client, caller('admin'), 'students', params)).toBe(true);
    expect(params.getAll('branch_id')).toEqual(['eq.branch-a']);
  });
  it('fails closed for an administrator without a branch', async () => {
    const params = new URLSearchParams();
    await applyScope(client, { ...caller('admin'), branch_id: null }, 'students', params);
    expect(params.get('branch_id')).toBe('eq.00000000-0000-0000-0000-000000000000');
  });
  it('intersects parent requests with their linked children', async () => {
    const params = new URLSearchParams('id=in.(child-a,unrelated-child)');
    await applyScope(client, caller('parent'), 'students', params);
    expect(params.get('id')).toBe('eq.child-a');
  });
  it('limits teachers to assigned classes even when they request another class', async () => {
    const params = new URLSearchParams('class_id=eq.unassigned');
    await applyScope(client, caller('teacher'), 'grade_entries', params);
    expect(params.get('class_id')).toBe('eq.00000000-0000-0000-0000-000000000000');
  });
  it('forces student private profile reads to their own user', async () => {
    const params = new URLSearchParams('select=id,email&id=eq.someone-else');
    await applyScope(client, caller('student'), 'users', params);
    expect(params.get('id')).toBe('eq.actor');
  });
  it('allows global administrators and rejects unknown resources', async () => {
    const params = new URLSearchParams();
    expect(await applyScope(client, caller('superadmin'), 'surveys', params)).toBe(true);
    expect(params.size).toBe(0);
    expect(await applyScope(client, caller('superadmin'), 'app_sessions', params)).toBe(false);
  });
  it('scopes new audit records by the branch at event time, with a legacy fallback', async () => {
    const params = new URLSearchParams();
    await applyScope(client, caller('admin'), 'activity_logs', params);
    expect(params.get('or')).toBe('(branch_id.eq.branch-a,and(event_source.eq.legacy_client,user_id.in.(branch-user)))');
  });
});
