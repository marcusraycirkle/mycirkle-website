# MyCirkle Membership Verification API

## Overview
This API endpoint allows you to verify if a Discord user has a MyCirkle membership account. Perfect for integrating membership checks into external websites like your blog platform.

## API Endpoint

### Verify Membership
**URL:** `https://mycirkle-auth.marcusray.workers.dev/api/verify-membership`  
**Method:** `POST`  
**Content-Type:** `application/json`

### Request Body
```json
{
  "discordId": "123456789012345678"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| discordId | string | Yes | The Discord user ID to verify |

### Response - Success (Member Found)
**Status Code:** `200 OK`

```json
{
  "verified": true,
  "message": "You have been verified as a MyCirkle member!",
  "member": {
    "discordUsername": "User#1234",
    "accountNumber": "MC-12345",
    "points": 150,
    "memberSince": "2025-01-01",
    "tier": "Bronze 🥉"
  }
}
```

### Response - Not Found (No Membership)
**Status Code:** `200 OK`

```json
{
  "verified": false,
  "message": "I'm sorry. I could not find your MyCirkle account. Please check if you are on the right Discord account or sign up at my.cirkledevelopment.co.uk"
}
```

### Response - Error
**Status Code:** `400 Bad Request` or `500 Internal Server Error`

```json
{
  "error": "Discord ID required",
  "verified": false
}
```

## Implementation Example

### JavaScript/Fetch
```javascript
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
    
    if (data.verified) {
      console.log('✅ User is a MyCirkle member!');
      console.log('Account:', data.member.accountNumber);
      console.log('Points:', data.member.points);
      console.log('Tier:', data.member.tier);
      return true;
    } else {
      console.log('❌ User is not a member');
      console.log(data.message);
      return false;
    }
  } catch (error) {
    console.error('Error verifying membership:', error);
    return false;
  }
}
```

### jQuery
```javascript
$.ajax({
  url: 'https://mycirkle-auth.marcusray.workers.dev/api/verify-membership',
  method: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    discordId: '123456789012345678'
  }),
  success: function(data) {
    if (data.verified) {
      alert('✅ Verified! Welcome ' + data.member.discordUsername);
    } else {
      alert('❌ ' + data.message);
    }
  },
  error: function(xhr, status, error) {
    alert('Error: ' + error);
  }
});
```

### Python (requests)
```python
import requests

def verify_membership(discord_id):
    url = 'https://mycirkle-auth.marcusray.workers.dev/api/verify-membership'
    payload = {'discordId': discord_id}
    
    response = requests.post(url, json=payload)
    data = response.json()
    
    if data.get('verified'):
        print(f"✅ Verified! Member: {data['member']['discordUsername']}")
        print(f"Points: {data['member']['points']}")
        return True
    else:
        print(f"❌ {data.get('message')}")
        return False
```

### Node.js (axios)
```javascript
const axios = require('axios');

async function verifyMembership(discordId) {
  try {
    const response = await axios.post(
      'https://mycirkle-auth.marcusray.workers.dev/api/verify-membership',
      { discordId }
    );
    
    if (response.data.verified) {
      console.log('✅ Verified!', response.data.member);
      return response.data.member;
    } else {
      console.log('❌', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('Verification error:', error.message);
    return null;
  }
}
```

## Integration Flow for Your Blog

1. **User signs up/logs in via Discord OAuth** on your blog platform
2. **Store the Discord ID** from the OAuth response
3. **Call the verification endpoint** with the Discord ID
4. **Handle the response:**
   - ✅ **If verified:** Grant access to blog content
   - ❌ **If not verified:** Show message with link to sign up at my.cirkledevelopment.co.uk

## Example UI Flow

```
┌─────────────────────────────────────┐
│  Welcome to the Blog!               │
│                                     │
│  [Login with Discord] (Step 1)     │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  Verify MyCirkle Membership         │
│                                     │
│  [Verify Membership] (Step 2)      │
│                                     │
│  ⏳ Verifying... Please wait...     │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  ✅ Verified!                       │
│                                     │
│  You're a MyCirkle member!         │
│  Account: MC-12345                 │
│  Points: 150 💰                    │
│  Tier: Bronze 🥉                   │
│                                     │
│  [Access Blog] (Step 3)            │
└─────────────────────────────────────┘
```

## Security Notes

- ✅ **CORS enabled** - Can be called from any website
- ✅ **Rate limited** - Protected by SENTINEL Security (60 requests/minute per IP)
- ✅ **No authentication required** - Discord ID verification only
- ⚠️ **Public endpoint** - Anyone can verify if a Discord ID has membership
- 💡 **Tip:** Combine with Discord OAuth to ensure the requester owns the Discord account

## Tier System

The API returns the user's current tier based on their points:

| Tier | Points Required | Emoji |
|------|----------------|-------|
| Bronze | 0-749 | 🥉 |
| Silver | 750-999 | 🥈 |
| Gold | 1000-1999 | 🥇 |
| Diamond | 2000+ | 💎 |

## Data Storage

The API checks:
1. **Cloudflare Workers KV** (primary, fast)
2. **Google Sheets** (fallback, if KV not found)

Both data sources are automatically synchronized by the MyCirkle backend.

## Testing

See `MEMBERSHIP_VERIFICATION_EXAMPLE.html` for a complete working example with UI.

### Test Discord IDs
To test, you'll need actual Discord IDs of users who have signed up for MyCirkle. You can:
1. Sign up at https://my.cirkledevelopment.co.uk
2. Use your Discord ID from OAuth
3. Verify using the API

## Support

For issues or questions:
- Website: https://my.cirkledevelopment.co.uk
- Discord: Join the Cirkle Development server

## Changelog

### v1.0 (2026-01-01)
- Initial release
- Basic membership verification
- Returns member details (account number, points, tier)
- Integrated with existing MyCirkle backend
