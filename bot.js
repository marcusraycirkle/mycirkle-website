// Simple Discord bot to keep online status - uses minimal resources
// This bot only maintains presence, all commands are handled by Cloudflare Worker
// Fetches configuration from your website at /admin/config/botconfig.html

const BOT_TOKEN = process.env.BOT_TOKEN;
const CONFIG_URL = process.env.CONFIG_URL || 'https://mycirkle-auth.marcusray.workers.dev/api/bot-config';

if (!BOT_TOKEN) {
    console.error('❌ Error: BOT_TOKEN environment variable is required');
    console.log('Usage: BOT_TOKEN=your_token node bot.js');
    process.exit(1);
}

// Minimal WebSocket connection to Discord Gateway
const WebSocket = require('ws');
const https = require('https');

let ws = null;
let heartbeatInterval = null;
let sessionId = null;
let resumeGatewayUrl = null;
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
                        intents: 0, // No intents needed - commands handled by worker
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
