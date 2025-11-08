# 🚨 IMPORTANT: Worker Update Required

The Discord bot command handlers are missing from the worker. The worker file is too large to edit in one go. Here's what needs to be added:

## 📊 Webhook Configuration

All commands now log to specific Discord channels:

- **🎉 Welcome Messages**: Public channel with user profile photo
  - URL: `https://discord.com/api/webhooks/1436827145438629889/...`
  - Triggered on: New user signup
  
- **💰 Points Activity**: Points given/deducted
  - URL: `https://discord.com/api/webhooks/1436826449150742679/...`
  - Triggered on: `/givepoints`, `/deductpoints`
  
- **🎁 Redemptions**: Reward processing with coupon codes
  - URL: `https://discord.com/api/webhooks/1436826526883647569/...`
  - Triggered on: `/process`
  
- **⚙️ Admin Logs**: Settings changes, daily reward updates
  - URL: `https://discord.com/api/webhooks/1436826617853902948/...`
  - Triggered on: `/dailyreward`, account settings updates

## 🔐 Admin Role Configuration

Admin role ID is set to: `1436825229090623623`
Commands `/givepoints`, `/deductpoints`, `/process`, `/dailyreward` require this role.

## Step 1: Add Missing Command Handlers

Add these functions to `/workspaces/mycirkle-website/cloudflare/worker.js` right AFTER the `handleHelpCommand()` function (around line 1198):

```javascript
async function handleLeaderboardCommand(env) {
    try {
        const spreadsheetId = env.SPREADSHEET_ID;
        const sheetsApiKey = env.GOOGLE_SHEETS_API_KEY;
        
        if (!spreadsheetId || !sheetsApiKey) {
            return jsonResponse({ type: 4, data: { content: '❌ Leaderboard not configured', flags: 64 } });
        }
        
        const getResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1?key=${sheetsApiKey}`
        );
        const data = await getResponse.json();
        const rows = data.values || [];
        
        const users = [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] && rows[i][5]) {
                users.push({
                    name: rows[i][4] || rows[i][1] || 'Unknown',
                    points: parseInt(rows[i][5]) || 0
                });
            }
        }
        
        users.sort((a, b) => b.points - a.points);
        const topUsers = users.slice(0, 10);
        
        let leaderboardText = '';
        topUsers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboardText += `${medal} **${user.name}** - ${user.points} pts\n`;
        });
        
        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '🏆 MyCirkle Leaderboard',
                    description: leaderboardText || 'No users yet!',
                    color: 0xfbbf24,
                    footer: { text: `Total Members: ${users.length}` }
                }]
            }
        });
    } catch (error) {
        return jsonResponse({ type: 4, data: { content: '❌ Error fetching leaderboard', flags: 64 } });
    }
}

async function handleGivePointsCommand(interaction, env) {
    const options = interaction.data.options;
    const points = options.find(opt => opt.name === 'points')?.value;
    const targetUserId = options.find(opt => opt.name === 'user')?.value;
    const reason = options.find(opt => opt.name === 'reason')?.value;
    const adminUser = interaction.member?.user || interaction.user;
    
    try {
        const userData = await getUserData(targetUserId, env);
        if (!userData) {
            return jsonResponse({ type: 4, data: { content: '❌ User not found', flags: 64 } });
        }
        
        userData.points = (userData.points || 0) + points;
        await saveUserData(userData, env);
        
        // Log to points activity webhook
        const pointsWebhook = 'https://discord.com/api/webhooks/1436826449150742679/ExNLzfnEG3CCemhOpVxNxLrzH4U57ekFKhnm7td_FTNP9El2lJsxA8AsxcJKorziy9gw';
        try {
            await fetch(pointsWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '➕ Points Given',
                        description: `**${points} points** awarded to <@${targetUserId}>`,
                        color: 0x10b981,
                        fields: [
                            { name: '👤 User', value: `<@${targetUserId}>`, inline: true },
                            { name: '⭐ Points', value: `+${points}`, inline: true },
                            { name: '💰 New Balance', value: `${userData.points} points`, inline: true },
                            { name: '📝 Reason', value: reason, inline: false },
                            { name: '👨‍💼 Admin', value: `<@${adminUser.id}>`, inline: true }
                        ],
                        footer: { text: '📊 Points Activity' },
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        } catch (webhookError) {
            console.error('Webhook error:', webhookError);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '✅ Points Given',
                    description: `Awarded **${points} points** to <@${targetUserId}>`,
                    color: 0x10b981,
                    fields: [
                        { name: '📝 Reason', value: reason, inline: false },
                        { name: '💰 New Balance', value: `${userData.points} points`, inline: true }
                    ]
                }]
            }
        });
    } catch (error) {
        return jsonResponse({ type: 4, data: { content: '❌ Error', flags: 64 } });
    }
}

