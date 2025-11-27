#!/bin/bash

# Verify Webhook Configuration & Delivery
# Tests each webhook endpoint and shows actual webhook URLs being used

echo "🔍 WEBHOOK VERIFICATION TEST"
echo "============================"
echo ""

WORKER_URL="https://mycirkle-auth.marcusray.workers.dev"

# Check if wrangler secrets are set
echo "📋 Step 1: Checking Cloudflare Secrets"
echo "--------------------------------------"
wrangler secret list | grep -i webhook
echo ""

# Test redemption webhook (should trigger REDEMPTION_WEBHOOK)
echo "🎁 Step 2: Testing Redemption Flow"
echo "-----------------------------------"
echo "Sending redemption request..."
REDEEM_RESPONSE=$(curl -s -X POST "${WORKER_URL}/api/redeem" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "1088907566844739624",
    "rewardType": "Test Reward - Webhook Verification",
    "pointsCost": 10
  }')
echo "Response: $REDEEM_RESPONSE"
echo ""

# Test points update (should trigger POINTS_WEBHOOK)
echo "💰 Step 3: Testing Points Activity"
echo "-----------------------------------"
echo "Awarding points..."
POINTS_RESPONSE=$(curl -s -X POST "${WORKER_URL}/api/admin/give-points" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUserId": "1088907566844739624",
    "points": 50,
    "reason": "Webhook Verification Test"
  }')
echo "Response: $POINTS_RESPONSE"
echo ""

# Test account deletion (should trigger DELETION_WEBHOOK)  
echo "🗑️  Step 4: Testing Deletion Webhook"
echo "------------------------------------"
echo "Attempting deletion..."
DELETE_RESPONSE=$(curl -s -X POST "${WORKER_URL}/api/delete-account" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "1088907566844739624",
    "verificationCode": "TEST123"
  }')
echo "Response: $DELETE_RESPONSE"
echo ""

# Test leaderboard access (should trigger LOGS_WEBHOOK)
echo "📊 Step 5: Testing Logs Webhook"
echo "--------------------------------"
LOGS_RESPONSE=$(curl -s "${WORKER_URL}/api/leaderboard?limit=5")
echo "Response status: $(echo $LOGS_RESPONSE | jq -r '.success // "unknown"')"
echo ""

echo "============================"
echo "✅ VERIFICATION COMPLETE"
echo ""
echo "📌 CHECK YOUR DISCORD CHANNELS:"
echo ""
echo "Channel 1 - REDEMPTION (1442953390400475237):"
echo "   Should see: Test Reward redemption attempt"
echo ""
echo "Channel 2 - POINTS (1442953613046710306):"
echo "   Should see: +50 points awarded"
echo ""
echo "Channel 3 - DELETION (1442954830137135248):"
echo "   Should see: Account deletion attempt"
echo ""
echo "Channel 4 - LOGS (1442954195962564852):"
echo "   Should see: Leaderboard access"
echo ""
echo "Channel 5 - ACCOUNT (1442953154080542730):"
echo "   Should see: Nothing (no signup in this test)"
echo ""
echo "Channel 6 - WELCOME (1443714236315598908):"
echo "   Should see: Nothing (no signup in this test)"
echo ""
echo "⚠️  If webhooks are missing, check:"
echo "   1. wrangler secret list - are all 6 secrets set?"
echo "   2. Discord webhook URLs - are they still valid?"
echo "   3. Worker logs - any webhook errors?"
echo "   4. Discord server - were webhooks deleted/regenerated?"
