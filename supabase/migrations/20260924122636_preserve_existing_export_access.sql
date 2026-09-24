-- Existing report card exports are available from student and parent profiles.
UPDATE public.app_modules
SET default_export_roles = ARRAY['superadmin','admin','teacher','student','parent']
WHERE id = 'grades';

-- Teachers can export student certificates from the student profile.
UPDATE public.app_modules
SET default_export_roles = ARRAY['superadmin','admin','teacher']
WHERE id = 'students';
