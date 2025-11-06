# Secure Deployment Instructions

## ⚠️ SECURITY NOTICE
All sensitive credentials have been removed from the code. You must configure them as Cloudflare secrets before deployment.

## Step 1: Configure Cloudflare Secrets

Before deploying, you need to set all required secrets. Run these commands:

```bash
# Install Wrangler if you haven't
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Navigate to project directory
cd /workspaces/mycirkle-website

# Set all required secrets (you'll be prompted to enter each value)
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_GUILD_ID
wrangler secret put GOOGLE_SHEETS_API_KEY
wrangler secret put SPREADSHEET_ID
```

## Step 2: Google Sheet Setup
1. Open your Google Sheet
2. Make sure row 1 has: `Discord ID | Discord Username | First Name | Last Name | Email | Member Since | Signup Date | Points`
3. Row 2 can be blank or have notes
4. Data will start from row 3
5. Click "Share" button → Change to "Anyone with the link can edit"
6. Copy the Spreadsheet ID from the URL (it's the long string between /d/ and /edit)

## Step 3: Deploy Cloudflare Worker
```bash
# Deploy the worker (secrets must be configured first!)
wrangler deploy cloudflare/worker.js
```

After deployment, you'll get a URL like: `https://mycirkle-auth.YOUR_NAME.workers.dev`

## Step 4: Update Frontend
1. Open `script.js`
2. Find line with `const WORKER_URL`
3. Change it to your worker URL:
   ```javascript
   const WORKER_URL = 'https://mycirkle-auth.YOUR_NAME.workers.dev';
   ```

## Step 5: Discord App Setup
1. Go to Discord Developer Portal → Your Application → OAuth2
2. Add these redirect URIs:
   - `http://localhost:8080` (for testing)
   - `https://mycirkle-auth.YOUR_NAME.workers.dev/auth/callback` (replace with your worker URL)
   - Your final website URL when deployed

## Step 6: Test Locally
```bash
# Start local server (already running)
python3 -m http.server 8080

# Visit: http://localhost:8080
```

## Step 7: Deploy Website

### Option 1: GitHub Pages
```bash
git add .
git commit -m "Update MyCirkle website"
git push origin main
```
Then enable GitHub Pages in repository settings.

### Option 2: Cloudflare Pages
1. Go to Cloudflare Dashboard → Pages
2. Connect your GitHub repository
3. Deploy

## How It Works
1. User clicks "Log In" → Redirects to Discord OAuth
2. After Discord auth → Returns to site with user info
3. User fills in name & password → Saves to Google Sheets (row 3+)
4. Points are tracked in column H
5. All data persists in Google Sheets

## Testing Checklist
- [ ] Google Sheet is shared publicly (Anyone with link can edit)
- [ ] Row 1 has correct headers
- [ ] Worker deployed successfully
- [ ] Discord redirect URIs updated
- [ ] Frontend WORKER_URL updated
- [ ] Click "Log In" and test full flow
- [ ] Check Google Sheet for new entries starting at row 3

## Troubleshooting
- **"Missing code" error**: Check Discord redirect URIs match exactly
- **Sheet not updating**: Verify sheet is shared publicly
- **401 Unauthorized**: Check API key has Google Sheets API enabled
- **Bot token error**: Make sure bot is in your Discord server

Your loyalty program is ready to go! 🎉
