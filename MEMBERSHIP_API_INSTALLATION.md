# MyCirkle Membership Verification API - Installation Guide

## 📋 Prerequisites

Before you begin, make sure you have:
- ✅ Cloudflare account with Workers enabled
- ✅ Wrangler CLI installed (or use Cloudflare dashboard)
- ✅ Your MyCirkle Worker already deployed
- ✅ A blog/website where you want to verify memberships

---

## 🚀 Step 1: Deploy the Updated Worker

### Option A: Using Wrangler CLI (Recommended)

1. **Open a terminal** in your project directory:
   ```bash
   cd /workspaces/mycirkle-website
   ```

2. **Login to Cloudflare** (if not already logged in):
   ```bash
   wrangler login
   ```

3. **Deploy the updated worker**:
   ```bash
   wrangler deploy cloudflare/worker.js
   ```

4. **Verify deployment**:
   ```bash
   # You should see output like:
   # ✨ Successfully published your script to
   # https://mycirkle-auth.marcusray.workers.dev
   ```

### Option B: Using Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **Overview**
3. Click on your worker (e.g., `mycirkle-auth`)
4. Click **Quick Edit** or **Edit Code**
5. Copy the entire contents of `/workspaces/mycirkle-website/cloudflare/worker.js`
6. Paste it into the editor
7. Click **Save and Deploy**

---

## 🧪 Step 2: Test the API

### Test 1: Check if the endpoint exists

**Using curl:**
```bash
curl -X POST https://mycirkle-auth.marcusray.workers.dev/api/verify-membership \
  -H "Content-Type: application/json" \
  -d '{"discordId": "test"}'
```

**Expected Response (for non-existent user):**
```json
{
  "verified": false,
  "message": "I'm sorry. I could not find your MyCirkle account..."
}
```

### Test 2: Test with a real Discord ID

1. **Get a real Discord ID** from an existing MyCirkle member:
   - Go to https://my.cirkledevelopment.co.uk
   - Sign up/login with Discord
   - Your Discord ID is saved in the system

2. **Test with the real ID:**
   ```bash
   curl -X POST https://mycirkle-auth.marcusray.workers.dev/api/verify-membership \
     -H "Content-Type: application/json" \
     -d '{"discordId": "YOUR_ACTUAL_DISCORD_ID_HERE"}'
   ```

3. **Expected Response (if member exists):**
   ```json
   {
     "verified": true,
     "message": "You have been verified as a MyCirkle member!",
     "member": {
       "discordUsername": "YourName#1234",
       "accountNumber": "MC-12345",
       "points": 150,
       "tier": "Bronze 🥉",
       "memberSince": "2025-01-01"
     }
   }
   ```

### Test 3: Open the example HTML page

1. **Open the example file** in a browser:
   - Navigate to the project folder
   - Open `MEMBERSHIP_VERIFICATION_EXAMPLE.html` in your browser
   - Or host it temporarily on a local server

2. **Edit the test Discord ID** in the HTML:
   ```javascript
   // Line ~127 in MEMBERSHIP_VERIFICATION_EXAMPLE.html
   let currentDiscordUser = {
       id: 'YOUR_REAL_DISCORD_ID', // Replace this
       username: 'TestUser#1234',
       avatar: null
   };
   ```

3. **Click "Verify MyCirkle Membership"** and check if it works

---

## 🌐 Step 3: Integrate into Your Blog Website

### For HTML/JavaScript Websites

1. **Add the verification function** to your blog's JavaScript:

```javascript
// Add this to your blog's main JavaScript file
async function verifyMyCirkleMembership(discordUserId) {
    try {
        const response = await fetch('https://mycirkle-auth.marcusray.workers.dev/api/verify-membership', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                discordId: discordUserId
            })
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Membership verification error:', error);
        return { verified: false, error: error.message };
    }
}
```

2. **Add the UI for verification** (example):