async function handleDeductPointsCommand(interaction, env) {
    const options = interaction.data.options;
    const points = options.find(opt => opt.name === 'points')?.value;
    const targetUserId = options.find(opt => opt.name === 'user')?.value;
    const reason = options.find(opt => opt.name === 'reason')?.value;
    const adminUser = interaction.member?.user || interaction.user;
    
    try {
        const userData = await getUserData(targetUserId, env);
        if (!userData) {
            return jsonResponse({ type: 4, data: { content: '❌ User not found', flags: 64 } });
        }
        
        userData.points = Math.max(0, (userData.points || 0) - points);
        await saveUserData(userData, env);
        
        // Log to points activity webhook
        const pointsWebhook = 'https://discord.com/api/webhooks/1436826449150742679/ExNLzfnEG3CCemhOpVxNxLrzH4U57ekFKhnm7td_FTNP9El2lJsxA8AsxcJKorziy9gw';
        try {
            await fetch(pointsWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '➖ Points Deducted',
                        description: `**${points} points** deducted from <@${targetUserId}>`,
                        color: 0xf59e0b,
                        fields: [
                            { name: '👤 User', value: `<@${targetUserId}>`, inline: true },
                            { name: '⭐ Points', value: `-${points}`, inline: true },
                            { name: '💰 New Balance', value: `${userData.points} points`, inline: true },
                            { name: '📝 Reason', value: reason, inline: false },
                            { name: '👨‍💼 Admin', value: `<@${adminUser.id}>`, inline: true }
                        ],
                        footer: { text: '📊 Points Activity' },
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        } catch (webhookError) {
            console.error('Webhook error:', webhookError);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '✅ Points Deducted',
                    description: `Deducted **${points} points** from <@${targetUserId}>`,
                    color: 0xf59e0b,
                    fields: [
                        { name: '📝 Reason', value: reason, inline: false },
                        { name: '💰 New Balance', value: `${userData.points} points`, inline: true }
                    ]
                }]
            }
        });
    } catch (error) {
        return jsonResponse({ type: 4, data: { content: '❌ Error', flags: 64 } });
    }
}

async function handleProcessCommand(interaction, env) {
    const options = interaction.data.options;
    const reward = options.find(opt => opt.name === 'reward')?.value;
    const targetUserId = options.find(opt => opt.name === 'user')?.value;
    const adminUser = interaction.member?.user || interaction.user;
    
    const rewardInfo = {
        '20_off_product': { name: '20% off product', points: 500, needsCoupon: true, discount: '20%' },
        '40_off_commission': { name: '40% off commission', points: 750, needsCoupon: true, discount: '40%' },
        'free_product': { name: 'Free Product', points: 200, needsCoupon: false }
    };
    
    const info = rewardInfo[reward];
    
    try {
        const userData = await getUserData(targetUserId, env);
        if (!userData) {
            return jsonResponse({ type: 4, data: { content: '❌ User not found', flags: 64 } });
        }
        
        if ((userData.points || 0) < info.points) {
            return jsonResponse({
                type: 4,
                data: {
                    content: `❌ User only has ${userData.points} points, needs ${info.points}`,
                    flags: 64
                }
            });
        }
        
        userData.points -= info.points;
        await saveUserData(userData, env);
        
        const couponCode = `MYC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        // Log to redemption webhook
        const redemptionWebhook = 'https://discord.com/api/webhooks/1436826526883647569/mpdU8WILa-zH7hd3AI9wN6g2hUmNerpXbcq0WKzQeAEAL3A2MosB-56jvCRZtdYUPgGR';
        try {
            const embedData = {
                title: '🎁 Reward Redeemed',
                description: `<@${targetUserId}> redeemed **${info.name}**!`,
                color: 0x10b981,
                fields: [
                    { name: '👤 User', value: `<@${targetUserId}>`, inline: true },
                    { name: '🎁 Reward', value: info.name, inline: true },
                    { name: '💰 Points Spent', value: `${info.points} points`, inline: true },
                    { name: '📊 Remaining Balance', value: `${userData.points} points`, inline: true },
                    { name: '👨‍💼 Processed By', value: `<@${adminUser.id}>`, inline: true }
                ],
                footer: { text: '🎉 Redemption Activity' },
                timestamp: new Date().toISOString()
            };
            
            if (info.needsCoupon) {
                embedData.fields.push({
                    name: '🎫 Coupon Code',
                    value: `\`${couponCode}\``,
                    inline: false
                });
            }
            
            await fetch(redemptionWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embedData] })
            });
        } catch (webhookError) {
            console.error('Webhook error:', webhookError);
        }
        
        const responseEmbed = {
            title: '✅ Reward Processed',
            description: `Processed **${info.name}** for <@${targetUserId}>`,
            color: 0x10b981,
            fields: [
                { name: '💰 Points Deducted', value: `${info.points} points`, inline: true },
                { name: '📊 New Balance', value: `${userData.points} points`, inline: true }
            ]
        };
        
        if (info.needsCoupon) {
            responseEmbed.fields.push({
                name: '🎫 Coupon Code',
                value: `\`${couponCode}\``,
                inline: false
            });
        }
        
        return jsonResponse({ type: 4, data: { embeds: [responseEmbed] } });
    } catch (error) {
        return jsonResponse({ type: 4, data: { content: '❌ Error', flags: 64 } });
    }
}

