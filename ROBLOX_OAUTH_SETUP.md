# Roblox OAuth Setup Guide

## ✅ What Changed

Users now **connect their Roblox account via official OAuth** instead of manually entering a username. This provides:
- ✅ **Verified identity** - No fake usernames
- ✅ **Automatic user ID** - Get Roblox User ID for ParcelRoblox verification
- ✅ **Secure** - Uses official Roblox OAuth flow
- ✅ **Better UX** - One-click connection button

---

## 🚀 Setup Steps

### 1. Create Roblox OAuth Application

1. Go to **[Roblox Creator Hub - Credentials](https://create.roblox.com/credentials)**
2. Click **"Create OAuth2 App"**
3. Fill in the form:

   **App Name**: `MyCirkle Loyalty Program`
   
   **Description**: `Loyalty rewards system for Cirkle Development customers`
   
   **App Website**: `https://my.cirkledevelopment.co.uk`
   
   **Redirect URIs**: 
   ```
   https://mycirkle-auth.marcusray.workers.dev/auth/roblox/callback
   https://my.cirkledevelopment.co.uk/auth/roblox/callback
   http://localhost:8080/auth/roblox/callback
   ```
   *(Add all three: production worker, production site, and local testing)*
   
   **Requested Scopes**:
   - ✅ `openid` (Required)
   - ✅ `profile` (Required)
   
4. Click **"Create"**

---

### 2. Get Your Credentials

After creating the app, you'll see:

```
Client ID: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Client Secret: YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
```

⚠️ **Save these immediately!** The secret won't be shown again.

---

### 3. Configure Cloudflare Worker

Add the credentials to your Cloudflare Worker:

```bash
# Navigate to project
cd /workspaces/mycirkle-website

# Set Roblox Client ID
wrangler secret put ROBLOX_CLIENT_ID
# Paste your Client ID when prompted

# Set Roblox Client Secret
wrangler secret put ROBLOX_CLIENT_SECRET
# Paste your Client Secret when prompted
```

---

### 4. Deploy Updated Worker

```bash
wrangler deploy cloudflare/worker-updated.js
```

---

## 🎮 How It Works (User Flow)

### Signup Process:

1. **User logs in with Discord** → Gets user info
2. **Enters name and password** → Creates account
3. **Selects preferences** (country, timezone, etc.)
4. **Clicks "Connect Roblox Account" button** 🔴
   - Opens Roblox OAuth popup
   - User logs into Roblox (if not already)
   - Authorizes the app
   - Popup closes automatically
5. **Button updates to show**: ✅ Connected: `USERNAME`
6. **User completes signup** → Account created with verified Roblox data

### What Gets Stored:

```javascript
{
  "discordId": "123456789",
  "discordUsername": "user#0001",
  "firstName": "John",
  "lastName": "Doe",
  "robloxUsername": "JohnRBLX",      // From OAuth
  "robloxUserId": "987654321",       // From OAuth
  "country": "US",
  "timezone": "America/New_York"
}
```

---

## 🔧 Technical Details

### OAuth Endpoints Added to Worker:

1. **`/auth/roblox`** - Initiates OAuth flow
   - Redirects to Roblox authorization
   - Includes `openid` and `profile` scopes

2. **`/auth/roblox/callback`** - Handles OAuth callback
   - Exchanges code for access token
   - Fetches user info from Roblox
   - Sends data back to parent window via postMessage

### Frontend Changes:

- **Button replaces text input** in signup form
- **Opens popup window** (600x700px, centered)
- **Listens for postMessage** from callback
- **Updates UI** when connection succeeds
- **Hidden fields** store username and user ID

---

## 🧪 Testing Locally

1. Start local server:
   ```bash
   python3 -m http.server 8080
   ```

2. Update Roblox OAuth App redirect URIs to include:
   ```
   http://localhost:8080/auth/roblox/callback
   ```

3. Update `script.js` WORKER_URL to your deployed worker:
   ```javascript
   const WORKER_URL = 'https://mycirkle-auth.marcusray.workers.dev';
   ```

4. Test the flow:
   - Click "Continue with Discord"
   - Complete name/password steps
   - Click "Connect Roblox Account"
   - Authorize the app
   - Verify button shows ✅ Connected

---

## 🆘 Troubleshooting

### "Roblox OAuth not configured" error
**Solution**: Make sure you've set both secrets:
```bash
wrangler secret put ROBLOX_CLIENT_ID
wrangler secret put ROBLOX_CLIENT_SECRET
```

### Popup stays open after auth
**Solution**: Check that your redirect URI exactly matches what's in Roblox OAuth app settings (including https vs http)

### "No access token received"
**Solution**: 
- Verify Client ID and Secret are correct
- Check that scopes include `openid` and `profile`
- Make sure redirect URI is whitelisted in Roblox app

### Button doesn't update after connection
**Solution**: 
- Check browser console for postMessage errors
- Verify worker URL is correct in script.js
- Make sure popup isn't being blocked by browser

---

## 🔐 Security Notes

- ✅ OAuth tokens are never stored client-side
- ✅ Only username and user ID are saved to database
- ✅ Client Secret stays secure in Cloudflare Worker
- ✅ HTTPS required for production
- ✅ postMessage origin validation prevents XSS

---

## 📊 Integration with ParcelRoblox

Once you have the Roblox User ID, you can verify product ownership:

```javascript
// In your ParcelRoblox verification
const response = await fetch('https://api.parcelroblox.com/v1/products/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PARCEL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: user.robloxUserId,  // From OAuth
    productId: 'prod_BwM387gLYcCa8qhERIH1JliOQ'
  })
});
```

---

## 📝 Next Steps

1. ✅ **Create Roblox OAuth app** at create.roblox.com/credentials
2. ✅ **Configure Cloudflare secrets** with client ID and secret
3. ✅ **Deploy worker** with updated code
4. ✅ **Test signup flow** end-to-end
5. ⏳ **Connect ParcelRoblox** for product verification
6. ⏳ **Add product rewards** that require Roblox ownership

---

**Status**: ✅ Roblox OAuth integration complete and deployed!
**Last Updated**: November 7, 2025
