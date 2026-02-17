// Simple Discord bot to keep online status - uses minimal resources
// This bot only maintains presence, all commands are handled by Cloudflare Worker
// Fetches configuration from your website at /admin/config/botconfig.html

const BOT_TOKEN = process.env.BOT_TOKEN;
const CONFIG_URL = process.env.CONFIG_URL || 'https://mycirkle-auth.marcusray.workers.dev/api/bot-config';
const PORT = process.env.PORT || 3000;
const WORKER_API_URL = process.env.WORKER_API_URL || 'https://mycirkle-auth.marcusray.workers.dev';

// Activity reward configuration
const MESSAGE_REWARD_CHANNELS = ['1365306074319683707', '1315050837520809984'];
const MESSAGE_THRESHOLD = 5; // Points awarded every 5 messages
const MESSAGE_REWARD_POINTS = 2;

const FORUM_REWARDS = {
    '1315679706745409566': 3, // Forum ID -> points
    '1323293808326086717': 4
};

// In-memory message tracking (per user per channel)
const messageTracker = new Map(); // key: "userId:channelId", value: count

// Tracking last ad confirmation message per channel
const lastAdEmbedMessages = new Map(); // key: channelId, value: messageId

if (!BOT_TOKEN) {
    console.error('❌ Error: BOT_TOKEN environment variable is required');
    console.log('Usage: BOT_TOKEN=your_token node bot.js');
    process.exit(1);
}

// Create HTTP server for Render health checks
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            bot: ws ? 'connected' : 'disconnected',
            uptime: Math.floor(process.uptime()),
            lastConfigFetch: lastConfigFetch || 'never'
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
    
    // Self-ping every 5 minutes to prevent Render from spinning down
    setInterval(() => {
        http.get(`http://localhost:${PORT}/health`, (res) => {
            console.log('🏓 Self-ping to stay alive');
        }).on('error', (err) => {
            console.error('❌ Self-ping failed:', err.message);
        });
    }, 5 * 60 * 1000); // 5 minutes
});

// Minimal WebSocket connection to Discord Gateway
const WebSocket = require('ws');
const https = require('https');

let ws = null;
let heartbeatInterval = null;
let heartbeatAcked = true;
let sessionId = null;
let resumeGatewayUrl = null;
let lastConfigFetch = null;
let currentConfig = {
    botPower: true,
    currentStatus: 'MyCirkle Loyalty',
    rotationEnabled: false,
    rotationInterval: 60,
    statusList: ['Watching MyCirkle Loyalty', 'Playing with loyalty cards', 'Listening to member feedback'],
    activityType: 3
};
let statusRotationInterval = null;
let currentStatusIndex = 0;

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

// Fetch configuration from API
async function fetchConfig() {
    return new Promise((resolve, reject) => {
        https.get(CONFIG_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const config = JSON.parse(data);
                    if (config && typeof config === 'object') {
                        currentConfig = { ...currentConfig, ...config };
                        lastConfigFetch = new Date().toISOString();
                        console.log('📥 Config updated:', {
                            power: currentConfig.botPower ? 'ON' : 'OFF',
                            rotation: currentConfig.rotationEnabled ? 'ON' : 'OFF',
                            status: currentConfig.currentStatus
                        });
                        
                        // Update presence if connected
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            updatePresence();
                        }
                        
                        // Update rotation interval
                        updateStatusRotation();
                    }
                    resolve(config);
                } catch (error) {
                    console.error('❌ Failed to parse config:', error.message);
                    resolve(null);
                }
            });
        }).on('error', (error) => {
            console.error('❌ Config fetch error:', error.message);
            resolve(null);
        });
    });
}

// Update presence based on config
function updatePresence() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const status = currentConfig.botPower ? 'online' : 'invisible';
    const activityName = currentConfig.rotationEnabled && currentConfig.statusList?.length > 0
        ? currentConfig.statusList[currentStatusIndex]
        : currentConfig.currentStatus || 'MyCirkle Loyalty';
    
    ws.send(JSON.stringify({
        op: 3,
        d: {
            activities: [{
                name: activityName,
                type: currentConfig.activityType || 3
            }],
            status: status,
            since: null,
            afk: false
        }
    }));
}

