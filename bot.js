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
});

// Minimal WebSocket connection to Discord Gateway
const WebSocket = require('ws');
const https = require('https');

let ws = null;
let heartbeatInterval = null;
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

    ws.on('close', (code) => {
        console.log(`❌ Connection closed with code: ${code}`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        
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
                if (ws.readyState === WebSocket.OPEN) {
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
                        intents: (1 << 9) | (1 << 15), // GUILD_MESSAGES (512) + MESSAGE_CONTENT (32768) = 33280
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
                // Handle message-based rewards
                const { author, channel_id, id: message_id } = d;
                
                // Ignore bots
                if (author.bot) break;
                
                // Check if channel is tracked
                if (!MESSAGE_REWARD_CHANNELS.includes(channel_id)) break;
                
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
            } else if (t === 'THREAD_CREATE') {
                // Handle forum post rewards
                const { owner_id, parent_id } = d;
                
                // Check if forum is tracked
                const pointsToAward = FORUM_REWARDS[parent_id];
                if (!pointsToAward) break;
                
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
            break;

        case 11: // Heartbeat ACK
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