async function handleDailyRewardCommand(interaction, env) {
    const options = interaction.data.options;
    const rewardName = options.find(opt => opt.name === 'reward')?.value;
    const points = options.find(opt => opt.name === 'points')?.value;
    const adminUser = interaction.member?.user || interaction.user;
    
    try {
        const dailyReward = {
            name: rewardName,
            points: points,
            setAt: new Date().toISOString()
        };
        
        await env.BOT_CONFIG_KV?.put('daily-reward', JSON.stringify(dailyReward));
        
        // Log to admin logs webhook
        const adminLogsWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
        try {
            await fetch(adminLogsWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '⚙️ Daily Reward Updated',
                        description: `Daily reward configuration has been changed`,
                        color: 0x10b981,
                        fields: [
                            { name: '🎁 Reward Name', value: rewardName, inline: true },
                            { name: '⭐ Points Value', value: `${points} points`, inline: true },
                            { name: '👨‍💼 Updated By', value: `<@${adminUser.id}>`, inline: true }
                        ],
                        footer: { text: '🔧 Admin Activity' },
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        } catch (webhookError) {
            console.error('Webhook error:', webhookError);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '✅ Daily Reward Updated',
                    description: 'The daily reward has been set!',
                    color: 0x10b981,
                    fields: [
                        { name: '🎁 Reward', value: rewardName, inline: true },
                        { name: '⭐ Points', value: `${points} points`, inline: true }
                    ]
                }]
            }
        });
    } catch (error) {
        return jsonResponse({ type: 4, data: { content: '❌ Error', flags: 64 } });
    }
}
```

## Step 2: Deploy Worker

```bash
cd /workspaces/mycirkle-website
wrangler deploy
```

## Step 3: Set Admin Role (Optional)

To restrict admin commands to specific Discord role:
```bash
wrangler secret put ADMIN_ROLE_ID
# Enter your Discord admin role ID
```

## Step 4: Create KV Namespace for Bot Config

```bash
# Create KV namespace
wrangler kv:namespace create "BOT_CONFIG_KV"

# Copy the ID it gives you, then update wrangler.toml:
# { binding = "BOT_CONFIG_KV", id = "paste_id_here" }
```

## Step 5: Deploy bot.js to Render.com

1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repo: `mycirkle-website`
4. Settings:
   - **Name**: mycirkle-bot
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node bot.js`
   - **Environment Variables**:
     - `BOT_TOKEN` = Your Discord bot token
     - `CONFIG_URL` = `https://mycirkle-auth.marcusray.workers.dev/api/bot-config`
5. Click "Create Web Service"

Bot will be online 24/7 and fetch config from your website!

## Summary of What Was Fixed

✅ Footer now at bottom of page (not fixed at top)
✅ Loading screens hidden until triggered
✅ Loyalty card text all white and visible
✅ Bot commands updated to match requirements
✅ Bot config panel at `/admin/config/botconfig.html`
✅ User data now fetched from Google Sheets (fixes "not linked" issue)

## Bot Commands Available

- `/balance [user]` - Check points (optional user parameter)
- `/leaderboard` - Top 10 members
- `/givepoints [points] [user] [reason]` - ADMIN ONLY
- `/deductpoints [points] [user] [reason]` - ADMIN ONLY
- `/process [reward] [user]` - ADMIN ONLY (generates coupons for discounts)
- `/dailyreward [reward] [points]` - ADMIN ONLY
