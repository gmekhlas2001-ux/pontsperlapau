import { describe, expect, it } from 'vitest';
import { validateDataReadSelect } from '../../supabase/functions/_shared/data-read-policy';

describe('data-read projection policy', () => {
  it('blocks branch-rooted relation traversal', () => {
    expect(validateDataReadSelect('branches', 'id,students(*,user:users(*))', { role: 'admin' }))
      .toContain('Relation is not readable');
  });

  it('blocks wildcard users_public reads while allowing a scoped self profile', () => {
    expect(validateDataReadSelect('users_public', '*', { role: 'teacher' })).toContain('explicit');
    expect(validateDataReadSelect('users_public', 'id,email', { role: 'teacher' })).toBeNull();
    expect(validateDataReadSelect('staff', 'id,user:users(email)', { role: 'teacher' })).toContain('email');
  });

  it('allows the safe nested projections used by teacher screens', () => {
    expect(validateDataReadSelect(
      'students',
      'id,student_id,user:users!user_id(id,first_name,last_name,status)',
      { role: 'teacher' },
    )).toBeNull();
  });

  it('allows administrative profile fields but never password material', () => {
    expect(validateDataReadSelect('users', 'id,email,phone_number', { role: 'admin' })).toBeNull();
    expect(validateDataReadSelect('users', 'id,password_hash', { role: 'superadmin' })).toContain('prohibited');
  });

  it('blocks unapproved nested relation hops', () => {
    expect(validateDataReadSelect('books', '*,borrowings:book_borrowings(*)', { role: 'librarian' }))
      .toContain('Relation is not readable');
    expect(validateDataReadSelect('donors', '*,grants(id,amount)', { role: 'admin' }))
      .toContain('Relation is not readable');
  });
});
