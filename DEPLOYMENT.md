# Deployment Guide

This guide will help you deploy the PXP Student Staff Management Platform to various hosting providers.

## Prerequisites

Before deploying, ensure you have:

1. A Supabase project set up with all migrations applied
2. Your Supabase URL and Anon Key from your project settings
3. Git installed and code pushed to GitHub

## Environment Variables

All hosting providers will need these environment variables:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Deployment Options

### Option 1: Netlify

1. **Via Netlify Dashboard:**
   - Go to https://app.netlify.com/
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository
   - Build settings are already configured in `netlify.toml`
   - Add environment variables in Site settings → Environment variables
   - Deploy!

2. **Via Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify init
   netlify env:set VITE_SUPABASE_URL "your-url"
   netlify env:set VITE_SUPABASE_ANON_KEY "your-key"
   netlify deploy --prod
   ```

### Option 2: Vercel

1. **Via Vercel Dashboard:**
   - Go to https://vercel.com/
   - Click "Add New" → "Project"
   - Import your GitHub repository
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Add environment variables
   - Deploy!

2. **Via Vercel CLI:**
   ```bash
   npm install -g vercel
   vercel login
   vercel
   vercel env add VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_ANON_KEY
   vercel --prod
   ```

### Option 3: GitHub Pages

1. Add this to `vite.config.ts`:
   ```typescript
   base: '/your-repo-name/'
   ```

2. Install gh-pages:
   ```bash
   npm install --save-dev gh-pages
   ```

3. Add to `package.json` scripts:
   ```json
   "deploy": "npm run build && gh-pages -d dist"
   ```

4. Create `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [ main ]

   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: 18
         - run: npm ci
         - run: npm run build
           env:
             VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
             VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
         - uses: peaceiris/actions-gh-pages@v3
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./dist
   ```

5. Add secrets in GitHub: Settings → Secrets → Actions

### Option 4: Railway

1. Go to https://railway.app/
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Add environment variables
5. Railway will auto-detect and deploy

### Option 5: Render

1. Go to https://render.com/
2. Click "New" → "Static Site"
3. Connect your repository
4. Build Command: `npm run build`
5. Publish Directory: `dist`
6. Add environment variables
7. Deploy!

### Option 6: Traditional Web Hosting (cPanel, etc.)

1. Build locally:
   ```bash
   npm install
   npm run build
   ```

2. Create a `.htaccess` file in the `dist` folder:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

3. Upload the entire `dist` folder contents to your hosting provider via FTP/SFTP

4. **Important for environment variables:**
   - Since traditional hosting doesn't support build-time env vars, you'll need to hardcode them or use a different approach
   - Option A: Create a `config.js` file in `dist` with your values
   - Option B: Use a runtime configuration service

## Supabase Setup

Make sure you've applied all migrations to your Supabase project:

1. Go to Supabase Dashboard → SQL Editor
2. Run each migration file in the `supabase/migrations/` folder in order
3. Deploy Edge Functions (if needed):
   - Use the Supabase Dashboard or CLI to deploy functions in `supabase/functions/`

## Post-Deployment Checklist

- [ ] Environment variables are set correctly
- [ ] Database migrations are applied
- [ ] Edge functions are deployed (if using)
- [ ] Storage buckets are created (for document uploads)
- [ ] RLS policies are active
- [ ] Admin user is created
- [ ] Test login functionality
- [ ] Test all major features
- [ ] Set up custom domain (optional)
- [ ] Configure CORS if needed
- [ ] Set up monitoring/analytics (optional)

## Troubleshooting

**Build fails:**
- Check that all environment variables are set
- Ensure Node.js version is 18 or higher
- Run `npm ci` instead of `npm install`

**Blank page after deployment:**
- Check browser console for errors
- Verify environment variables are correct
- Check if `base` in `vite.config.ts` is set correctly

**Authentication not working:**
- Verify Supabase URL and keys are correct
- Check that migrations are applied
- Ensure RLS policies are enabled

**404 errors on page refresh:**
- Configure redirects/rewrites for SPA routing
- For Netlify: Already handled in `netlify.toml`
- For others: Add appropriate configuration

## Getting Help

If you encounter issues:
1. Check the browser console for errors
2. Check the hosting provider's build logs
3. Verify all environment variables
4. Check Supabase logs in the dashboard
