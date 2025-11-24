# Bot Restart Instructions - Activity Rewards Fix

## Issue
- Bot goes to "sleep" after about a minute on Render free tier
- Users not receiving points every 5th message when bot is asleep
- Commands still work but bot shows offline

## Root Cause
Render's free tier spins down services after 15 minutes of inactivity. The bot needs external requests to stay alive.

## Solution

### Option 1: Upgrade Render Plan (Recommended)
1. Go to https://dashboard.render.com/
2. Select your bot service
3. Upgrade to a paid plan ($7/month minimum)
4. Paid plans keep services running 24/7

### Option 2: Use UptimeRobot (Free Keep-Alive)
1. Go to https://uptimerobot.com/ and create free account
2. Add New Monitor:
   - Monitor Type: HTTP(s)
   - Friendly Name: MyCirkle Bot
   - URL: `https://your-bot-service.onrender.com/health`
   - Monitoring Interval: 5 minutes
3. Save monitor - this will ping your bot every 5 minutes to keep it awake

### Option 3: Use Cron-Job.org (Free Keep-Alive)
1. Go to https://cron-job.org/ and create free account
2. Create new cronjob:
   - Title: MyCirkle Bot Keep-Alive
   - URL: `https://your-bot-service.onrender.com/health`
   - Schedule: Every 5 minutes
3. Enable the job

### Get Your Render URL
1. Go to https://dashboard.render.com/
2. Click on your bot service
3. Copy the URL at the top (looks like: `https://mycirkle-bot-xxxx.onrender.com`)

## Current Configuration
- **Tracked Channels**: `1365306074319683707`, `1315050837520809984`
- **Message Threshold**: Every 5 messages
- **Points per Milestone**: 2 points
- **Worker API**: `https://mycirkle-auth.marcusray.workers.dev`

## Forum Post Rewards
- Forum `1315679706745409566`: 3 points per thread
- Forum `1323293808326086717`: 4 points per thread

## If Still Not Working
1. Check Render logs for errors
2. Verify BOT_TOKEN environment variable is set
3. Verify WORKER_API_URL is set correctly
4. Check bot has proper Discord permissions (Read Messages, Send Messages, Send DMs)
