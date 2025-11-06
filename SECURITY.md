# Security Documentation

## Overview
All sensitive credentials have been removed from the codebase and must be configured as environment variables/secrets before deployment.

## Security Measures Implemented

### 1. **No Hardcoded Credentials**
- All API keys, tokens, and secrets are loaded from environment variables
- Worker will return proper error messages if credentials are not configured
- No fallback values in production code

### 2. **Environment Variables Required**

The following environment variables MUST be configured before deployment:

| Variable | Description | Type |
|----------|-------------|------|
| `DISCORD_CLIENT_ID` | Discord OAuth Client ID | Secret |
| `DISCORD_CLIENT_SECRET` | Discord OAuth Client Secret | Secret |
| `DISCORD_BOT_TOKEN` | Discord Bot Token | Secret |
| `DISCORD_GUILD_ID` | Discord Server/Guild ID | Secret |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API Key | Secret |
| `SPREADSHEET_ID` | Google Spreadsheet ID | Secret |

### 3. **Configuration Methods**

#### For Cloudflare Workers:
```bash
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_GUILD_ID
wrangler secret put GOOGLE_SHEETS_API_KEY
wrangler secret put SPREADSHEET_ID
```

#### For Local Development:
Create a `.env` file (use `.env.example` as template):
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

**NEVER commit the `.env` file to version control!**

### 4. **Files to Keep Secure**

The following files contain sensitive information and should NEVER be committed:
- `.env` - Local environment variables
- `*.key` - Private keys
- `*.pem` - Certificate files
- `secrets.json` - Any secrets file
- `credentials.json` - Credential files

These are already listed in `.gitignore`.

### 5. **Error Handling**

The worker includes proper error handling for missing credentials:
- Returns `500` status with descriptive error message
- Does NOT expose actual credential values in error messages
- Helps identify configuration issues without compromising security

### 6. **Best Practices**

✅ **DO:**
- Store credentials in Cloudflare Secrets (production)
- Use `.env` files for local development (never commit)
- Rotate credentials regularly
- Use different credentials for development/production
- Monitor Discord Developer Portal for unauthorized usage
- Keep backup of credentials in a secure password manager

❌ **DON'T:**
- Commit credentials to Git
- Share credentials in chat/email
- Use production credentials in development
- Hardcode any secrets in source files
- Leave old credentials active after rotation

### 7. **Credential Rotation**

If you need to rotate credentials:

1. Generate new credentials in respective platforms (Discord/Google)
2. Update Cloudflare secrets:
   ```bash
   wrangler secret put CREDENTIAL_NAME
   ```
3. Test thoroughly before revoking old credentials
4. Revoke old credentials only after confirming new ones work
5. Update any documentation that references old credential IDs (not secrets)

### 8. **Access Control**

**Discord Credentials:**
- Only authorized team members should have access to Discord Developer Portal
- Bot token should be regenerated if compromised
- Monitor bot usage in Discord Server Settings → Integrations

**Google Sheets:**
- API key should be restricted to specific APIs (Sheets API only)
- Consider using service account credentials for better security
- Regularly review API key usage in Google Cloud Console

**Cloudflare:**
- Use Cloudflare Access for worker management
- Enable 2FA on Cloudflare account
- Audit worker logs regularly

### 9. **Incident Response**

If credentials are compromised:

1. **Immediate Actions:**
   - Revoke/regenerate the compromised credentials immediately
   - Check logs for unauthorized access
   - Update worker with new credentials
   - Notify team members

2. **Investigation:**
   - Determine how credentials were exposed
   - Check if any data was accessed/modified
   - Review recent changes to codebase

3. **Prevention:**
   - Update security practices
   - Improve access controls
   - Consider additional monitoring

### 10. **Monitoring**

Regular security checks:
- [ ] Review Cloudflare Worker logs weekly
- [ ] Check Discord bot activity monthly
- [ ] Audit Google Sheets API usage monthly
- [ ] Verify no credentials in Git history
- [ ] Test error handling for missing credentials
- [ ] Confirm `.gitignore` is protecting sensitive files

## Verification Checklist

Before deployment, verify:
- [ ] No hardcoded credentials in `cloudflare/worker.js`
- [ ] All secrets configured in Cloudflare
- [ ] `.env` file not committed (check with `git status`)
- [ ] `.gitignore` includes sensitive file patterns
- [ ] Worker returns proper errors when credentials missing
- [ ] DEPLOYMENT.md warning about credential security
- [ ] Team members understand security practices

## Resources

- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Discord Security Best Practices](https://discord.com/developers/docs/topics/oauth2#security-and-authorization)
- [Google Cloud Security](https://cloud.google.com/security/best-practices)

## Contact

For security concerns or questions, contact the project maintainer.

---
**Last Updated:** November 6, 2025
**Security Level:** Production-Ready ✅
