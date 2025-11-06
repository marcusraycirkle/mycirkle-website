# MyCirkle Loyalty Program - Setup Guide

## Overview
This is a loyalty program website that uses Discord OAuth for authentication and Google Sheets as a database to store user information and points.

## Architecture
- **Frontend**: HTML, CSS, JavaScript (hosted on GitHub Pages or Cloudflare Pages)
- **Backend**: Cloudflare Workers
- **Database**: Google Sheets API
- **Authentication**: Discord OAuth 2.0

## Setup Instructions

### 1. Google Sheets Setup

1. **Create a Google Sheet**:
   - Go to [Google Sheets](https://sheets.google.com)
   - Create a new spreadsheet named "MyCirkle Users"
   - Rename the first sheet to "Users"
   - Add headers in row 1:
     - A1: Discord ID
     - B1: Discord Username
     - C1: First Name
     - D1: Last Name
     - E1: Email
     - F1: Member Since
     - G1: Signup Date
     - H1: Points

2. **Get the Spreadsheet ID**:
   - The spreadsheet URL looks like: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
   - Copy the `SPREADSHEET_ID` part

3. **Enable Google Sheets API**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable "Google Sheets API"
   - Create credentials (API Key)
   - Restrict the API key to only Google Sheets API
   - Copy the API key

4. **Share the Sheet**:
   - Click "Share" on your Google Sheet
   - Change to "Anyone with the link can edit"
   - Or add the service account email if using service account

### 2. Discord Application Setup

1. **Create Discord Application**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Name it "MyCirkle Loyalty"
   - Go to OAuth2 section
   - Add redirect URLs:
     - `https://mycirkle-auth.YOUR_SUBDOMAIN.workers.dev/auth/callback`
     - `http://localhost:8080` (for testing)
   - Copy the Client ID and Client Secret

2. **Create Discord Bot**:
   - Go to "Bot" section
   - Click "Add Bot"
   - Enable required intents if needed
   - Copy the Bot Token

3. **Get Guild (Server) ID**:
   - Enable Developer Mode in Discord (User Settings > Advanced)
   - Right-click your server and "Copy ID"

### 3. Cloudflare Workers Setup

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Set Environment Secrets**:
   ```bash
   cd /workspaces/mycirkle-website
   wrangler secret put DISCORD_CLIENT_ID
   # Paste your Discord Client ID
   
   wrangler secret put DISCORD_CLIENT_SECRET
   # Paste your Discord Client Secret
   
   wrangler secret put DISCORD_BOT_TOKEN
   # Paste your Discord Bot Token
   
   wrangler secret put GOOGLE_SHEETS_API_KEY
   # Paste your Google Sheets API Key
   
   wrangler secret put SPREADSHEET_ID
   # Paste your Spreadsheet ID
   ```

4. **Deploy the Worker**:
   ```bash
   wrangler deploy cloudflare/worker.js
   ```

5. **Note the Worker URL**:
   - After deployment, you'll get a URL like: `https://mycirkle-auth.YOUR_SUBDOMAIN.workers.dev`
   - Update this in `script.js` in the `WORKER_URL` constant

### 4. Frontend Deployment

#### Option A: GitHub Pages
1. Push code to GitHub repository
2. Go to repository Settings > Pages
3. Select source branch (main) and folder (root)
4. Your site will be at: `https://YOUR_USERNAME.github.io/REPO_NAME/`

#### Option B: Cloudflare Pages
1. In Cloudflare Dashboard, go to Pages
2. Connect to Git repository
3. Set build settings (none needed for static site)
4. Deploy

### 5. Update Configuration

1. **Update script.js**:
   ```javascript
   const WORKER_URL = 'https://mycirkle-auth.YOUR_SUBDOMAIN.workers.dev';
   const REDIRECT_URI = 'https://YOUR_SITE_URL';
   ```

2. **Update Discord OAuth Redirect URI**:
   - Add your final site URL to Discord OAuth2 redirects

### 6. Testing

1. **Test Locally**:
   ```bash
   # Serve the site locally
   python3 -m http.server 8080
   # or
   npx serve
   ```

2. **Test Flow**:
   - Click "Log In" button
   - Authorize with Discord
   - Complete signup form
   - Check Google Sheet for new entry
   - Test points system

## API Endpoints

### Worker Endpoints:
- `GET /auth/discord` - Initiate Discord OAuth
- `GET /auth/callback` - Handle OAuth callback
- `GET /auth/check-membership?user_id={id}` - Check Discord server membership
- `POST /api/signup` - Register new user (saves to Google Sheets)
- `POST /api/user-data` - Get user data by Discord ID
- `POST /api/update-points` - Update user points

## Security Notes

1. **API Keys**: Never commit API keys to GitHub
2. **CORS**: Worker has CORS enabled for all origins (restrict in production)
3. **Rate Limiting**: Consider adding rate limiting to prevent abuse
4. **Data Validation**: Worker validates required fields
5. **Sheet Permissions**: Make sure only your worker can write to the sheet

## Troubleshooting

### Discord OAuth Not Working
- Check redirect URIs match exactly
- Verify Client ID and Secret are correct
- Check browser console for errors

### Google Sheets Not Updating
- Verify API key is correct and has Sheets API enabled
- Check spreadsheet is shared properly
- Verify spreadsheet ID is correct
- Check column headers match exactly

### Worker Errors
- Check `wrangler tail` for live logs
- Verify all secrets are set correctly
- Check CORS headers if frontend can't connect

## Maintenance

### Backup Data
Regularly export your Google Sheet as CSV/Excel for backup.

### Monitor Usage
- Check Cloudflare Workers analytics
- Monitor Google Sheets API quota
- Review Discord OAuth usage

## Future Enhancements

- Add KV storage for faster lookups
- Implement caching layer
- Add webhook for real-time updates
- Create admin dashboard
- Add email notifications
- Implement referral system
- Add purchase history tracking
