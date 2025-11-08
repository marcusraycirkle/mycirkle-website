# Discord DM Verification Fix

## Issue
Discord bot is not sending DM verification codes to users.

## Root Cause
The Discord bot needs the **Message Content Intent** enabled in the Discord Developer Portal. Without this permission, the bot cannot send direct messages to users.

## Solution

### Step 1: Enable Message Content Intent
1. Go to [Discord Developer Portal](https://discord.com/developers/applications/1426682720544624720)
2. Navigate to the **Bot** tab
3. Scroll down to **Privileged Gateway Intents**
4. Enable the following intents:
   - ✅ **Message Content Intent**
   - ✅ **Server Members Intent** (if not already enabled)
   - ✅ **Presence Intent** (if not already enabled)
5. Click **Save Changes**

### Step 2: Verify Bot Permissions
1. Go to the **OAuth2** → **URL Generator** tab
2. Select scopes:
   - `bot`
   - `applications.commands`
3. Select bot permissions:
   - ✅ **Send Messages**
   - ✅ **Send Messages in Threads**
   - ✅ **Embed Links**
   - ✅ **Attach Files**
   - ✅ **Read Message History**
4. Use the generated URL to re-invite the bot (if needed)

### Step 3: Test DM Functionality
1. Try to update your password or delete your account on the website
2. You should receive a verification code in your Discord DMs
3. The message will appear as an embed with:
   - Title: "🔐 MyCirkle Verification Code"
   - Your verification code in a code block
   - Footer warning about security

## Code Implementation
The DM code is already implemented in `cloudflare/worker.js` at line 483:
```javascript
// API: Send verification code via Discord DM
if (path === '/api/send-verification' && request.method === 'POST') {
    // Creates DM channel with user
    // Sends embed with verification code
}
```

## Alternative: Check Bot Token
If the issue persists after enabling intents, verify that the bot token is correct:
```bash
wrangler secret put DISCORD_BOT_TOKEN
# Enter your bot token from Discord Developer Portal
```

## Testing Verification Codes
1. Log into the dashboard
2. Go to Settings → Update Password
3. You should get a DM with a 6-digit code
4. Enter the code on the website to confirm the change
