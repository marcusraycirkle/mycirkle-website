# 📧 Resend Email Setup Guide

## Step 1: Create Resend Account (FREE)

1. Go to https://resend.com
2. Click "Sign Up" - Use GitHub or email
3. Verify your email
4. **Free tier includes: 3,000 emails/month, 100 emails/day**

## Step 2: Get API Key

1. In Resend dashboard, go to **API Keys**
2. Click "Create API Key"
3. Name it: `MyCirkle Production`
4. Copy the API key (starts with `re_...`)

## Step 3: Verify Domain (Important!)

1. Go to **Domains** in Resend
2. Click "Add Domain"
3. Enter: `cirkledevelopment.co.uk`
4. Add the DNS records Resend provides to your domain registrar:
   - **TXT record** for domain verification
   - **MX record** for receiving emails
   - **SPF/DKIM records** for deliverability

### DNS Records Example:
```
Type: TXT
Name: _resend
Value: [provided by Resend]

Type: MX
Name: @
Value: [provided by Resend]
Priority: 10
```

5. Wait for verification (usually 5-30 minutes)

## Step 4: Add API Key to Cloudflare Worker

```bash
cd /workspaces/mycirkle-website
echo "YOUR_RESEND_API_KEY" | wrangler secret put RESEND_API_KEY
```

Replace `YOUR_RESEND_API_KEY` with the actual key from Step 2.

## Step 5: Add Admin Key (If Not Already Set)

```bash
echo "your-secure-admin-password" | wrangler secret put ADMIN_KEY
```

This protects the email dashboard from unauthorized access.

## Step 6: Deploy Worker

```bash
wrangler deploy
```

## Step 7: Test the System

### Test Welcome Email:
1. Sign up a new test account
2. Check if you receive the welcome email
3. Email should come from: `MyCirkle <mycirkle@cirkledevelopment.co.uk>`

### Test Marketing Emails:
1. Go to: https://my.cirkledevelopment.co.uk/admin/config/emails.html
2. Select "Test (Admin Only)" as recipients
3. Write a test subject and message
4. Click "Send Email"
5. Check your inbox!

## Email Types Configured

### 1. Marketing Emails (Manual)
- Sent from admin dashboard
- Supports templates and personalization
- Can target: All users, Active users, High-point users, New users

### 2. Welcome Email (Automatic)
- Sent when user signs up
- Includes account details and welcome bonus
- Personalized with user's name

### 3. Account Deletion Email (Automatic)
- Sent when user deletes account
- Confirms data removal
- Goodbye message

## Troubleshooting

### Emails not sending?
1. **Check domain verification** - Must be verified in Resend
2. **Check API key** - Run: `wrangler secret list` to see if RESEND_API_KEY exists
3. **Check Resend dashboard** - View logs at https://resend.com/logs
4. **Check daily limit** - Free tier: 100 emails/day

### Emails going to spam?
1. **Verify domain** - All DNS records must be added
2. **Warm up sending** - Start with small batches, gradually increase
3. **Check SPF/DKIM** - Use tools like mail-tester.com

### Admin dashboard not working?
1. **Check ADMIN_KEY** - Stored in Wrangler secrets
2. **Check Worker URL** - Should be: https://mycirkle-auth.marcusray.workers.dev
3. **Check browser console** - Look for error messages

## Email Templates Available

1. **New Rewards Announcement** - Notify users about new rewards
2. **Points Balance Reminder** - Remind users they have points to redeem
3. **Event Invitation** - Invite users to special events
4. **Platform Update** - Announce new features and improvements
5. **Custom Message** - Write your own message

## Personalization Tags

Use these in your emails:
- `{{firstName}}` - User's first name
- `{{points}}` - User's current point balance

Example:
```
Hi {{firstName}},

You have {{points}} points ready to redeem!
```

## Free Tier Limits

- **3,000 emails per month**
- **100 emails per day**
- **Unlimited domains**
- **Email templates**
- **Analytics and logs**

## Pricing (If You Need More)

- **$20/month**: 50,000 emails
- **$80/month**: 500,000 emails
- Pay as you go: $0.10 per 1,000 emails

## Support

- **Resend Docs**: https://resend.com/docs
- **Resend Discord**: https://discord.gg/resend
- **Email API Status**: https://status.resend.com

## Security Notes

- ✅ API key stored securely in Wrangler secrets (not in code)
- ✅ Admin dashboard protected by ADMIN_KEY
- ✅ CORS enabled for frontend access
- ✅ Rate limiting via Resend (100/day free tier)

## Next Steps

1. Verify your domain in Resend
2. Add API keys to Wrangler
3. Deploy the worker
4. Test with a signup
5. Try sending a marketing email from admin dashboard

🎉 You're all set! Your users will now receive beautiful branded emails from MyCirkle!
