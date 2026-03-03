# Quick Start Guide

## Your First Superadmin Login

### Credentials
```
Email: 1st.mekhlas@gmail.com
Password: Liza143
```

**⚠️ IMPORTANT**: Change this password after first login!

---

## What You Have Right Now

### ✅ Working
1. **Supabase Database** - Connected and active
2. **Users Table** - Created with superadmin account
3. **Password Security** - Bcrypt hashed via pgcrypto
4. **Frontend App** - React app built and ready

### 📋 Ready to Apply
- 5 migration files in `supabase/migrations/`
- Complete database schema designed for 16 tables
- Full API documentation

### 🔄 Not Yet Done
- Other database tables (staff, students, classes, library, etc.)
- Backend API implementation
- Frontend-backend integration

---

## Three Ways to Proceed

### Option A: Apply All Migrations Now
**Best for**: Getting the complete system setup quickly

```bash
# Method 1: Using Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to SQL Editor
4. Copy content from each migration file in supabase/migrations/
5. Execute in order (by timestamp in filename)

# Method 2: Using Supabase CLI (if installed)
npx supabase migration up
```

**Result**: All 16 tables created with roles, permissions, and settings

### Option B: Build Backend First, Then Add Tables
**Best for**: Learning the system incrementally

1. Start with just the `users` table
2. Implement authentication endpoints
3. Test login with superadmin
4. Add more tables as you build features

**Result**: Incremental development, easier to understand

### Option C: Use Migration Files as Reference
**Best for**: Custom implementation

1. Reference the migration files for schema design
2. Create your own tables as needed
3. Modify the schema to fit your needs

**Result**: Customized system for your use case

---

## Recommended: Start Simple

### Step 1: Test Your Superadmin Account (5 min)

Create a simple test script to verify login:

```typescript
// test-login.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function testLogin() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', '1st.mekhlas@gmail.com')
    .single();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('User found:', data);

    // Test password verification (you'll need to implement this in your API)
    console.log('Email:', data.email);
    console.log('Role:', data.role);
    console.log('Status:', data.status);
  }
}

testLogin();
```

### Step 2: Implement Basic Authentication API (1-2 days)

Follow the guide in `API_DOCUMENTATION.md` to create:
- `/api/auth/login` endpoint
- `/api/auth/register` endpoint
- JWT token generation
- Password verification using pgcrypto

### Step 3: Apply Remaining Migrations (1 hour)

Once authentication works, apply the rest of the migrations to get:
- Staff and student tables
- Classes and enrollment
- Library management
- Roles and permissions
- Activity logging

### Step 4: Build Out API Endpoints (1-2 weeks)

Implement CRUD operations for each resource:
- Staff management
- Student management
- Classes
- Library

### Step 5: Connect Frontend (1 week)

Update the React app to call your API:
- Create API service layer
- Update AuthContext
- Connect pages to real data

---

## Testing Your Setup

### Quick Database Check

```sql
-- Check if user exists
SELECT email, role, status FROM users
WHERE email = '1st.mekhlas@gmail.com';

-- Test password (returns true if password is correct)
SELECT
  email,
  (password_hash = crypt('Liza143', password_hash)) as password_correct
FROM users
WHERE email = '1st.mekhlas@gmail.com';

-- Count total users
SELECT COUNT(*) as total FROM users;
```

Expected results:
- User exists with superadmin role
- Password verification returns true
- Total users = 1

---

## Common Issues & Solutions

### Issue: Can't connect to Supabase
**Solution**: Check your `.env` file has correct values:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Issue: Password verification fails
**Solution**: Make sure you're using pgcrypto's `crypt()` function:
```sql
WHERE password_hash = crypt('Liza143', password_hash)
```

### Issue: Can't query users table
**Solution**: Check Row Level Security policies. You may need to query as the superadmin or adjust RLS policies.

### Issue: Want to reset the database
**Solution**:
```sql
-- Delete all data (keeps table structure)
TRUNCATE users CASCADE;

-- Or drop and recreate
DROP TABLE users CASCADE;
-- Then rerun the users table creation SQL
```

---

## Important Reminders

1. **Change the default password** after first login
2. **Don't commit credentials** to version control
3. **Keep `.env` file** private
4. **Apply migrations in order** (by timestamp)
5. **Test with superadmin** before creating other users

---

## Next Steps

Choose your path:

### Path 1: Full Setup (Recommended)
1. ✅ You have: Superadmin account
2. ⏭️ Next: Apply all migrations
3. ⏭️ Then: Implement backend API
4. ⏭️ Finally: Connect frontend

### Path 2: API First
1. ✅ You have: Superadmin account
2. ⏭️ Next: Build authentication API
3. ⏭️ Then: Test with superadmin
4. ⏭️ Then: Apply migrations
5. ⏭️ Finally: Build rest of API

### Path 3: Custom Build
1. ✅ You have: Superadmin account
2. ⏭️ Next: Design your own schema
3. ⏭️ Then: Build custom API
4. ⏭️ Finally: Adapt frontend

---

## Documentation Quick Links

- **Credentials**: `SUPERADMIN_CREDENTIALS.md`
- **Current Status**: `CURRENT_STATUS.md`
- **Full API Reference**: `API_DOCUMENTATION.md`
- **Database Schema**: `DATABASE_SCHEMA.md`
- **Implementation Guide**: `IMPLEMENTATION_GUIDE.md`
- **Project README**: `README.md`

---

## Get Help

If you need help:
1. Check the documentation files listed above
2. Review the migration files in `supabase/migrations/`
3. Consult Supabase documentation: https://supabase.com/docs
4. Check the code examples in `API_DOCUMENTATION.md`

---

**You're all set!** 🚀

Start with implementing authentication and test it with your superadmin account.
