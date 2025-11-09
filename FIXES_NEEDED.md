# Comprehensive Fixes Needed

## 🔑 Admin Credentials

### Bot Config Admin Password:
**Password**: `mycirkle2025`
(Can be changed via Cloudflare Worker secret: `ADMIN_PASSWORD`)

### Email Dashboard Admin Key:
**Status**: NOT SET - You need to set this in Cloudflare
**How to set**:
```bash
wrangler secret put ADMIN_KEY
# Then enter your desired admin key (e.g., "mycirkle_admin_2025")
```

---

## ✅ Issues to Fix

### 1. Welcome Email on Marketing Opt-in
**Problem**: Users who tick "marketing updates" don't get welcome email
**Fix**: Worker already sends welcome DM via Discord, need to add Resend email

### 2. Verification Codes Don't Work
**Problem**: 6-digit codes are sent but clicking "Verify" does nothing
**Locations affected**:
- Account deletion
- Signup completion (NEEDS TO BE ADDED)
**Fix**: Need to implement verification logic in frontend

### 3. No Verification Before Signup
**Problem**: Account created immediately without verification
**Fix**: Add verification step before calling /api/signup

### 4. Login Goes Straight to Dashboard
**Problem**: No "Log In!" popup for returning users
**User expectation**: Show welcome back message before dashboard
**Fix**: Re-add welcome-popup for existing users (currently skipped)

### 5. FAQ/Loyalty Card/Settings Not Updating
**Problem**: Despite being in code, changes not visible
**Likely cause**: Service worker or aggressive browser caching
**Fix**: Add service worker unregister + meta tags

---

## 📋 Implementation Plan

### Priority 1: Verification System
1. Generate 6-digit code
2. Store in KV with expiration
3. Send via Discord DM
4. Validate on submit
5. Only proceed if valid

### Priority 2: Email Integration
1. Check acceptedMarketing flag
2. Send welcome email via Resend if true
3. Use existing /api/email/welcome endpoint

### Priority 3: Login Flow
1. Existing users → show welcome-popup first
2. Then redirect to dashboard after "Go to Dashboard" click

### Priority 4: Cache Busting
1. Add service worker unregister
2. Add cache-control meta tags
3. Maybe add build hash to files
