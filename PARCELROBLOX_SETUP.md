# ParcelRoblox API Setup Guide

Complete documentation for integrating ParcelRoblox product verification with MyCirkle loyalty system.

---

## 🎮 Overview

**ParcelRoblox** is used to verify Roblox product ownership for MyCirkle loyalty members. When users link their Roblox accounts, the system checks if they own specific products to unlock rewards and features.

**Current Product ID**: `prod_BwM387gLYcCa8qhERIH1JliOQ`

---

## 📋 Prerequisites

1. **ParcelRoblox Account**
   - Sign up at [parcelroblox.com](https://parcelroblox.com)
   - Verify your email address
   - Complete account setup

2. **Roblox Developer Account**
   - Active Roblox account with product listings
   - Products published on Roblox marketplace
   - API access enabled

3. **Cloudflare Workers Setup**
   - Active Cloudflare account
   - Workers environment configured
   - KV namespace created (`USERS_KV`)

---

## 🔑 Step 1: Generate API Key

### In ParcelRoblox Dashboard:

1. **Navigate to API Settings**
   - Log in to ParcelRoblox dashboard
   - Go to Settings → API Keys
   - Click "Create New API Key"

2. **Configure API Key**
   - **Name**: `MyCirkle-Production`
   - **Scope**: 
     - ✅ Read Products
     - ✅ Verify Ownership
     - ❌ Write Products (not needed)
   - **Rate Limit**: Standard (recommended)
   - Click "Generate"

3. **Save API Key**
   ```
   PARCEL_API_KEY=prcl_live_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
   ⚠️ **Important**: Copy this immediately - it won't be shown again!

---

## 🛠️ Step 2: Configure Cloudflare Secrets

### Add secrets to your Cloudflare Worker:

```bash
# Set ParcelRoblox API Key
wrangler secret put PARCEL_API_KEY
# Paste: prcl_live_xxxxxxxxxxxxxxxxxxxxxxxx

# Set Product ID for verification
wrangler secret put PARCEL_PRODUCT_ID
# Paste: prod_BwM387gLYcCa8qhERIH1JliOQ
```

### Or use the Cloudflare Dashboard:

1. Go to Workers → Your Worker → Settings → Variables
2. Click "Add variable" under Environment Variables
3. Add each secret:
   - **Name**: `PARCEL_API_KEY`
   - **Type**: Secret (encrypted)
   - **Value**: Your API key
   - Click "Save"
   
4. Repeat for `PARCEL_PRODUCT_ID`

---

## 📦 Step 3: Register Products

### In ParcelRoblox Dashboard:

1. **Add Product**
   - Navigate to Products → Add Product
   - Click "Import from Roblox"

2. **Import from Roblox**
   - Enter your Roblox product URL or ID
   - Example: `https://www.roblox.com/catalog/123456789/Product-Name`
   - Click "Import"

3. **Configure Product Settings**
   - **Product Name**: Your product name
   - **SKU**: Auto-generated (or custom)
   - **Verification Method**: Roblox Ownership
   - **Price Sync**: Enable (keeps price updated)
   - Click "Save Product"

4. **Copy Product ID**
   - After saving, copy the generated Product ID
   - Format: `prod_BwM387gLYcCa8qhERIH1JliOQ`
   - Update in Cloudflare secrets

---

## 🔗 Step 4: Update Worker Code

### Add Product Verification Endpoint

Add this to your `cloudflare/worker-updated.js`:

```javascript
// API: Verify Roblox product ownership
if (path === '/api/verify-product' && request.method === 'POST') {
    try {
        const { robloxUsername } = await request.json();
        
        if (!robloxUsername) {
            return jsonResponse({ error: 'Roblox username required' }, 400, corsHeaders);
        }

        // Call ParcelRoblox API
        const parcelResponse = await fetch(
            `https://api.parcelroblox.com/v1/products/${env.PARCEL_PRODUCT_ID}/verify`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.PARCEL_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: robloxUsername,
                    platform: 'roblox'
                })
            }
        );

        const verificationData = await parcelResponse.json();

        if (verificationData.owns_product) {
            // User owns the product
            return jsonResponse({
                verified: true,
                productId: env.PARCEL_PRODUCT_ID,
                username: robloxUsername,
                ownedSince: verificationData.owned_since
            }, 200, corsHeaders);
        } else {
            // User does NOT own the product
            return jsonResponse({
                verified: false,
                productId: env.PARCEL_PRODUCT_ID,
                username: robloxUsername
            }, 200, corsHeaders);
        }
    } catch (error) {
        return jsonResponse({ 
            error: 'Product verification failed', 
            details: error.message 
        }, 500, corsHeaders);
    }
}
```

---

## 🧪 Step 5: Test Product Verification

### Using cURL:

```bash
curl -X POST https://mycirkle-auth.marcusray.workers.dev/api/verify-product \
  -H "Content-Type: application/json" \
  -d '{"robloxUsername": "TestUser123"}'
