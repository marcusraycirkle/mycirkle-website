#!/bin/bash
# Automated installation script for MyCirkle Bot on Linux

set -e  # Exit on any error

echo "🐧 MyCirkle Discord Bot - Linux Installation"
echo "============================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo "❌ Please don't run this script as root (without sudo)"
    echo "Run it as your regular user: ./install-on-linux.sh"
    exit 1
fi

# Get the current username
CURRENT_USER=$USER
CURRENT_DIR=$(pwd)

echo "📋 Installation Details:"
echo "  User: $CURRENT_USER"
echo "  Directory: $CURRENT_DIR"
echo ""

# Check for Node.js
echo "🔍 Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo ""
    echo "Please install Node.js first:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js $NODE_VERSION found"
echo ""

# Check Node version (must be v16+)
NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 16 ]; then
    echo "❌ Node.js version must be 16 or higher"
    echo "Current version: $NODE_VERSION"
    echo "Please upgrade Node.js"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Ask for Discord Bot Token
echo "🔑 Discord Bot Token Setup"
echo "Please enter your Discord Bot Token:"
read -s BOT_TOKEN
echo ""

if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Bot token cannot be empty"
    exit 1
fi

# Create systemd service file with actual values
echo "⚙️  Creating systemd service file..."
cat > mycirkle-bot.service << EOF
[Unit]
Description=MyCirkle Discord Bot
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
Environment="BOT_TOKEN=$BOT_TOKEN"
Environment="CONFIG_URL=https://mycirkle-auth.marcusray.workers.dev/api/bot-config"
Environment="WORKER_API_URL=https://mycirkle-auth.marcusray.workers.dev"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node $CURRENT_DIR/bot.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=mycirkle-bot

[Install]
WantedBy=multi-user.target
EOF

# Install the service
echo "🔧 Installing service (requires sudo)..."
sudo cp mycirkle-bot.service /etc/systemd/system/
sudo chmod 600 /etc/systemd/system/mycirkle-bot.service
sudo systemctl daemon-reload
sudo systemctl enable mycirkle-bot
echo ""

# Start the service
echo "🚀 Starting the bot..."
sudo systemctl start mycirkle-bot
sleep 2
echo ""

# Check status
echo "📊 Service Status:"
sudo systemctl status mycirkle-bot --no-pager -l
echo ""

echo "✅ Installation Complete!"
echo ""
echo "📋 Useful Commands:"
echo "  View logs:        sudo journalctl -u mycirkle-bot -f"
echo "  Stop bot:         sudo systemctl stop mycirkle-bot"
echo "  Start bot:        sudo systemctl start mycirkle-bot"
echo "  Restart bot:      sudo systemctl restart mycirkle-bot"
echo "  Service status:   sudo systemctl status mycirkle-bot"
echo ""
echo "🔐 Security Note:"
echo "Your bot token is stored in /etc/systemd/system/mycirkle-bot.service"
echo "Only root and you can read this file."
echo ""
echo "🎉 Your bot should now be online in Discord!"
echo "Check the logs to verify: sudo journalctl -u mycirkle-bot -f"
