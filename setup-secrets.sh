#!/bin/bash
# setup-secrets.sh - Configure Cloudflare Worker Secrets
# Run this script to set all required secrets for the worker

set -e

echo "🔐 MyCirkle Worker Secret Configuration"
echo "========================================"
echo ""
echo "This script will guide you through setting up all required secrets."
echo "You will be prompted to enter each value."
echo ""
echo "⚠️  Make sure you have the credentials ready!"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler is not installed"
    echo "Install it with: npm install -g wrangler"
    exit 1
fi

# Check if logged in
if ! wrangler whoami &> /dev/null; then
    echo "🔑 Please log in to Cloudflare first..."
    wrangler login
fi

echo "Setting up secrets for worker..."
echo ""

# Set each secret
echo "1/6: Discord Client ID"
wrangler secret put DISCORD_CLIENT_ID

echo ""
echo "2/6: Discord Client Secret"
wrangler secret put DISCORD_CLIENT_SECRET

echo ""
echo "3/6: Discord Bot Token"
wrangler secret put DISCORD_BOT_TOKEN

echo ""
echo "4/6: Discord Guild ID"
wrangler secret put DISCORD_GUILD_ID

echo ""
echo "5/6: Google Sheets API Key"
wrangler secret put GOOGLE_SHEETS_API_KEY

echo ""
echo "6/6: Google Spreadsheet ID"
wrangler secret put SPREADSHEET_ID

echo ""
echo "✅ All secrets configured successfully!"
echo ""
echo "Next steps:"
echo "1. Deploy the worker: wrangler deploy cloudflare/worker.js"
echo "2. Update script.js with your worker URL"
echo "3. Test the deployment"
echo ""
