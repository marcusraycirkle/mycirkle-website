# 🐧 Self-Hosting MyCirkle Bot on Linux (Lubuntu 18.04)

This guide will help you run the MyCirkle Discord bot on your Linux laptop as a systemd service that starts automatically on boot.

## 📋 Prerequisites

1. Linux machine (Lubuntu 18.04 or newer)
2. Node.js v16 or higher installed
3. Git installed
4. Your Discord Bot Token

## 🚀 Installation Steps

### Step 1: Install Node.js (if not already installed)

```bash
# For Ubuntu 18.04/Lubuntu 18.04, install Node.js 16+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v16 or higher
npm --version
```

### Step 2: Clone the Repository

```bash
# Clone to your home directory
cd ~
git clone https://github.com/marcusraycirkle/mycirkle-website.git mycirkle-bot
cd mycirkle-bot
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure the Bot

Edit the systemd service file with your details:

```bash
# Open the service file
nano mycirkle-bot.service
```

Replace these placeholders:
- `YOUR_USERNAME` → Your Linux username (e.g., `marcus`)
- `YOUR_BOT_TOKEN_HERE` → Your Discord bot token from Discord Developer Portal

Save and exit (Ctrl+X, then Y, then Enter)

### Step 5: Install the Service

```bash
# Copy the service file to systemd
sudo cp mycirkle-bot.service /etc/systemd/system/

# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable mycirkle-bot

# Start the service now
sudo systemctl start mycirkle-bot
```

### Step 6: Verify It's Running

```bash
# Check service status
sudo systemctl status mycirkle-bot

# View live logs
sudo journalctl -u mycirkle-bot -f

# You should see:
# ✅ Connected to Discord Gateway
# 🟢 Bot is now ONLINE
```

## 🔧 Service Management Commands

```bash
# Start the bot
sudo systemctl start mycirkle-bot

# Stop the bot
sudo systemctl stop mycirkle-bot

# Restart the bot
sudo systemctl restart mycirkle-bot

# View status
sudo systemctl status mycirkle-bot

# View logs (last 50 lines)
sudo journalctl -u mycirkle-bot -n 50

# Follow logs in real-time
sudo journalctl -u mycirkle-bot -f

# Disable auto-start on boot
sudo systemctl disable mycirkle-bot

# Enable auto-start on boot
sudo systemctl enable mycirkle-bot
```

## 🔄 Updating the Bot

When you need to update the bot code:

```bash
cd ~/mycirkle-bot
git pull
npm install
sudo systemctl restart mycirkle-bot
```

## 🛠️ Troubleshooting

### Bot won't start
```bash
# Check logs for errors
sudo journalctl -u mycirkle-bot -n 100

# Verify Node.js is installed
node --version

# Check if BOT_TOKEN is set correctly in service file
sudo nano /etc/systemd/system/mycirkle-bot.service
```

### Permission issues
```bash
# Make sure your username owns the bot directory
sudo chown -R $USER:$USER ~/mycirkle-bot
```

### Bot disconnects frequently
```bash
# Check your internet connection
# The bot will auto-reconnect, but frequent disconnects may indicate network issues
```

## 📝 Environment Variables

The bot uses these environment variables (set in the service file):

- `BOT_TOKEN` (Required) - Your Discord bot token
- `CONFIG_URL` (Optional) - Config endpoint URL
- `WORKER_API_URL` (Optional) - Worker API URL  
- `NODE_ENV` (Optional) - Set to `production` for production use

## 🔒 Security Notes

1. **Keep your BOT_TOKEN secure!** Never share it or commit it to git
2. Only the root user and you can read the service file with the token:
   ```bash
   sudo chmod 600 /etc/systemd/system/mycirkle-bot.service
   ```
3. The bot will run with your user permissions (not root)

## ⚡ Performance

The bot uses minimal resources:
- **RAM**: ~50-100 MB
- **CPU**: <1% most of the time
- **Network**: Very low, just maintains WebSocket connection

Your Lubuntu laptop should handle it easily, even in the background!

## 🎯 Next Steps

After the bot is running:
1. Check your Discord server - the bot should appear online
2. Test slash commands (if configured)
3. Monitor logs for any issues
4. Keep your laptop running and connected to the internet

## 📞 Support

If you encounter issues, check:
1. Service logs: `sudo journalctl -u mycirkle-bot -n 100`
2. Discord Developer Portal for bot status
3. Your internet connection

---

**Congratulations!** 🎉 Your bot is now self-hosted on Linux!
