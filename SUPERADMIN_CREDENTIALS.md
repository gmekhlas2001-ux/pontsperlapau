# SuperAdmin Credentials

## First SuperAdmin Account

A superadmin account has been created in the Supabase database.

### Login Credentials

- **Email**: `1st.mekhlas@gmail.com`
- **Password**: `Liza143`
- **Role**: `superadmin`
- **Status**: `active`
- **Verified**: `true`

### Account Details

- **User ID**: `17aec8aa-fad8-4635-b4f4-5eba71eb78ce`
- **First Name**: Super
- **Last Name**: Admin
- **Created**: 2026-03-03

### Security Notes

1. **Password Hashing**: The password is securely hashed using bcrypt (cost factor 10) with pgcrypto
2. **Password Verification**: When implementing authentication, use the following pattern:
   ```sql
   SELECT * FROM users
   WHERE email = $1
   AND password_hash = crypt($2, password_hash);
   ```

3. **First Login**: After implementing the backend API, you should:
   - Login with these credentials
   - Change the password to something more secure
   - Update profile information (name, phone, etc.)
   - Add additional admin users as needed

### SuperAdmin Permissions

This account has full system access including:
- All 22 system permissions
- Ability to manage roles and permissions
- Ability to modify system settings
- Ability to create/manage all users, staff, students, classes, and library resources
- Access to all audit logs and reports

### Database Status

- **Total Users**: 1 (only this superadmin)
- **Demo Data**: None (database is clean)
- **Database**: Connected to Supabase
- **Tables Created**: All 16 core tables are ready

---

**IMPORTANT**: Keep these credentials secure and change the password after first login!