```html
<div id="membership-verification">
    <h2>Verify MyCirkle Membership</h2>
    <button onclick="handleVerification()" id="verifyBtn">
        🎫 Verify Membership
    </button>
    <div id="verificationStatus"></div>
</div>

<script>
async function handleVerification() {
    // Get Discord ID from your OAuth session
    const discordUser = JSON.parse(localStorage.getItem('discordUser'));
    
    if (!discordUser || !discordUser.id) {
        alert('Please login with Discord first!');
        return;
    }
    
    const statusDiv = document.getElementById('verificationStatus');
    const btn = document.getElementById('verifyBtn');
    
    // Show loading
    btn.disabled = true;
    statusDiv.innerHTML = '⏳ Verifying your membership... Please wait...';
    
    // Call API
    const result = await verifyMyCirkleMembership(discordUser.id);
    
    if (result.verified) {
        // SUCCESS - Grant access
        statusDiv.innerHTML = `
            <div style="color: green;">
                ✅ ${result.message}
                <br>Account: ${result.member.accountNumber}
                <br>Points: ${result.member.points}
                <br>Tier: ${result.member.tier}
            </div>
        `;
        
        // Save verification status
        localStorage.setItem('mycirkleVerified', 'true');
        
        // Redirect to blog content after 2 seconds
        setTimeout(() => {
            window.location.href = '/blog/dashboard';
        }, 2000);
        
    } else {
        // FAILED - Not a member
        statusDiv.innerHTML = `
            <div style="color: red;">
                ❌ ${result.message}
                <br><br>
                <a href="https://my.cirkledevelopment.co.uk" target="_blank">
                    Sign up for MyCirkle →
                </a>
            </div>
        `;
        btn.disabled = false;
    }
}
</script>
```

### For React/Next.js

```javascript
// components/MembershipVerification.jsx
import { useState } from 'react';

export default function MembershipVerification({ discordUser }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    async function handleVerify() {
        setLoading(true);
        
        try {
            const response = await fetch(
                'https://mycirkle-auth.marcusray.workers.dev/api/verify-membership',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ discordId: discordUser.id })
                }
            );
            
            const data = await response.json();
            setResult(data);
            
            if (data.verified) {
                // Grant access - redirect or update state
                setTimeout(() => {
                    window.location.href = '/blog/dashboard';
                }, 2000);
            }
        } catch (error) {
            setResult({ verified: false, message: 'Error: ' + error.message });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="membership-verification">
            <h2>Verify MyCirkle Membership</h2>
            
            <button onClick={handleVerify} disabled={loading}>
                {loading ? '⏳ Verifying...' : '🎫 Verify Membership'}
            </button>
            
            {result && (
                <div className={result.verified ? 'success' : 'error'}>
                    {result.verified ? '✅' : '❌'} {result.message}
                    
                    {result.verified && (
                        <div className="member-info">
                            <p>Account: {result.member.accountNumber}</p>
                            <p>Points: {result.member.points}</p>
                            <p>Tier: {result.member.tier}</p>
                        </div>
                    )}
                    
                    {!result.verified && (
                        <a href="https://my.cirkledevelopment.co.uk" target="_blank">
                            Sign up for MyCirkle →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
```

### For WordPress (PHP)

```php
<?php
// functions.php or custom plugin

function verify_mycirkle_membership($discord_id) {
    $url = 'https://mycirkle-auth.marcusray.workers.dev/api/verify-membership';
    
    $response = wp_remote_post($url, array(
        'headers' => array('Content-Type' => 'application/json'),
        'body' => json_encode(array('discordId' => $discord_id)),
        'timeout' => 15
    ));
    
    if (is_wp_error($response)) {
        return array('verified' => false, 'error' => $response->get_error_message());
    }
    
    $body = wp_remote_retrieve_body($response);
    return json_decode($body, true);
}

// Usage in your template
$discord_id = get_user_meta(get_current_user_id(), 'discord_id', true);
$verification = verify_mycirkle_membership($discord_id);

if ($verification['verified']) {
    echo '<p>✅ MyCirkle Member Verified!</p>';
    echo '<p>Account: ' . esc_html($verification['member']['accountNumber']) . '</p>';
    // Show blog content
} else {
    echo '<p>❌ ' . esc_html($verification['message']) . '</p>';
    // Hide blog content or show sign-up link
}
?>
```