// Update status rotation
function updateStatusRotation() {
    if (statusRotationInterval) {
        clearInterval(statusRotationInterval);
        statusRotationInterval = null;
    }
    
    if (currentConfig.rotationEnabled && currentConfig.statusList?.length > 0) {
        const interval = (currentConfig.rotationInterval || 60) * 1000;
        statusRotationInterval = setInterval(() => {
            currentStatusIndex = (currentStatusIndex + 1) % currentConfig.statusList.length;
            updatePresence();
        }, interval);
        console.log(`🔄 Status rotation enabled: ${currentConfig.statusList.length} statuses, every ${currentConfig.rotationInterval}s`);
    }
}

// Helper: Award points to a user
async function awardPoints(userId, points, reason) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({ userId, points, reason });
        const url = new URL(`${WORKER_API_URL}/api/activity-reward`);
        
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`✨ Awarded ${points} points to ${userId} - ${reason}`);
                    resolve(true);
                } else {
                    console.error(`❌ Failed to award ${points} points to ${userId}: ${res.statusCode}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`❌ Error awarding points:`, error.message);
            resolve(false);
        });
        
        req.write(postData);
        req.end();
    });
}

// Helper: Send message to a channel
async function sendChannelMessage(channelId, content, messageReference = null) {
    return new Promise((resolve) => {
        const messageData = {
            content: content
        };
        
        // Add message reference if replying
        if (messageReference) {
            messageData.message_reference = {
                message_id: messageReference
            };
        }
        
        const postData = JSON.stringify(messageData);
        const options = {
            hostname: 'discord.com',
            path: `/api/v10/channels/${channelId}/messages`,
            method: 'POST',
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const messageResponse = JSON.parse(data);
                        const sentMessageId = messageResponse.id;
                        console.log(`💬 Sent message to channel ${channelId}, ID: ${sentMessageId}`);
                        
                        // Delete the message after 5 seconds
                        setTimeout(() => {
                            const deleteOptions = {
                                hostname: 'discord.com',
                                path: `/api/v10/channels/${channelId}/messages/${sentMessageId}`,
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bot ${BOT_TOKEN}`
                                }
                            };
                            
                            const deleteReq = https.request(deleteOptions, (deleteRes) => {
                                if (deleteRes.statusCode === 204) {
                                    console.log(`🗑️ Deleted message ${sentMessageId} after 5 seconds`);
                                } else {
                                    console.error(`❌ Failed to delete message ${sentMessageId}: ${deleteRes.statusCode}`);
                                }
                            });
                            
                            deleteReq.on('error', (error) => {
                                console.error(`❌ Error deleting message:`, error.message);
                            });
                            
                            deleteReq.end();
                        }, 5000);
                        
                        resolve(true);
                    } catch (err) {
                        console.error(`❌ Error parsing message response:`, err.message);
                        resolve(true); // Still resolve as the message was sent
                    }
                } else {
                    console.error(`❌ Failed to send message to channel ${channelId}: ${res.statusCode}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`❌ Error sending channel message:`, error.message);
            resolve(false);
        });
        
        req.write(postData);
        req.end();
    });
}

// Helper: Send DM to user
async function sendActivityDM(userId, points, reason) {
    return new Promise((resolve) => {
        // First, create DM channel
        const dmData = JSON.stringify({ recipient_id: userId });
        const dmOptions = {
            hostname: 'discord.com',
            path: '/api/v10/users/@me/channels',
            method: 'POST',
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dmData)
            }
        };
        
        const dmReq = https.request(dmOptions, (dmRes) => {
            let dmChannelData = '';
            dmRes.on('data', (chunk) => dmChannelData += chunk);
            dmRes.on('end', () => {
                if (dmRes.statusCode !== 200) {
                    resolve(false);
                    return;
                }
                
                try {
                    const dmChannel = JSON.parse(dmChannelData);
                    
                    // Send message to DM channel
                    const msgData = JSON.stringify({
                        embeds: [{
                            title: '🎉 Activity Reward!',
                            description: `You earned **${points} points** for being active!`,
                            color: 0x8b5cf6,
                            fields: [
                                { name: '📝 Reason', value: reason, inline: false },
                                { name: '⭐ Points Earned', value: `+${points}`, inline: true }
                            ],
                            footer: { text: 'Keep being active to earn more points!' },
                            timestamp: new Date().toISOString()
                        }]
                    });
                    
                    const msgOptions = {
                        hostname: 'discord.com',
                        path: `/api/v10/channels/${dmChannel.id}/messages`,
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${BOT_TOKEN}`,
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(msgData)
                        }
                    };
                    
                    const msgReq = https.request(msgOptions, (msgRes) => {
                        msgRes.on('data', () => {}); // Consume response
                        msgRes.on('end', () => resolve(true));
                    });
                    
                    msgReq.on('error', (error) => {
                        console.error('❌ Error sending activity DM:', error.message);
                        resolve(false);
                    });
                    
                    msgReq.write(msgData);
                    msgReq.end();
                } catch (error) {
                    console.error('❌ Error parsing DM channel response:', error.message);
                    resolve(false);
                }
            });
        });
        
        dmReq.on('error', (error) => {
            console.error('❌ Error creating DM channel:', error.message);
            resolve(false);
        });
        
        dmReq.write(dmData);
        dmReq.end();
    });
}

