#!/bin/bash
echo "🧪 COMPREHENSIVE WEBHOOK TEST SUITE"
echo "===================================="
echo ""

API="https://mycirkle-auth.marcusray.workers.dev"

# Test 1: Account Signup (should trigger ACCOUNT_WEBHOOK for role assignment)
echo "1️⃣ TEST: Account Signup & Role Assignment"
echo "   Expected: ACCOUNT_WEBHOOK (role assignment channel)"
curl -s -X POST "$API/api/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST_USER_001",
    "username": "TestUser001",
    "discriminator": "0001",
    "email": "test001@webhook.test",
    "firstName": "Test",
    "lastName": "User",
    "acceptedTerms": true,
    "acceptedMarketing": false
  }' | jq -r 'if .success then "✅ SUCCESS: " + .message else "⚠️  " + (.error // .message) end'
echo ""
sleep 2

# Test 2: Marketing Signup (should trigger LOGS_WEBHOOK for marketing)
echo "2️⃣ TEST: Marketing Signup"
echo "   Expected: LOGS_WEBHOOK (marketing logs channel)"
curl -s -X POST "$API/api/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST_USER_002",
    "username": "TestUser002",
    "discriminator": "0002",
    "email": "test002@webhook.test",
    "firstName": "Marketing",
    "lastName": "Test",
    "acceptedTerms": true,
    "acceptedMarketing": true
  }' | jq -r 'if .success then "✅ SUCCESS: " + .message else "⚠️  " + (.error // .message) end'
echo ""
sleep 2

# Test 3: Activity Reward (should trigger POINTS_WEBHOOK)
echo "3️⃣ TEST: Activity Points Award"
echo "   Expected: POINTS_WEBHOOK (points logs channel)"
curl -s -X POST "$API/api/activity-reward" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "TEST_USER_001",
    "username": "TestUser001",
    "discriminator": "0001",
    "points": 2,
    "reason": "Test Activity Reward",
    "newBalance": 7
  }' | jq -r 'if .success then "✅ SUCCESS: Points awarded" else "⚠️  " + (.error // .message // "Check response") end'
echo ""
sleep 2

# Test 4: Redemption (should trigger REDEMPTION_WEBHOOK)
echo "4️⃣ TEST: Reward Redemption"
echo "   Expected: REDEMPTION_WEBHOOK (redemptions channel)"
curl -s -X POST "$API/api/redeem" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST_USER_001",
    "reward": "Test Reward Item",
    "cost": 5
  }' | jq -r 'if .success then "✅ SUCCESS: Redemption processed" else "⚠️  " + (.error // .message // "Expected - test user may not have enough points") end'
echo ""
sleep 2

# Test 5: Account Deletion (should trigger DELETION_WEBHOOK)
echo "5️⃣ TEST: Account Deletion"
echo "   Expected: DELETION_WEBHOOK (deletion logs channel)"
curl -s -X DELETE "$API/api/delete-account" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "TEST_USER_002"
  }' | jq -r 'if .success then "✅ SUCCESS: Account deleted" else "⚠️  " + (.error // .message // "Check response") end'
echo ""
sleep 2

# Test 6: Leaderboard (should trigger LOGS_WEBHOOK)
echo "6️⃣ TEST: Leaderboard Access"
echo "   Expected: LOGS_WEBHOOK (general logs channel)"
curl -s "$API/api/leaderboard?limit=3" | jq -r 'if .leaderboard then "✅ SUCCESS: Leaderboard loaded (" + (.leaderboard | length | tostring) + " entries)" else "⚠️  Failed to load leaderboard" end'
echo ""

echo "===================================="
echo "✅ ALL TESTS COMPLETED"
echo ""
echo "📋 CHECK YOUR DISCORD CHANNELS:"
echo ""
echo "Channel 1️⃣ - ACCOUNT_WEBHOOK (Role Assignments):"
echo "   Should see: Role assignment notifications"
echo ""
echo "Channel 2️⃣ - DELETION_WEBHOOK (Account Deletions):"
echo "   Should see: Account deletion notification for TestUser002"
echo ""
echo "Channel 3️⃣ - POINTS_WEBHOOK (Points Activity):"
echo "   Should see: +2 points activity reward for TestUser001"
echo ""
echo "Channel 4️⃣ - REDEMPTION_WEBHOOK (Redemptions):"
echo "   Should see: Redemption attempt (may fail if insufficient points)"
echo ""
echo "Channel 5️⃣ - LOGS_WEBHOOK (Marketing & General Logs):"
echo "   Should see: Marketing signup for TestUser002, Leaderboard access"
echo ""
echo "Channel 6️⃣ - WELCOME_WEBHOOK (Public Welcomes):"
echo "   Should see: Welcome messages for TestUser001 and TestUser002"
echo ""
echo "⚠️  NOTE: Some tests may show expected failures (role assignment for test users)"
echo "    This is normal - the webhooks are still being sent!"
echo ""
