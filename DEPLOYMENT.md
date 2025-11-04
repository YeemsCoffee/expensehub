# ExpenseHub Deployment Guide - Render

This guide walks you through deploying ExpenseHub to Render as a unified application (backend + frontend together).

## Prerequisites

- GitHub account
- Render account (sign up at https://render.com)
- ExpenseHub code pushed to GitHub

## Step 1: Push Your Code to GitHub

Make sure all your latest changes are pushed:

```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin your-branch-name
```

## Step 2: Create a Render Account

1. Go to https://render.com
2. Sign up with GitHub (recommended for easy integration)
3. Authorize Render to access your repositories

## Step 3: Create a PostgreSQL Database

1. From Render Dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `expensehub-db`
   - **Database**: `expensehub`
   - **User**: `expensehub_user`
   - **Region**: Choose closest to you
   - **Plan**: **Free**
3. Click **"Create Database"**
4. Wait for it to provision (takes ~1 minute)
5. **Copy the "Internal Database URL"** - you'll need this

## Step 4: Run Database Migrations

After the database is created, you need to set up the schema:

1. In the database page, click **"Connect"** → **"External Connection"**
2. Copy the **PSQL Command** (looks like: `PGPASSWORD=xxx psql -h xxx -U xxx xxx`)
3. On your local machine, run that command to connect
4. Once connected, run your migration files:

```sql
-- Run your schema setup
\i /path/to/expensehub/backend/database/schema.sql
\i /path/to/expensehub/backend/database/org_chart_approval_migration.sql
```

Or you can use a tool like **pgAdmin** or **DBeaver** to connect and run the SQL files.

## Step 5: Create the Web Service

1. From Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository (expensehub)
3. Configure the service:

   - **Name**: `expensehub`
   - **Region**: Same as your database
   - **Branch**: `main` (or your deployment branch)
   - **Root Directory**: Leave blank
   - **Runtime**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Plan**: **Free**

4. Click **"Advanced"** to add environment variables:

   - `NODE_ENV` = `production`
   - `DATABASE_URL` = Paste the Internal Database URL from Step 3
   - `JWT_SECRET` = Click "Generate" (or use your own secure secret)
   - `PORT` = `10000` (Render's default)

5. Click **"Create Web Service"**

## Step 6: Wait for Deployment

Render will:
1. Clone your repository
2. Install backend dependencies
3. Install frontend dependencies
4. Build the React frontend
5. Start the Node.js backend
6. The backend will serve the frontend static files

This takes **5-10 minutes** on the first deploy.

## Step 7: Access Your App

Once deployed, Render gives you a URL like:
```
https://expensehub.onrender.com
```

**That's your permanent shareable link!** Works on any device.

## Troubleshooting

### Build Fails

**Check the build logs** in Render dashboard. Common issues:
- Missing dependencies: Make sure package.json is up to date
- Node version: Render uses Node 18+ by default

### Database Connection Fails

- Make sure `DATABASE_URL` environment variable is set correctly
- Use the **Internal Database URL** (not external)
- Verify database is in the same region as web service

### App Loads But API Fails

- Check if database migrations ran successfully
- Verify `JWT_SECRET` is set
- Check logs: Click your service → "Logs" tab

### Free Tier Limitations

Render free tier:
- **Database**: 90 days free, then $7/month
- **Web service**: Spins down after 15 minutes of inactivity
- **First request**: Takes 30-60 seconds to wake up (cold start)

## Updating Your App

After making code changes:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Render automatically detects the push and redeploys! Takes ~2-5 minutes.

## Custom Domain (Optional)

1. In your Render web service, go to **"Settings"** → **"Custom Domain"**
2. Add your domain (e.g., `expensehub.yourcompany.com`)
3. Update your DNS with the CNAME record Render provides
4. Render automatically provisions SSL certificate

## Next Steps

- Set up automatic backups for your database
- Configure alert notifications
- Consider upgrading to paid plan for better performance
- Add monitoring with Render's built-in metrics

---

## Quick Reference

**Your URLs:**
- App: `https://expensehub.onrender.com`
- API: `https://expensehub.onrender.com/api`
- Health Check: `https://expensehub.onrender.com/api/health`

**Render Dashboard:**
- Web Service: https://dashboard.render.com
- Database: https://dashboard.render.com

**Support:**
- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