function connect() {
    console.log('🔄 Connecting to Discord Gateway...');
    ws = new WebSocket(GATEWAY_URL);

    ws.on('open', () => {
        console.log('✅ Connected to Discord Gateway');
    });

    ws.on('message', (data) => {
        const payload = JSON.parse(data);
        handlePayload(payload);
    });

    ws.on('close', (code, reason) => {
        console.log(`❌ Connection closed with code: ${code}, reason: ${reason}`);
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        
        // Don't keep session info on certain close codes
        if (code === 4004 || code === 4010 || code === 4011 || code === 4012 || code === 4013 || code === 4014) {
            console.log('⚠️ Non-resumable close code, clearing session');
            sessionId = null;
            resumeGatewayUrl = null;
        }
        
        // Reconnect after 5 seconds
        setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connect();
        }, 5000);
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });
}

function handlePayload(payload) {
    const { op, t, d } = payload;

    switch (op) {
        case 10: // Hello
            const { heartbeat_interval } = d;
            console.log(`💓 Starting heartbeat every ${heartbeat_interval}ms`);
            
            // Start heartbeat
            heartbeatInterval = setInterval(() => {
                if (!heartbeatAcked) {
                    console.warn('⚠️ Heartbeat not acknowledged, reconnecting...');
                    ws.close();
                    return;
                }
                
                if (ws.readyState === WebSocket.OPEN) {
                    heartbeatAcked = false;
                    ws.send(JSON.stringify({ op: 1, d: null }));
                }
            }, heartbeat_interval);

            // Identify
            if (sessionId && resumeGatewayUrl) {
                // Resume
                ws.send(JSON.stringify({
                    op: 6,
                    d: {
                        token: BOT_TOKEN,
                        session_id: sessionId,
                        seq: null
                    }
                }));
            } else {
                // New identify
                ws.send(JSON.stringify({
                    op: 2,
                    d: {
                        token: BOT_TOKEN,
                        intents: (1 << 0) | (1 << 9) | (1 << 15) | (1 << 1), // GUILDS (1) + GUILD_MEMBERS (2) + GUILD_MESSAGES (512) + MESSAGE_CONTENT (32768) = 33283
                        properties: {
                            os: 'linux',
                            browser: 'mycirkle-bot',
                            device: 'mycirkle-bot'
                        },
                        presence: {
                            activities: [{
                                name: currentConfig.currentStatus || 'MyCirkle Loyalty',
                                type: currentConfig.activityType || 3
                            }],
                            status: currentConfig.botPower ? 'online' : 'invisible',
                            since: null,
                            afk: false
                        }
                    }
                }));
            }
            break;

        case 0: // Dispatch
            if (t === 'READY') {
                sessionId = d.session_id;
                resumeGatewayUrl = d.resume_gateway_url;
                console.log('✅ Bot is now ONLINE and ready!');
                console.log(`🤖 Logged in as: ${d.user.username}#${d.user.discriminator}`);
                console.log('📝 Session ID:', sessionId);
                
                // Fetch initial config
                fetchConfig();
                
                // Setup config polling every 30 seconds
                setInterval(fetchConfig, 30000);
                
                // Setup status rotation
                updateStatusRotation();
            } else if (t === 'MESSAGE_CREATE') {
                // Handle message-based events
                const { author, channel_id, content, id: message_id } = d;
                
                // Ignore bots
                if (author.bot) break;
                
                // Handle message-based rewards
                if (MESSAGE_REWARD_CHANNELS.includes(channel_id)) {
                    const trackingKey = `${author.id}:${channel_id}`;
                    const currentCount = messageTracker.get(trackingKey) || 0;
                    const newCount = currentCount + 1;
                    
                    messageTracker.set(trackingKey, newCount);
                    
                    // Award points every MESSAGE_THRESHOLD messages
                    if (newCount % MESSAGE_THRESHOLD === 0) {
                        console.log(`📨 User ${author.username} reached ${newCount} messages in channel ${channel_id}`);
                        // Wrap async calls in IIFE
                        (async () => {
                            try {
                                await awardPoints(author.id, MESSAGE_REWARD_POINTS, `Sent ${MESSAGE_THRESHOLD} messages in active channel`);
                                await sendActivityDM(author.id, MESSAGE_REWARD_POINTS, `Sent ${MESSAGE_THRESHOLD} messages in active channel`);
                                // Send reply message in channel
                                await sendChannelMessage(channel_id, `<@${author.id}> You have received ${MESSAGE_REWARD_POINTS} points for activity!`, message_id);
                            } catch (err) {
                                console.error('❌ Error awarding message points:', err.message);
                            }
                        })();
                    }
                }
                
                // Handle advertisement channel messages
                const adChannels = ['1323358084265152594', '1323358165730852946', '1323358256881602692'];
                if (adChannels.includes(channel_id)) {
                    // Wrap in async IIFE
                    (async () => {
                        // Check for inappropriate content
                        const inappropriateWords = ['badword1', 'badword2', 'badword3']; // Add actual words as needed
                        const hasMentions = content.includes('@everyone') || content.includes('@here') || content.includes('<@');
                        const hasInappropriateContent = inappropriateWords.some(word => content.toLowerCase().includes(word));
                        
                        // Check for permanent Discord invite
                        const discordInviteRegex = /discord\.gg\/([a-zA-Z0-9-]+)/gi;
                        const hasDiscordInvite = discordInviteRegex.test(content);
                        
                        console.log(`📢 Message in ad channel ${channel_id} from ${author.username}`);
                        
                        let shouldDelete = false;
                        let deleteReason = '';
                        
                        if (hasMentions) {
                            shouldDelete = true;
                            deleteReason = 'Your advertisement was deleted because it contains mentions (@everyone, @here, or user mentions), which are not allowed.';
                        } else if (hasInappropriateContent) {
                            shouldDelete = true;
                            deleteReason = 'Your advertisement was deleted because it contains inappropriate language.';
                        } else if (!hasDiscordInvite) {
                            shouldDelete = true;
                            deleteReason = 'Your advertisement was deleted because it does not contain a permanent Discord invite link. Please include a permanent invite (discord.gg/...) in your advertisement.';
                        }
                        
                        if (shouldDelete) {
                            // Delete the message
                            await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bot ${BOT_TOKEN}`
                                }
                            }).catch(err => console.error('Failed to delete message:', err));
                            
                            // Send DM to user
                            try {
                                const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bot ${BOT_TOKEN}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ recipient_id: author.id })
                                });
                                
                                if (!dmChannelResponse.ok) {
                                    console.error('Failed to create DM channel');
                                    return;
                                }
                                
                                const dmChannel = await dmChannelResponse.json();
                                
                                await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bot ${BOT_TOKEN}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        embeds: [{
                                            title: '❌ Advertisement Deleted',
                                            description: deleteReason,
                                            color: 0xef4444,
                                            footer: { text: 'Cirkle Development' },
                                            timestamp: new Date().toISOString()
                                        }]
                                    })
                                });
                            } catch (error) {
                                console.error('Error sending DM:', error.message);
                            }
                        } else {
                            // Valid advertisement - send confirmation embed
                            try {
                                // Delete previous message if exists
                                const previousMessageId = lastAdEmbedMessages.get(channel_id);
                                if (previousMessageId) {
                                    await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${previousMessageId}`, {
                                        method: 'DELETE',
                                        headers: {
                                            'Authorization': `Bot ${BOT_TOKEN}`
                                        }
                                    }).catch(err => console.log('Previous message already deleted or not found'));
                                }
                                
                                const confirmResponse = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bot ${BOT_TOKEN}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        embeds: [{
                                            title: '<:cirkledev:1315278604736794745> **Advert Shared** ✅',
                                            description: `Thanks for sharing your ad, <@${author.id}>! You can come back in \`6\` hours to share again!\n\n> 👉 **Ads must have a permanent invite link**\n> ❗ **leaving will delete all posted ads.**\n\n**Thanks for advertising in Cirkle!**\nBy advertising in Cirkle Development, you agree to the rules and regulations provided by Cirkle. These can be seen here -> <#1323358326309916702>`,
                                            color: 0x10b981,
                                            footer: { text: 'Cirkle Development' },
                                            timestamp: new Date().toISOString()
                                        }]
                                    })
                                });
                                
                                if (confirmResponse.ok) {
                                    const newMessage = await confirmResponse.json();
                                    lastAdEmbedMessages.set(channel_id, newMessage.id);
                                    console.log(`✅ Sent confirmation for ad from ${author.username}`);
                                } else {
                                    const errorText = await confirmResponse.text();
                                    console.error(`Failed to send confirmation: ${confirmResponse.status} - ${errorText}`);
                                }
                            } catch (error) {
                                console.error('Error sending confirmation embed:', error.message);
                            }
                        }
                    })();
                }
            } else if (t === 'THREAD_CREATE') {
                // Handle forum post rewards and special forum handlers
                const { owner_id, parent_id, id: thread_id, name: thread_name } = d;
                const botToken = BOT_TOKEN;
                
                // Check if forum is tracked for rewards
                const pointsToAward = FORUM_REWARDS[parent_id];
                if (pointsToAward) {
                    console.log(`📝 User created thread in forum ${parent_id}`);
                    // Wrap async calls in IIFE
                    (async () => {
                        try {
                            await awardPoints(owner_id, pointsToAward, `Created a discussion thread`);
                            await sendActivityDM(owner_id, pointsToAward, `Created a discussion thread`);
                        } catch (err) {
                            console.error('❌ Error awarding thread points:', err.message);
                        }
                    })();
                }
                
                // Handle suggestions forum
                if (parent_id === '1323293808326086717') {
                    console.log(`💡 New suggestion from user ${owner_id}: ${thread_name}`);
                    (async () => {
                        try {
                            // Get user info
                            const userResponse = await fetch(`https://discord.com/api/v10/users/${owner_id}`, {
                                headers: { 'Authorization': `Bot ${botToken}` }
                            });
                            const userData = await userResponse.json();
                            const username = userData.username || 'User';
                            
                            // Send suggestion embed to suggestions channel with approve/deny buttons
                            await fetch(`https://discord.com/api/v10/channels/${parent_id}/messages`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${botToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    content: `<@${owner_id}> <@&1315323804528017498>`,
                                    embeds: [{
                                        title: '<:cirkledev:1315278604736794745> New Suggestion Recorded 💡',
                                        description: `**Thank you for sharing your suggestion,** ${username}!\n\nPlease wait whilst a Developer reviews your request. This may take a few hours to a few days. You will be pinged once a response is given.\n\n👉 **Have you checked out our list of denied suggestions?**\nPlease ensure you have checked out the list of our previously denied suggestions, just in case you haven't suggested the same thing! https://discord.com/channels/1310656642672627752/1323296654555877477`,
                                        color: 0x10b981,
                                        image: {
                                            url: 'https://media.discordapp.net/attachments/1315278404009988107/1315681775447445504/image.png?ex=6995c823&is=699476a3&hm=366945720b1914bd4c7d5e0648f5ab09c5b2e3136407081317449288fd9fbe6a&=&format=webp&quality=lossless'
                                        }
                                    }],
                                    components: [
                                        {
                                            type: 1,
                                            components: [
                                                {
                                                    type: 2,
                                                    style: 3,
                                                    label: 'Approve',
                                                    custom_id: `suggestion_approve_${owner_id}`
                                                },
                                                {
                                                    type: 2,
                                                    style: 4,
                                                    label: 'Deny',
                                                    custom_id: `suggestion_deny_${owner_id}`
                                                }
                                            ]
                                        }
                                    ]
                                })
                            }).catch(err => console.error('Failed to send suggestion embed:', err));
                        } catch (error) {
                            console.error('Error in suggestion handler:', error.message);
                        }
                    })();
                }
                
                // Handle reviews forum
                if (parent_id === '1315679706745409566') {
                    console.log(`⭐ New review from user ${owner_id}: ${thread_name}`);
                    (async () => {
                        try {
                            // Get user info
                            const userResponse = await fetch(`https://discord.com/api/v10/users/${owner_id}`, {
                                headers: { 'Authorization': `Bot ${botToken}` }
                            });
                            const userData = await userResponse.json();
                            const username = userData.username || 'User';
                            
                            // Send review thank you embed
                            await fetch(`https://discord.com/api/v10/channels/${parent_id}/messages`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${botToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    content: `<@${owner_id}> <@&1315346851616002158>`,
                                    embeds: [{
                                        title: '<:cirkledev:1315278604736794745> Thanks for your review! 🤝',
                                        description: `✅ **Thank you for sending us a review, ${username}!**\n\nWe appreciate your time writing this review.\n\nThese reviews help us with making our products better, or improve our Customer Support Team. If you have purchased something, or dealt with a Support Agent in a ticket, email or external source, please consider writing a quick review!`,
                                        color: 0x10b981,
                                        image: {
                                            url: 'https://media.discordapp.net/attachments/1315278404009988107/1315681775447445504/image.png?ex=6995c823&is=699476a3&hm=366945720b1914bd4c7d5e0648f5ab09c5b2e3136407081317449288fd9fbe6a&=&format=webp&quality=lossless'
                                        }
                                    }]
                                })
                            }).catch(err => console.error('Failed to send review embed:', err));
                        } catch (error) {
                            console.error('Error in review handler:', error.message);
                        }
                    })();
                }
            } else if (t === 'GUILD_MEMBER_REMOVE') {
                // Handle user leaving - delete their ads
                const { user, guild_id } = d;
                const adChannels = ['1323358084265152594', '1323358165730852946', '1323358256881602692'];
                
                console.log(`👋 User ${user.username} left the server`);
                
                // Delete all messages from this user in ad channels
                (async () => {
                    for (const channelId of adChannels) {
                        try {
                            // Get messages from this user in the channel
                            const messagesResponse = await fetch(
                                `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
                                {
                                    headers: {
                                        'Authorization': `Bot ${BOT_TOKEN}`
                                    }
                                }
                            );
                            
                            if (!messagesResponse.ok) continue;
                            
                            const messages = await messagesResponse.json();
                            const userMessages = messages.filter(msg => msg.author.id === user.id);
                            
                            for (const msg of userMessages) {
                                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}`, {
                                    method: 'DELETE',
                                    headers: {
                                        'Authorization': `Bot ${BOT_TOKEN}`
                                    }
                                }).catch(err => console.error('Failed to delete user message:', err));
                            }
                            
                            if (userMessages.length > 0) {
                                console.log(`🗑️ Deleted ${userMessages.length} messages from ${user.username} in channel ${channelId}`);
                            }
                        } catch (error) {
                            console.error('Error deleting user messages:', error.message);
                        }
                    }
                })();
            }
            break;

        case 11: // Heartbeat ACK
            heartbeatAcked = true;
            // Silent - heartbeat acknowledged
            break;

        case 1: // Heartbeat request
            ws.send(JSON.stringify({ op: 1, d: null }));
            break;

        case 7: // Reconnect
            console.log('🔄 Gateway requested reconnect');
            ws.close();
            break;

        case 9: // Invalid Session
            console.log('❌ Invalid session, reconnecting...');
            sessionId = null;
            resumeGatewayUrl = null;
            setTimeout(() => connect(), 2000);
            break;
    }
}

// Start the bot
console.log('🚀 Starting MyCirkle Discord Bot...');
console.log('📍 Purpose: Maintain online presence only');
console.log('⚡ Commands handled by: Cloudflare Worker');
console.log('');
connect();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (statusRotationInterval) clearInterval(statusRotationInterval);
    if (ws) ws.close();
    process.exit(0);
});
