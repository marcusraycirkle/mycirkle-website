#!/bin/bash
# Test all webhooks to ensure they're working

API_URL="https://mycirkle-auth.marcusray.workers.dev"

echo "🧪 WEBHOOK TESTING SUITE"
echo "========================"
echo ""

# Test 1: Account Creation Webhook (ACCOUNT_WEBHOOK)
echo "1️⃣ Testing ACCOUNT_WEBHOOK (Signup)..."
curl -s -X POST "$API_URL/api/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST123456789",
    "username": "WebhookTestUser",
    "discriminator": "0001",
    "email": "test@webhook.test",
    "firstName": "Test",
    "lastName": "Webhook",
    "acceptedTerms": true,
    "acceptedMarketing": true,
    "referralCode": ""
  }' | jq -r '.success, .message' || echo "❌ Signup test failed"
echo ""
sleep 2

# Test 2: Points Activity Webhook (POINTS_WEBHOOK)
echo "2️⃣ Testing POINTS_WEBHOOK (Activity Reward)..."
curl -s -X POST "$API_URL/api/activity-reward" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "TEST123456789",
    "username": "WebhookTestUser",
    "discriminator": "0001",
    "points": 2,
    "reason": "Activity Reward Test",
    "newBalance": 7
  }' | jq -r '.success, .message' || echo "Status check"
echo ""
sleep 2

# Test 3: Redemption Webhook (REDEMPTION_WEBHOOK)
echo "3️⃣ Testing REDEMPTION_WEBHOOK (Reward Redemption)..."
curl -s -X POST "$API_URL/api/redeem" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST123456789",
    "reward": "Test Reward",
    "cost": 5
  }' | jq -r '.success, .message' || echo "Status check"
echo ""
sleep 2

# Test 4: Account Deletion Webhook (DELETION_WEBHOOK)
echo "4️⃣ Testing DELETION_WEBHOOK (Account Deletion)..."
curl -s -X POST "$API_URL/api/delete-account" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST123456789"
  }' | jq -r '.success, .message' || echo "Status check"
echo ""
sleep 2

# Test 5: Logs Webhook via Leaderboard (LOGS_WEBHOOK)
echo "5️⃣ Testing LOGS_WEBHOOK (Leaderboard)..."
curl -s -X GET "$API_URL/api/leaderboard?limit=5" | jq -r 'if .leaderboard then "✅ Leaderboard fetched" else "❌ Failed" end' || echo "Status check"
echo ""

echo "========================"
echo "�� TESTING COMPLETE"
echo ""
echo "📋 CHECK YOUR DISCORD WEBHOOKS:"
echo "   1. Account webhook channel - should see signup message"
echo "   2. Points webhook channel - should see activity reward"
echo "   3. Redemption webhook channel - should see redemption"
echo "   4. Deletion webhook channel - should see deletion notice"
echo "   5. Logs webhook channel - should see leaderboard activity"
echo ""
echo "⚠️  Note: Test data was created, you may want to clean it up"
