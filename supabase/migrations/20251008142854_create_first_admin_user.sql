/*
  # Create First Admin User
  
  Creates the initial admin user account with:
  - Email: 1st.mekhlas@gmail.com
  - Password: okay1234 (must be changed on first login)
  - Role: admin
  - Status: approved
  
  This allows the system to bootstrap with at least one administrator
  who can then approve other users and manage the system.
*/

DO $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = '1st.mekhlas@gmail.com';
  
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      '1st.mekhlas@gmail.com',
      crypt('okay1234', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"First Admin"}',
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    ) RETURNING id INTO v_user_id;
    
    INSERT INTO public.profiles (auth_user_id, email, full_name, role_id, status)
    VALUES (v_user_id, '1st.mekhlas@gmail.com', 'First Admin', 'admin', 'approved')
    RETURNING id INTO v_profile_id;
    
    RAISE NOTICE 'Created admin user with ID: %', v_user_id;
  ELSE
    UPDATE public.profiles
    SET role_id = 'admin', status = 'approved', full_name = COALESCE(full_name, 'First Admin')
    WHERE auth_user_id = v_user_id;
    
    RAISE NOTICE 'Updated existing user to admin: %', v_user_id;
  END IF;
END $$;