---

## 🔐 Step 4: Secure Your Implementation (Optional but Recommended)

### Add Access Control on Your Blog

```javascript
// Check verification status before allowing access
function checkMembershipAccess() {
    const isVerified = localStorage.getItem('mycirkleVerified');
    const currentPath = window.location.pathname;
    
    // List of protected routes
    const protectedRoutes = ['/blog', '/premium-content', '/members-area'];
    
    // Check if current route is protected
    const isProtectedRoute = protectedRoutes.some(route => 
        currentPath.startsWith(route)
    );
    
    if (isProtectedRoute && isVerified !== 'true') {
        // Redirect to verification page
        window.location.href = '/verify-membership';
    }
}

// Run on page load
window.addEventListener('DOMContentLoaded', checkMembershipAccess);
```

### Refresh Verification Periodically

```javascript
// Re-verify every 24 hours
const VERIFICATION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in ms

function isVerificationExpired() {
    const lastVerified = localStorage.getItem('mycirkleVerifiedAt');
    if (!lastVerified) return true;
    
    const timeSince = Date.now() - parseInt(lastVerified);
    return timeSince > VERIFICATION_EXPIRY;
}

// On page load, check if re-verification needed
if (isVerificationExpired()) {
    // Clear old verification and prompt user to re-verify
    localStorage.removeItem('mycirkleVerified');
    // Show verification prompt...
}

// After successful verification
localStorage.setItem('mycirkleVerifiedAt', Date.now().toString());
```

---

## ✅ Step 5: Verify Everything Works

### Checklist:

- [ ] Worker deployed successfully
- [ ] API endpoint responds to test requests
- [ ] Tested with real Discord ID (returns member data)
- [ ] Tested with fake Discord ID (returns not found message)
- [ ] Integrated verification function into blog
- [ ] UI shows loading state during verification
- [ ] Success message displays member details
- [ ] Failure message shows sign-up link
- [ ] Access control works (grants/denies blog access)
- [ ] Discord OAuth flow provides Discord ID correctly

---

## 🐛 Troubleshooting

### Issue: "Worker not found" or 404 error
**Solution:** Make sure the worker is deployed and the URL is correct:
```bash
wrangler deploy cloudflare/worker.js
```

### Issue: CORS error in browser
**Solution:** The API already has CORS enabled. Check browser console for exact error.

### Issue: Always returns "not verified"
**Solution:** 
1. Verify you're using the correct Discord ID
2. Check that the user exists in MyCirkle (they signed up at my.cirkledevelopment.co.uk)
3. Check worker logs: `wrangler tail`

### Issue: Discord OAuth doesn't provide Discord ID
**Solution:** Make sure your OAuth scope includes `identify`:
```javascript
const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify email', // 'identify' is required
    state: state
});
```

### Issue: Rate limit errors
**Solution:** The API is protected by rate limiting (60 req/min per IP). If testing heavily, wait a minute or test from different IPs.

---

## 📚 Additional Resources

- **Full API Documentation:** See `MEMBERSHIP_API_DOCS.md`
- **Working Example:** Open `MEMBERSHIP_VERIFICATION_EXAMPLE.html` in browser
- **Discord OAuth Setup:** See your existing Discord integration docs
- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/

---

## 🆘 Need Help?

If you run into issues:
1. Check the worker logs: `wrangler tail`
2. Test the API with curl first (before integrating)
3. Verify Discord OAuth is providing the correct Discord ID
4. Check browser console for JavaScript errors

---

## 🎉 You're Done!

Your MyCirkle membership verification API is now live! Users can verify their membership on your blog website by clicking "Verify Membership" and the system will check if their Discord account has a MyCirkle account.

**Next Steps:**
- Customize the UI to match your blog's design
- Add additional features (e.g., show member perks based on tier)
- Consider adding server-side verification for extra security
