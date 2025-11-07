# MyCirkle Discord Bot Commands

## Overview
This document outlines all Discord bot commands for managing the MyCirkle Loyalty Program.

---

## 📊 Points Management Commands

### `/givepoints`
Award points to a user

**Parameters:**
- `points` (number, required): Amount of points to give
- `user` (user mention, required): The Discord user to receive points
- `reason` (string, required): Reason for awarding points

**Example:**
```
/givepoints points:100 user:@AlmightyShow reason:Purchase completion
```

**Bot Response:**
- Updates user's point balance in database
- Sends confirmation message to channel
- Logs transaction

---

### `/deductpoints`
Remove points from a user

**Parameters:**
- `points` (number, required): Amount of points to deduct
- `user` (user mention, required): The Discord user to deduct from
- `reason` (string, required): Reason for deduction

**Example:**
```
/deductpoints points:500 user:@AlmightyShow reason:Reward redemption - 10% discount
```

**Bot Response:**
- Updates user's point balance in database
- Sends confirmation message
- Logs deduction

---

## 🎁 Reward Processing Commands

### `/process`
Process a reward redemption

**Parameters:**
- `reward` (choice, required): Type of reward being processed
  - `20% off product` (500 pts)
  - `40% off commission` (750 pts)
  - `Free Product` (2000 pts)
- `user` (user mention, required): The user redeeming the reward
- `coupon` (attachment, optional): Upload coupon image (required for discount rewards)

**Permanent Rewards:**
- **20% off product of choice** = 500 points
- **40% off commission** = 750 points
- **Free Product** = 2000 points

**Example:**
```
/process reward:"20% off product" user:@AlmightyShow coupon:[upload image]
```

**Bot Response:**
- Deducts required points from user
- Sends reward confirmation embed
- Uploads coupon to user's DMs (if applicable)
- Logs redemption

---

### `/dailyreward`
Set or update the daily reward

**Parameters:**
- `reward` (string, required): Description of the daily reward
- `points` (number, required): Point cost (use 0 for free daily rewards)

**Example:**
```
/dailyreward reward:"Free Shipping Voucher" points:0
```

**Bot Response:**
- Updates daily reward in database
- Announces new daily reward in rewards channel
- Notifies all users with marketing consent

---

## 📦 Product Management Commands

### `/productadd`
Add a product purchase to a user's account

**Parameters:**
- `product` (string, required): Product name
- `user` (user mention, required): The user who made the purchase
- `date` (string, required): Date of purchase (format: YYYY-MM-DD)
- `price` (number, required): Price paid in USD

**Example:**
```
/productadd product:"Premium Script Package" user:@AlmightyShow date:2025-11-07 price:29.99
```

**Bot Response:**
1. **Sends webhook to registration channel:**
   - Embed with purchase details
   - User mention
   - Product information
   - Purchase date and price
   
2. **Webhook Format:**
```json
{
  "embeds": [{
    "title": "✨ New Product Purchase",
    "color": 5814783,
    "fields": [
      { "name": "Product", "value": "Premium Script Package", "inline": false },
      { "name": "Customer", "value": "@AlmightyShow", "inline": true },
      { "name": "Date of Purchase", "value": "2025-11-07", "inline": true },
      { "name": "Price", "value": "$29.99", "inline": true },
      { "name": "Discord Account", "value": "<@123456789>", "inline": true }
    ],
    "thumbnail": { "url": "https://your-product-image-url.com/image.png" },
    "footer": { "text": "MyCirkle Loyalty Bot • Product Registry" },
    "timestamp": "2025-11-07T15:30:00.000Z"
  }]
}
```

3. **Updates user's product list in database**
4. **Awards purchase points (configurable, e.g., 1 point per $1 spent)**

---

## 🔧 Bot Setup Requirements

### Environment Variables
```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_server_id

# Webhooks
SIGNUP_WEBHOOK_URL=https://discord.com/api/webhooks/...
WELCOME_DM_WEBHOOK_URL=https://discord.com/api/webhooks/...
PRODUCT_WEBHOOK_URL=https://discord.com/api/webhooks/...

# ParcelRoblox
PARCELROBLOX_API_KEY=your_parcel_api_key
PARCEL_PRODUCT_ID=prod_BwM387gLYcCa8qhERIH1JliOQ

# Database
SPREADSHEET_ID=your_google_sheet_id
GOOGLE_SHEETS_API_KEY=your_sheets_api_key
```

### Required Permissions
- Send Messages
- Embed Links
- Attach Files
- Use Slash Commands
- Read Message History
- Manage Messages (for cleanup)

### Webhook Channels
1. **Signup Webhook** - New user registrations
2. **Welcome DM Webhook** - Send welcome messages to new users
3. **Product Webhook** - Product purchase notifications

---

## 📝 Example Workflows

### New User Signup
1. User clicks "Continue with Discord" on website
2. OAuth flow completes
3. User fills out signup form
4. Bot sends webhook to signup channel (see screenshot reference)
5. Bot sends welcome DM to user with credentials

### Reward Redemption
1. User clicks "Redeem" in dashboard
2. User scratches virtual card to reveal code
3. User opens ticket in Discord
4. Staff runs `/process` command
5. Points deducted, reward delivered

### Product Purchase
1. Customer completes purchase
2. Staff runs `/productadd` command
3. Webhook sent to product channel
4. User's product list updated
5. Purchase points awarded automatically

---

## 🎨 Embed Colors
- Signup: `#5865F2` (Discord Blurple)
- Welcome: `#00D9FF` (Cyan)
- Product: `#57F287` (Green)
- Points: `#FEE75C` (Yellow)
- Rewards: `#EB459E` (Pink)
- Error: `#ED4245` (Red)

---

## 📸 Webhook Example (from screenshot)
```
Title: New User Registration
Fields:
  - Username: almightyshow711
  - Email: peeleylo...@gmail.com
  - Account Type: Consumer
  - Account Number: 0000000003174562f1729961
  - Discord Account: @Ethan - AlmightyShow
  - Registered At: 4/25/2025, 10:55:29 PM
Footer: MyCirkle Loyalty Bot • Yesterday at 23:55
```
