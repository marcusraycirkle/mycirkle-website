# Secure Deployment Instructions

## ⚠️ IMPORTANT: Repository Branch Protection

**This repository has branch protection rules enabled.** Direct pushes to `main` are not allowed. Follow the workflow below:

### Standard Deployment Workflow:

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-changes
   ```

2. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "Description of changes"
   ```

3. **Push to Feature Branch**
   ```bash
   git push origin feature/your-changes
   ```

4. **Create Pull Request**
   - Go to GitHub repository
   - Click "Compare & pull request"
   - Add description of changes
   - Request review (if required)
   - Wait for CI/CD checks to pass

5. **Merge to Main**
   - After approval, click "Merge pull request"
   - Select merge strategy (Squash/Merge/Rebase)
   - Confirm merge
   - Delete feature branch (optional)

---

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

# Roblox OAuth Configuration
wrangler secret put ROBLOX_CLIENT_ID
wrangler secret put ROBLOX_CLIENT_SECRET

# Optional: Configure webhook URLs for Discord notifications
wrangler secret put SIGNUP_WEBHOOK_URL
wrangler secret put WELCOME_DM_WEBHOOK_URL
wrangler secret put PRODUCT_WEBHOOK_URL
```

## Step 2: Google Sheet Setup
1. Open your Google Sheet
2. Make sure row 1 has: `Discord ID | Discord Username | First Name | Last Name | Email | Member Since | Signup Date | Points`
3. Row 2 can be blank or have notes
4. Data will start from row 3
5. Click "Share" button → Change to "Anyone with the link can edit"
6. Copy the Spreadsheet ID from the URL (it's the long string between /d/ and /edit)

## Step 2.5: Roblox OAuth Setup
**REQUIRED** - Users must connect their Roblox account via OAuth

1. **Create Roblox OAuth App**
   - Go to [Roblox Creator Hub](https://create.roblox.com/credentials)
   - Click "Create OAuth2 App"
   - Fill in the details:
     - **App Name**: MyCirkle Loyalty
     - **Redirect URIs**: `https://mycirkle-auth.YOUR_NAME.workers.dev/auth/roblox/callback`
     - **Scopes**: `openid`, `profile`
   
2. **Get Credentials**
   - Copy the **Client ID**
   - Copy the **Client Secret**
   - Run in terminal:
     ```bash
     wrangler secret put ROBLOX_CLIENT_ID
     # Paste your Client ID
     
     wrangler secret put ROBLOX_CLIENT_SECRET
     # Paste your Client Secret
     ```

3. **Test the Connection**
   - During signup, users will see "Connect Roblox Account" button
   - Clicking opens Roblox OAuth popup
   - After authorization, their username and ID are saved automatically

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
   - `https://my.cirkledevelopment.co.uk` (your production domain)

## Step 6: Test Locally
```bash
# Start local server (already running)
python3 -m http.server 8080

# Visit: http://localhost:8080
```

## Step 7: Deploy Website

### Option 1: GitHub Pages (Recommended with Branch Protection)
```bash
# Create feature branch for changes
git checkout -b feature/website-update

# Commit your changes
git add .
git commit -m "Update MyCirkle website"

# Push feature branch to remote
git push origin feature/website-update

# Go to GitHub and create Pull Request
# After approval and merge to main, GitHub Pages auto-deploys
```
Then enable GitHub Pages in repository settings (Pages → Source: main branch).

### Option 2: Cloudflare Pages
1. Go to Cloudflare Dashboard → Pages
2. Connect your GitHub repository
3. Set production branch to `main`
4. Cloudflare will auto-deploy on merge to main

### Emergency Direct Push (Admin Override Only)
⚠️ **Use only if you have admin permissions and need to bypass branch protection:**
```bash
git push --force-with-lease origin main
```

## How It Works
1. User clicks "Log In" → Redirects to Discord OAuth
2. After Discord auth → Returns to site with user info
3. User fills in name & password → Saves to Google Sheets (row 3+)
4. Points are tracked in column H
5. All data persists in Google Sheets

## Testing Checklist
- [ ] Branch protection configured (requires PR for main branch)
- [ ] Feature branch created and pushed successfully
- [ ] Pull request created on GitHub
- [ ] CI/CD checks passing (if configured)
- [ ] Google Sheet is shared publicly (Anyone with link can edit)
- [ ] Row 1 has correct headers
- [ ] Worker deployed successfully
- [ ] Discord redirect URIs updated
- [ ] Frontend WORKER_URL updated
- [ ] Click "Log In" and test full flow
- [ ] Check Google Sheet for new entries starting at row 3
- [ ] Webhook notifications working
- [ ] Roblox username verification functional
- [ ] Mobile responsive design tested

## Troubleshooting
- **"Missing code" error**: Check Discord redirect URIs match exactly
- **Sheet not updating**: Verify sheet is shared publicly
- **401 Unauthorized**: Check API key has Google Sheets API enabled
- **Bot token error**: Make sure bot is in your Discord server

Your loyalty program is ready to go! 🎉
