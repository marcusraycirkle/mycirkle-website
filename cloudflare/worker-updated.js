// cloudflare/worker.js - MyCirkle Loyalty Program Backend - UPDATED
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Discord OAuth routes
        if (path === '/auth/discord') {
            const clientId = env.DISCORD_CLIENT_ID;
            if (!clientId) {
                return jsonResponse({ error: 'DISCORD_CLIENT_ID not configured' }, 500, corsHeaders);
            }
            const frontendRedirect = url.searchParams.get('redirect_uri') || 'http://localhost:8080';
            const workerCallbackUrl = `${url.protocol}//${url.host}/auth/callback`;
            
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: workerCallbackUrl,
                response_type: 'code',
                scope: 'identify email guilds',
                state: frontendRedirect
            });
            return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
        }

        if (path === '/auth/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            
            if (!code) {
                return new Response('Missing code', { status: 400, headers: corsHeaders });
            }

            const clientId = env.DISCORD_CLIENT_ID;
            const clientSecret = env.DISCORD_CLIENT_SECRET;
            if (!clientId || !clientSecret) {
                return jsonResponse({ error: 'Discord credentials not configured' }, 500, corsHeaders);
            }
            
            const workerCallbackUrl = `${url.protocol}//${url.host}/auth/callback`;

            try {
                const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: workerCallbackUrl
                    })
                });

                const tokenData = await tokenResponse.json();
                if (tokenData.error) {
                    return jsonResponse(tokenData, 400, corsHeaders);
                }

                const userResponse = await fetch('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` }
                });
                const user = await userResponse.json();

                const frontendUrl = state || 'http://localhost:8080';
                const userDataEncoded = encodeURIComponent(JSON.stringify(user));
                return Response.redirect(`${frontendUrl}#discord-callback?user=${userDataEncoded}`, 302);
            } catch (error) {
                return jsonResponse({ error: 'OAuth error', details: error.message }, 500, corsHeaders);
            }
        }

        if (path === '/auth/check-membership') {
            const userId = url.searchParams.get('user_id');
            if (!userId) {
                return jsonResponse({ error: 'Missing user_id' }, 400, corsHeaders);
            }
            
            const guildId = env.DISCORD_GUILD_ID;
            const botToken = env.DISCORD_BOT_TOKEN;
            if (!guildId || !botToken) {
                return jsonResponse({ error: 'Discord bot credentials not configured' }, 500, corsHeaders);
            }

            try {
                const memberResponse = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
                    headers: { Authorization: `Bot ${botToken}` }
                });
                
                if (memberResponse.status === 404) {
                    return jsonResponse({ isMember: false }, 200, corsHeaders);
                }
                
                const member = await memberResponse.json();
                return jsonResponse({ isMember: !!member.user }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Membership check failed', isMember: false }, 500, corsHeaders);
            }
        }

        // API: Signup with webhook notification
        if (path === '/api/signup' && request.method === 'POST') {
            try {
                const data = await request.json();
                const { 
                    discordId, discordUsername, firstName, lastName, fullName, email, memberSince,
                    country, timezone, language, robloxUsername, acceptedMarketing, accountNumber
                } = data;

                if (!discordId || !firstName || !lastName) {
                    return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
                }

                // Generate account number if not provided
                const finalAccountNumber = accountNumber || generateAccountNumber();

                // Save to Google Sheets via webhook (to avoid Cloudflare blocking)
                const webhookUrl = env.SIGNUP_WEBHOOK_URL;
                if (webhookUrl) {
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: null,
                            embeds: [{
                                title: 'New User Registration',
                                color: 0x5865F2,
                                fields: [
                                    { name: 'Username', value: discordUsername || 'N/A', inline: true },
                                    { name: 'Email', value: email || 'N/A', inline: true },
                                    { name: 'Account Type', value: 'Consumer', inline: true },
                                    { name: 'Account Number', value: finalAccountNumber, inline: false },
                                    { name: 'Discord Account', value: `<@${discordId}>`, inline: true },
                                    { name: 'Registered At', value: memberSince || new Date().toISOString(), inline: true },
                                    { name: 'Roblox Username', value: robloxUsername || 'Not provided', inline: true },
                                    { name: 'Country', value: country || 'N/A', inline: true },
                                    { name: 'Timezone', value: timezone || 'N/A', inline: true },
                                    { name: 'Marketing Emails', value: acceptedMarketing ? 'Yes' : 'No', inline: true }
                                ],
                                footer: { text: 'MyCirkle Loyalty Bot' },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                }

                // Send welcome DM
                const dmWebhookUrl = env.WELCOME_DM_WEBHOOK_URL;
                if (dmWebhookUrl) {
                    await fetch(dmWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: `<@${discordId}>`,
                            embeds: [{
                                title: '🎉 Welcome to MyCirkle!',
                                description: `Hi ${firstName}! Your loyalty account has been created successfully.`,
                                color: 0x00D9FF,
                                fields: [
                                    { name: '📧 Email', value: email || 'Not provided', inline: true },
                                    { name: '🎮 Roblox', value: robloxUsername || 'Not linked', inline: true },
                                    { name: '🔢 Account Number', value: `\`${finalAccountNumber}\``, inline: false },
                                    { name: '⭐ Points Balance', value: '0 points', inline: true },
                                    { name: '🎁 Tier', value: 'Bronze', inline: true },
                                    { name: '📅 Member Since', value: new Date().toLocaleDateString(), inline: true }
                                ],
                                footer: { text: 'Keep this information safe!' },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                }

                return jsonResponse({ 
                    success: true, 
                    message: 'User registered',
                    accountNumber: finalAccountNumber
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Signup failed', details: error.message }, 500, corsHeaders);
            }
        }

        // API: Get user data (from KV store instead of Sheets to avoid Cloudflare blocking)
        if (path === '/api/user-data' && request.method === 'POST') {
            try {
                const { discordId } = await request.json();
                
                if (!discordId) {
                    return jsonResponse({ error: 'Missing discordId' }, 400, corsHeaders);
                }

                // Try to get from KV first
                const kvData = await env.USERS_KV?.get(`user:${discordId}`, { type: 'json' });
                
                if (kvData) {
                    return jsonResponse(kvData, 200, corsHeaders);
                }
                
                return jsonResponse({ found: false }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to fetch user', details: error.message }, 500, corsHeaders);
            }
        }

        // API: Update points
        if (path === '/api/update-points' && request.method === 'POST') {
            try {
                const { discordId, points } = await request.json();
                
                if (!discordId || points === undefined) {
                    return jsonResponse({ error: 'Missing fields' }, 400, corsHeaders);
                }

                // Update in KV
                const userData = await env.USERS_KV?.get(`user:${discordId}`, { type: 'json' }) || {};
                userData.points = points;
                await env.USERS_KV?.put(`user:${discordId}`, JSON.stringify(userData));
                
                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to update points', details: error.message }, 500, corsHeaders);
            }
        }

        // API: Get products from ParcelRoblox
        if (path === '/api/products') {
            try {
                const robloxUsername = url.searchParams.get('robloxUsername');
                const accountId = url.searchParams.get('accountId');

                if (!robloxUsername) {
                    return jsonResponse({ error: 'Missing robloxUsername', products: [] }, 400, corsHeaders);
                }

                const PARCEL_API_KEY = env.PARCELROBLOX_API_KEY;
                const PRODUCT_ID = env.PARCEL_PRODUCT_ID || 'prod_BwM387gLYcCa8qhERIH1JliOQ';

                if (!PARCEL_API_KEY) {
                    return jsonResponse({ error: 'ParcelRoblox API not configured', products: [] }, 500, corsHeaders);
                }

                // Check ownership via ParcelRoblox API
                const checkUrl = 'https://api.parcelroblox.com/v1/products/ownership';
                const response = await fetch(checkUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${PARCEL_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        productId: PRODUCT_ID,
                        robloxUsername: robloxUsername
                    })
                });

                if (!response.ok) {
                    console.error('ParcelRoblox API error:', response.status);
                    return jsonResponse({ success: true, products: [] }, 200, corsHeaders);
                }

                const data = await response.json();
                const products = data.owns ? [{
                    id: PRODUCT_ID,
                    name: data.productName || 'MyCirkle Product',
                    description: 'Verified product ownership',
                    owned: true
                }] : [];

                return jsonResponse({ success: true, products }, 200, corsHeaders);
            } catch (error) {
                console.error('Products API error:', error);
                return jsonResponse({ success: true, products: [] }, 200, corsHeaders);
            }
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
};

function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
    });
}

function generateAccountNumber() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let i = 0; i < 4; i++) {
        let segment = '';
        for (let j = 0; j < 4; j++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        segments.push(segment);
    }
    return segments.join('-');
}
