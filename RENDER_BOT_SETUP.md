# 🤖 Render.com Bot Setup Guide (FREE Web Service)

## ✅ Correct Setup (Web Service - FREE):

### Step 1: Delete the Current Service (If Exists)
1. Go to Render Dashboard: https://dashboard.render.com
2. Find "MyCirkle Bot" service (if it exists)
3. Click Settings → Delete Service

### Step 2: Create NEW Web Service
1. Click **"New +"** button in Render Dashboard
2. Select **"Web Service"**
3. Connect your GitHub repository: `marcusraycirkle/mycirkle-website`
4. Configure:
   - **Name**: `MyCirkle Bot`
   - **Region**: Oregon (US West) or closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave blank
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Step 3: Add Environment Variables
In the Environment section, add:

**Required:**
- **Key**: `BOT_TOKEN`
- **Value**: Your Discord bot token (get from Discord Developer Portal)

**Optional (already has default):**
- **Key**: `CONFIG_URL`
- **Value**: `https://mycirkle-auth.marcusray.workers.dev/api/bot-config`

### Step 4: Deploy
1. Click **"Create Web Service"**
2. Select **FREE** plan (not paid!)
3. Wait for deployment (should take 1-2 minutes)
4. Check logs - you should see:
   ```
   🌐 Health check server running on port 3000
   🤖 MyCirkle Bot Starting...
   ✅ Connected to Discord Gateway
   🟢 Bot is now ONLINE
   ```

## ✅ Success Indicators:
- ✅ Service shows "Live" status
- ✅ No "port scan timeout" errors
- ✅ Logs show "Health check server running"
- ✅ Logs show "Connected to Discord Gateway"
- ✅ Your Discord bot appears ONLINE in the server
- ✅ Health check endpoint responds at: `https://your-service.onrender.com/health`

## 🔍 How It Works:
The bot now runs BOTH:
1. **HTTP Server** (port 3000) - For Render health checks (keeps service alive)
2. **Discord WebSocket** - For bot presence and status

This lets you use Render's FREE web service tier instead of paid background workers!

## 💰 Pricing:
**Free Tier:**
- ✅ 750 hours/month (enough for 24/7 uptime)
- ✅ Unlimited web services
- ✅ Automatic deploys from GitHub
- ✅ Logs & monitoring
- ✅ **COMPLETELY FREE**

## 🔍 Troubleshooting:

### Bot shows offline:
1. Check Render logs for connection errors
2. Verify BOT_TOKEN is correct
3. Check Discord Developer Portal → Bot has correct token
4. Restart the service in Render

### Deployment keeps failing:
1. Make sure you selected **"Background Worker"** not "Web Service"
2. Check build logs for npm install errors
3. Verify package.json exists in repo root

### Bot connects but goes offline:
1. Check logs for heartbeat errors
2. May need to restart service
3. Discord API might be having issues (check status.discord.com)

## 📝 Notes:
- This bot doesn't handle commands (Cloudflare Worker does)
- Only maintains online presence and status rotation
- Very lightweight - won't use much resources
- Auto-redeploys on GitHub push to main branch
