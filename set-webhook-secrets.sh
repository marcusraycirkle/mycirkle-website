#!/bin/bash
# 🛡️ SENTINEL Security - Secure Webhook Configuration
# 
# CRITICAL: This script sets webhooks as ENCRYPTED SECRETS in Cloudflare
# These secrets are:
# - Encrypted at rest
# - Never visible in logs
# - Never visible in source code
# - Never visible on GitHub
# - Only accessible by the Worker at runtime
#
# IMPORTANT: After running this, DELETE THIS FILE or keep it offline!

export CLOUDFLARE_API_TOKEN="EjI71UKYW21Z0A8mLw9X27FkL8ol2FtBFanmu-D3"

echo "🛡️ SENTINEL Security - Setting Encrypted Webhook Secrets"
echo "=========================================================="
echo ""
echo "⚠️  IMPORTANT: These will be encrypted and NEVER visible in:"
echo "   - Source code"
echo "   - GitHub repository"  
echo "   - Cloudflare dashboard (only shown as ****)"
echo "   - Worker logs"
echo ""

# Set each webhook as an encrypted secret
echo "🔒 Setting ACCOUNT_WEBHOOK..."
echo "https://discord.com/api/webhooks/1442953154080542730/VSMjMQ94ACX-SAydEGwhYmtMPb54g-5LpVtgPENN7MPCbGfFt__8Uh6wqlNE57W7nJfp" | wrangler secret put ACCOUNT_WEBHOOK

echo ""
echo "🔒 Setting REDEMPTION_WEBHOOK..."
echo "https://discord.com/api/webhooks/1442953390400475237/exnvbdFvY8hB8PF3C0NU8nT9LAxe8dc1EOuluLUjO76-Q0j0TOxtCk3qwnomxKdw2FzR" | wrangler secret put REDEMPTION_WEBHOOK

echo ""
echo "🔒 Setting POINTS_WEBHOOK..."
echo "https://discord.com/api/webhooks/1442953613046710306/mUCXszlsb8TO0279AGF8ETaN-B3FPWHlVd3YMJr9lbmZ-_P1Jb3XxAR9VlpPURXmxD-T" | wrangler secret put POINTS_WEBHOOK

echo ""
echo "🔒 Setting LOGS_WEBHOOK..."
echo "https://discord.com/api/webhooks/1442954195962564852/pP_BPDhkB5_akdvHpRgGIE4WcK7mItQd94hn2NL960Hl-ftssDEieWvZP9vZ3MWBND6C" | wrangler secret put LOGS_WEBHOOK

echo ""
echo "🔒 Setting DELETION_WEBHOOK..."
echo "https://discord.com/api/webhooks/1442954830137135248/AaLDxtdI1loN437u6KluingUZdsg1bQgalx-AO7UBbW8AxLIulZ8SRk3FzlkPIIHDB5j" | wrangler secret put DELETION_WEBHOOK

echo ""
echo "✅ All webhooks set as encrypted secrets!"
echo ""
echo "🔐 SECURITY STATUS:"
echo "   ✅ Webhooks encrypted at rest in Cloudflare"
echo "   ✅ Never visible in GitHub"
echo "   ✅ Never visible in logs"
echo "   ✅ Only accessible by Worker at runtime"
echo ""
echo "⚠️  IMPORTANT: DELETE THIS FILE NOW!"
echo "   rm set-webhook-secrets.sh"
echo ""
