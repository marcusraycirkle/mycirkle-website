# Bot Restart Instructions - Activity Rewards Fix

## Issue
- Users not receiving points every 5th message
- Users not getting DMs when they earn activity points
- Leaderboard showing old balances

## Root Cause
The bot on Render needs to be restarted to pick up the code changes.

## Solution

### 1. Restart the Bot on Render
1. Go to https://dashboard.render.com/
2. Find your "mycirkle-bot" service
3. Click "Manual Deploy" → "Clear build cache & deploy"
4. OR click the three dots menu → "Restart"

### 2. Verify Bot is Working
After restart, check:
- Bot status shows "Online" in Discord
- Send 5 messages in a tracked channel (IDs: `1365306074319683707` or `1315050837520809984`)
- You should receive:
  - 2 points added to your account
  - A DM from the bot
  - A message in the channel confirming points

### 3. Verify Leaderboard
- Run `/leaderboard` command in Discord
- Balances should show current points from KV storage

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