```

### Expected Success Response:

```json
{
  "verified": true,
  "productId": "prod_BwM387gLYcCa8qhERIH1JliOQ",
  "username": "TestUser123",
  "ownedSince": "2025-01-10T14:32:00Z"
}
```

### Expected Failure Response:

```json
{
  "verified": false,
  "productId": "prod_BwM387gLYcCa8qhERIH1JliOQ",
  "username": "TestUser123"
}
```

---

## 🎯 Step 6: Integrate with Dashboard

### Update `script.js` Product Rendering

Modify the `renderProductsToDashboard` function:

```javascript
async function renderProductsToDashboard() {
    const robloxUsername = localStorage.getItem('robloxUsername');
    
    if (!robloxUsername) {
        // Show message: Link Roblox account to view products
        return;
    }

    try {
        // Verify product ownership
        const response = await fetch(`${WORKER_URL}/api/verify-product`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ robloxUsername })
        });

        const data = await response.json();

        if (data.verified) {
            // User owns product - show full access
            document.getElementById('products-grid').innerHTML = `
                <div class="product-card verified">
                    <div class="verified-badge">✅ Verified Owner</div>
                    <h3>Premium Script Package</h3>
                    <p>You own this product!</p>
                    <button onclick="downloadProduct()">Download</button>
                </div>
            `;
        } else {
            // User does NOT own product - show purchase option
            document.getElementById('products-grid').innerHTML = `
                <div class="product-card locked">
                    <div class="locked-badge">🔒 Not Owned</div>
                    <h3>Premium Script Package</h3>
                    <p>Purchase this product to unlock features</p>
                    <a href="https://roblox.com/..." target="_blank">
                        <button>Purchase on Roblox</button>
                    </a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Product verification error:', error);
    }
}
```

---

## 🔐 Security Best Practices

### 1. **Never Expose API Keys**
```javascript
// ❌ BAD - Never do this!
const apiKey = "prcl_live_xxxxxxxx";

// ✅ GOOD - Use Cloudflare secrets
const apiKey = env.PARCEL_API_KEY;
```

### 2. **Validate All Inputs**
```javascript
if (!robloxUsername || robloxUsername.length > 20) {
    return jsonResponse({ error: 'Invalid username' }, 400);
}
```

### 3. **Rate Limiting**
- ParcelRoblox limits: 100 requests/minute
- Implement caching for verified users
- Cache results in KV store for 5 minutes

### 4. **Error Handling**
```javascript
try {
    const response = await fetch(parcelAPI);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
} catch (error) {
    // Log error and return graceful message
    console.error('ParcelRoblox API error:', error);
    return jsonResponse({ error: 'Verification temporarily unavailable' }, 503);
}
```

---

## 📊 Step 7: Monitor API Usage

### In ParcelRoblox Dashboard:

1. **View Analytics**
   - Navigate to Analytics → API Usage
   - Monitor request counts
   - Check error rates

2. **Set Up Alerts**
   - Go to Settings → Notifications
   - Enable "API Rate Limit Warning" (80% threshold)
   - Enable "API Error Spike" (>5% error rate)

3. **Review Logs**
   - Check Recent Requests for debugging
   - Filter by status code (200, 400, 500)
   - Export logs for compliance

---

## 🚀 Deployment Checklist

- [ ] ParcelRoblox account created and verified
- [ ] API key generated and stored in Cloudflare secrets
- [ ] Product ID configured (`prod_BwM387gLYcCa8qhERIH1JliOQ`)
- [ ] Worker code updated with verification endpoint
- [ ] Tested with valid Roblox username
- [ ] Tested with invalid username (error handling)
- [ ] Dashboard UI updated to show verification status
- [ ] KV caching implemented for performance
- [ ] Rate limiting configured
- [ ] Error monitoring enabled
- [ ] API usage alerts set up

---

## 🆘 Troubleshooting

### Issue: "API Key Invalid"
**Solution**: 
- Verify the API key is correct in Cloudflare secrets
- Check if key has expired (rotate if needed)
- Ensure key has correct scopes (Read Products, Verify Ownership)

### Issue: "Product Not Found"
**Solution**:
- Confirm product ID matches ParcelRoblox dashboard
- Check if product was deleted or archived
- Verify product is published on Roblox

### Issue: "Username Not Found"
**Solution**:
- Validate Roblox username exists
- Check for typos or special characters
- Ensure username is active (not banned/deleted)

### Issue: "Rate Limit Exceeded"
**Solution**:
- Implement KV caching to reduce API calls
- Cache verification results for 5-10 minutes
- Contact ParcelRoblox to upgrade rate limits

### Issue: "CORS Error"
**Solution**:
- Ensure `Access-Control-Allow-Origin: *` in worker response headers
- Check if ParcelRoblox API allows your worker domain
- Use worker as proxy to avoid browser CORS

---

## 📞 Support Resources

- **ParcelRoblox Documentation**: [docs.parcelroblox.com](https://docs.parcelroblox.com)
- **API Reference**: [api.parcelroblox.com/docs](https://api.parcelroblox.com/docs)
- **Discord Support**: [discord.gg/parcelroblox](https://discord.gg/parcelroblox)
- **Email**: support@parcelroblox.com

---

## 📝 Example Implementation

Complete working example in `cloudflare/worker-updated.js` includes:
- ✅ Product verification endpoint
- ✅ Error handling
- ✅ CORS configuration
- ✅ KV caching
- ✅ Webhook notifications
- ✅ User data storage

Deploy to Cloudflare Workers:
```bash
wrangler deploy
```

Test endpoint:
```bash
curl https://mycirkle-auth.marcusray.workers.dev/api/verify-product -d '{"robloxUsername":"YourUsername"}'
```

---

**Last Updated**: January 15, 2025  
**Version**: 1.0  
**Status**: Production Ready ✅
