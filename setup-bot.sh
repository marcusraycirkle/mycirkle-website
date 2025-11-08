#!/bin/bash
# Setup Discord bot slash commands

echo "🤖 MyCirkle Discord Bot Setup"
echo "=============================="
echo ""

# Check if BOT_TOKEN is provided
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Error: BOT_TOKEN environment variable is required"
    echo ""
    echo "Usage:"
    echo "  BOT_TOKEN=your_bot_token ./setup-bot.sh"
    echo ""
    echo "Or export it first:"
    echo "  export BOT_TOKEN=your_bot_token"
    echo "  ./setup-bot.sh"
    exit 1
fi

echo "Step 1: Registering slash commands..."
BOT_TOKEN="$BOT_TOKEN" APPLICATION_ID="1426682720544624720" node register-commands.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Slash commands registered successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Go to: https://discord.com/developers/applications/1426682720544624720/information"
    echo "2. Set Interactions Endpoint URL to: https://mycirkle-auth.marcusray.workers.dev/interactions"
    echo "3. Enable Message Content Intent in Bot settings"
    echo "4. Test commands in your Discord server by typing /"
    echo ""
    echo "✨ All done! Your bot is ready to use."
else
    echo ""
    echo "❌ Failed to register commands. Check your BOT_TOKEN."
    exit 1
fi
