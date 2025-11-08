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

        // Discord Interactions (Slash Commands)
        if (path === '/interactions' && request.method === 'POST') {
            return handleDiscordInteraction(request, env);
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

                // Handle non-JSON responses (like rate limit errors)
                const contentType = tokenResponse.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await tokenResponse.text();
                    return jsonResponse({ 
                        error: 'Discord API error', 
                        details: `Status ${tokenResponse.status}: ${text.substring(0, 200)}`,
                        hint: 'This may be a rate limit or Discord API issue. Please try again in a few moments.'
                    }, tokenResponse.status, corsHeaders);
                }

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

        // Roblox OAuth routes
        if (path === '/auth/roblox') {
            const clientId = env.ROBLOX_CLIENT_ID;
            const clientSecret = env.ROBLOX_CLIENT_SECRET;
            
            if (!clientId || !clientSecret) {
                return jsonResponse({ error: 'Roblox OAuth not configured' }, 500, corsHeaders);
            }
            
            const state = url.searchParams.get('state') || 'unknown';
            // Use the main website domain for redirect
            const redirectUri = 'https://my.cirkledevelopment.co.uk/auth/roblox/callback';
            
            const authUrl = `https://apis.roblox.com/oauth/v1/authorize?` +
                `client_id=${clientId}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&scope=openid profile` +
                `&response_type=code` +
                `&state=${state}`;
            
            return Response.redirect(authUrl, 302);
        }

        if (path === '/auth/roblox/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            
            if (!code) {
                return new Response(
                    `<html><body><script>window.opener.postMessage({type: 'ROBLOX_AUTH_ERROR', error: 'No code'}, '*'); window.close();</script></body></html>`,
                    { headers: { 'Content-Type': 'text/html' } }
                );
            }

            const clientId = env.ROBLOX_CLIENT_ID;
            const clientSecret = env.ROBLOX_CLIENT_SECRET;
            // Use the main website domain for redirect
            const redirectUri = 'https://my.cirkledevelopment.co.uk/auth/roblox/callback';

            try {
                // Exchange code for token
                const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
                    },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: redirectUri
                    })
                });

                const tokenData = await tokenResponse.json();
                
                if (!tokenData.access_token) {
                    throw new Error('No access token received');
                }

                // Get user info
                const userResponse = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`
                    }
                });

                const userData = await userResponse.json();

                // Send success back to parent window
                return new Response(
                    `<html><body><script>
                        window.opener.postMessage({
                            type: 'ROBLOX_AUTH_SUCCESS',
                            username: '${userData.preferred_username}',
                            userId: '${userData.sub}'
                        }, '*');
                        window.close();
                    </script></body></html>`,
                    { headers: { 'Content-Type': 'text/html' } }
                );
            } catch (error) {
                return new Response(
                    `<html><body><script>window.opener.postMessage({type: 'ROBLOX_AUTH_ERROR', error: '${error.message}'}, '*'); window.close();</script></body></html>`,
                    { headers: { 'Content-Type': 'text/html' } }
                );
            }
        }

        // Roblox OAuth token exchange (called from callback.html)
        if (path === '/auth/roblox/exchange' && request.method === 'POST') {
            try {
                const { code, state } = await request.json();
                
                if (!code) {
                    return jsonResponse({ error: 'No code provided' }, 400, corsHeaders);
                }

                const clientId = env.ROBLOX_CLIENT_ID;
                const clientSecret = env.ROBLOX_CLIENT_SECRET;
                const redirectUri = 'https://my.cirkledevelopment.co.uk/auth/roblox/callback';

                // Exchange code for token
                const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
                    },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: redirectUri
                    })
                });

                const tokenData = await tokenResponse.json();
                
                if (!tokenData.access_token) {
                    return jsonResponse({ error: 'Failed to get access token', details: tokenData }, 400, corsHeaders);
                }

                // Get user info
                const userResponse = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`
                    }
                });

                const userData = await userResponse.json();

                return jsonResponse({
                    username: userData.preferred_username,
                    userId: userData.sub
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Token exchange failed', details: error.message }, 500, corsHeaders);
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

                // Create user data object with 5 welcome points
                const newUserData = {
                    discordId,
                    discordUsername,
                    email,
                    accountNumber: finalAccountNumber,
                    fullName: fullName || `${firstName} ${lastName}`,
                    firstName,
                    lastName,
                    points: 5, // START WITH 5 POINTS
                    robloxUsername: robloxUsername || '',
                    memberSince: memberSince || new Date().toISOString()
                };

                // Save to Google Sheets directly
                const spreadsheetId = env.SPREADSHEET_ID;
                const sheetsApiKey = env.GOOGLE_SHEETS_API_KEY;
                
                if (spreadsheetId && sheetsApiKey) {
                    await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1:append?valueInputOption=RAW&key=${sheetsApiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                values: [[
                                    discordId,
                                    discordUsername,
                                    email,
                                    finalAccountNumber,
                                    newUserData.fullName,
                                    5, // Initial points
                                    robloxUsername || '',
                                    memberSince || new Date().toISOString()
                                ]]
                            })
                        }
                    );
                }

                // Also save to KV for caching
                await env.USERS_KV?.put(`user:${discordId}`, JSON.stringify(newUserData));

                // Send welcome DM
                const botToken = env.DISCORD_BOT_TOKEN;
                if (botToken) {
                    try {
                        // Create DM channel
                        const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ recipient_id: discordId })
                        });
                        const channel = await channelResponse.json();

                        // Send welcome DM with account details
                        await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                embeds: [{
                                    title: '🎉 Welcome to MyCirkle!',
                                    description: `Hi **${firstName}**! Your loyalty account has been created successfully.`,
                                    color: 0x00D9FF,
                                    fields: [
                                        { name: '📧 Email', value: email || 'Not provided', inline: true },
                                        { name: '🎮 Roblox', value: robloxUsername || 'Not linked', inline: true },
                                        { name: '🔢 Account Number', value: `\`${finalAccountNumber}\``, inline: false },
                                        { name: '⭐ Points Balance', value: '**5 points** (Welcome Bonus!)', inline: true },
                                        { name: '🎁 Tier', value: 'Bronze', inline: true },
                                        { name: '📅 Member Since', value: new Date().toLocaleDateString(), inline: true }
                                    ],
                                    footer: { text: 'Keep this information safe!' },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                    } catch (dmError) {
                        console.error('DM error:', dmError);
                    }
                }

                // Send public welcome message to channel with user's profile photo
                const welcomeChannelWebhook = 'https://discord.com/api/webhooks/1436827145438629889/mWIgNNaADaZ5GLzD1IPxuGEFm_SXMMKfkSphTAI0LVrHiGGBvtSoEFfSA1Z51rV_boG8';
                try {
                    // Fetch user's Discord data to get avatar
                    const userResponse = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
                        headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}` }
                    });
                    const discordUser = await userResponse.json();
                    
                    const avatarUrl = discordUser.avatar 
                        ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png?size=256`
                        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`;
                    
                    await fetch(welcomeChannelWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: `🎊 Everyone, please welcome <@${discordId}>!`,
                            embeds: [{
                                title: `� ${firstName} joined MyCirkle!`,
                                description: `✨ **${firstName}** has joined the MyCirkle loyalty program and earned **5 welcome points**!\n\n💎 Start earning points and redeem amazing rewards!`,
                                color: 0x00D9FF,
                                thumbnail: {
                                    url: avatarUrl
                                },
                                fields: [
                                    { name: '🎁 Welcome Bonus', value: '5 Points', inline: true },
                                    { name: '🏆 Starting Tier', value: 'Bronze', inline: true },
                                    { name: '📅 Joined', value: new Date().toLocaleDateString(), inline: true }
                                ],
                                footer: { text: '🌟 MyCirkle Loyalty Program' },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (welcomeError) {
                    console.error('Welcome channel error:', welcomeError);
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

        // API: Send verification code via Discord DM
        if (path === '/api/send-verification' && request.method === 'POST') {
            try {
                const { discordId, code, action } = await request.json();
                const botToken = env.DISCORD_BOT_TOKEN;
                
                if (!botToken) {
                    return jsonResponse({ error: 'Bot not configured' }, 500, corsHeaders);
                }

                // Create DM channel
                const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ recipient_id: discordId })
                });

                const channel = await channelResponse.json();

                // Send verification code
                await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            title: '🔐 MyCirkle Verification Code',
                            description: `Your verification code for **${action}**:`,
                            color: 0x5865F2,
                            fields: [{
                                name: 'Code',
                                value: `\`\`\`${code}\`\`\``,
                                inline: false
                            }],
                            footer: { text: 'This code expires in 10 minutes. Do not share it with anyone.' },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });

                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                console.error('Verification code error:', error);
                return jsonResponse({ error: 'Failed to send code' }, 500, corsHeaders);
            }
        }

        // API: Delete account
        if (path === '/api/delete-account' && request.method === 'DELETE') {
            try {
                const { discordId, accountId } = await request.json();
                const botToken = env.DISCORD_BOT_TOKEN;
                const spreadsheetId = env.SPREADSHEET_ID;
                const sheetsApiKey = env.GOOGLE_SHEETS_API_KEY;

                // Delete from Google Sheets
                if (spreadsheetId && sheetsApiKey) {
                    try {
                        const getResponse = await fetch(
                            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1?key=${sheetsApiKey}`
                        );
                        const data = await getResponse.json();
                        const rows = data.values || [];
                        
                        // Find row index
                        let rowIndex = -1;
                        for (let i = 1; i < rows.length; i++) {
                            if (rows[i][0] === discordId || rows[i][3] === accountId) {
                                rowIndex = i;
                                break;
                            }
                        }

                        if (rowIndex > 0) {
                            // Clear the row
                            await fetch(
                                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A${rowIndex + 1}:Z${rowIndex + 1}:clear?key=${sheetsApiKey}`,
                                { method: 'POST' }
                            );
                        }
                    } catch (err) {
                        console.error('Sheets deletion error:', err);
                    }
                }

                // Send goodbye DM
                if (botToken && discordId) {
                    try {
                        const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ recipient_id: discordId })
                        });

                        const channel = await channelResponse.json();

                        await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                embeds: [{
                                    title: '👋 Goodbye from MyCirkle',
                                    description: 'Your account has been successfully deleted.',
                                    color: 0xf59e0b,
                                    fields: [{
                                        name: 'We\'ll miss you!',
                                        value: 'Thank you for being part of our loyalty program. We hope to see you again soon! ✨',
                                        inline: false
                                    }],
                                    footer: { text: 'Your data has been permanently erased from our systems.' },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                    } catch (err) {
                        console.error('Goodbye DM error:', err);
                    }
                }

                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                console.error('Delete account error:', error);
                return jsonResponse({ error: 'Failed to delete account' }, 500, corsHeaders);
            }
        }

        // API: Send welcome DM
        if (path === '/api/welcome-dm' && request.method === 'POST') {
            try {
                const { discordId, name } = await request.json();
                const botToken = env.DISCORD_BOT_TOKEN;
                
                if (!botToken) {
                    return jsonResponse({ error: 'Bot not configured' }, 500, corsHeaders);
                }

                const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ recipient_id: discordId })
                });

                const channel = await channelResponse.json();

                await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            title: `🎉 Welcome to MyCirkle, ${name}!`,
                            description: 'Thank you for joining our exclusive loyalty program!',
                            color: 0x10b981,
                            fields: [
                                {
                                    name: '✨ You\'ve been awarded 5 starter points!',
                                    value: 'Start earning more by making purchases and engaging with our community.',
                                    inline: false
                                },
                                {
                                    name: '🎁 What you can do:',
                                    value: '• Earn points with every purchase\n• Redeem exclusive rewards\n• Track your progress\n• Access member-only perks',
                                    inline: false
                                }
                            ],
                            footer: { text: 'We\'ll notify you about special offers and updates here!' },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });

                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                console.error('Welcome DM error:', error);
                return jsonResponse({ error: 'Failed to send welcome' }, 500, corsHeaders);
            }
        }

        // API: Bot configuration (GET)
        if (path === '/api/bot-config' && request.method === 'GET') {
            try {
                const config = await env.BOT_CONFIG_KV?.get('bot-config', { type: 'json' });
                return jsonResponse(config || {
                    botPower: true,
                    currentStatus: 'MyCirkle Loyalty',
                    rotationEnabled: false,
                    rotationInterval: 60,
                    statusList: ['Watching MyCirkle Loyalty', 'Playing with loyalty cards', 'Listening to member feedback'],
                    activityType: 3
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to fetch config' }, 500, corsHeaders);
            }
        }

        // API: Bot configuration (POST - requires admin password)
        if (path === '/api/bot-config' && request.method === 'POST') {
            try {
                const authHeader = request.headers.get('Authorization');
                const adminPassword = env.ADMIN_PASSWORD || 'mycirkle2025'; // Set this in secrets!
                
                if (authHeader !== adminPassword) {
                    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
                }

                const config = await request.json();
                await env.BOT_CONFIG_KV?.put('bot-config', JSON.stringify(config));
                
                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to save config' }, 500, corsHeaders);
            }
        }

        // API: Bot status check
        if (path === '/api/bot-status' && request.method === 'GET') {
            try {
                const lastHeartbeat = await env.BOT_CONFIG_KV?.get('bot-last-heartbeat');
                const isOnline = lastHeartbeat && (Date.now() - parseInt(lastHeartbeat)) < 60000; // Within last minute
                
                return jsonResponse({
                    online: isOnline,
                    lastSeen: lastHeartbeat ? new Date(parseInt(lastHeartbeat)).toISOString() : null
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ online: false }, 200, corsHeaders);
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
    // Generate 24-digit numeric account number
    let accountNumber = '';
    for (let i = 0; i < 24; i++) {
        accountNumber += Math.floor(Math.random() * 10);
    }
    // Format as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
    return accountNumber.match(/.{1,4}/g).join('-');
}

// Discord Interactions Handler
async function handleDiscordInteraction(request, env) {
    const PUBLIC_KEY = '5a0d5985e6ab8109293d10230a99659dbb05587e24b69b72221abfcf3be57d44';
    
    // Verify Discord signature
    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const body = await request.text();

    const isValid = await verifyDiscordSignature(signature, timestamp, body, PUBLIC_KEY);
    
    if (!isValid) {
        return new Response('Invalid signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Handle PING
    if (interaction.type === 1) {
        return jsonResponse({ type: 1 });
    }

    // Handle slash commands
    if (interaction.type === 2) {
        const command = interaction.data.name;
        const userId = interaction.member?.user?.id || interaction.user?.id;
        const options = interaction.data.options || [];
        
        // Check if user is admin for admin commands
        const adminCommands = ['givepoints', 'deductpoints', 'process', 'dailyreward'];
        if (adminCommands.includes(command)) {
            const isAdmin = await checkAdminRole(interaction.member, env);
            if (!isAdmin) {
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ You do not have permission to use this command. Admin role required.',
                        flags: 64
                    }
                });
            }
        }

        switch (command) {
            case 'balance':
                const targetUser = options.find(opt => opt.name === 'user')?.value;
                return handleBalanceCommand(targetUser || userId, env);
            
            case 'leaderboard':
                return handleLeaderboardCommand(env);
            
            case 'givepoints':
                return handleGivePointsCommand(interaction, env);
            
            case 'deductpoints':
                return handleDeductPointsCommand(interaction, env);
            
            case 'process':
                return handleProcessCommand(interaction, env);
            
            case 'dailyreward':
                return handleDailyRewardCommand(interaction, env);
            
            default:
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Unknown command',
                        flags: 64
                    }
                });
        }
    }

    return jsonResponse({ type: 4, data: { content: 'Unknown interaction type' } });
}

async function verifyDiscordSignature(signature, timestamp, body, publicKey) {
    try {
        const encoder = new TextEncoder();
        const message = encoder.encode(timestamp + body);
        
        const keyData = hexToUint8Array(publicKey);
        const sigData = hexToUint8Array(signature);
        
        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'Ed25519' },
            false,
            ['verify']
        );
        
        return await crypto.subtle.verify('Ed25519', key, sigData, message);
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

function hexToUint8Array(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// Admin check helper
async function checkAdminRole(member, env) {
    if (!member || !member.roles) return false;
    
    // Check if user has admin/moderator role
    // You can configure admin role IDs in environment variables
    const adminRoleId = env.ADMIN_ROLE_ID; // Set this in Cloudflare secrets
    
    if (adminRoleId && member.roles.includes(adminRoleId)) {
        return true;
    }
    
    // Also check for Administrator permission
    const permissions = parseInt(member.permissions || '0');
    const ADMINISTRATOR = 0x8;
    return (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}

// Get user data from Google Sheets (fix for "not linked" issue)
async function getUserData(discordId, env) {
    try {
        // First try KV store
        let userData = await env.USERS_KV?.get(`user:${discordId}`, { type: 'json' });
        
        if (userData) {
            return userData;
        }
        
        // Fall back to Google Sheets
        const spreadsheetId = env.SPREADSHEET_ID;
        const sheetsApiKey = env.GOOGLE_SHEETS_API_KEY;
        
        if (!spreadsheetId || !sheetsApiKey) {
            return null;
        }
        
        const getResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1?key=${sheetsApiKey}`
        );
        const data = await getResponse.json();
        const rows = data.values || [];
        
        // Find user in sheets (Discord ID is in first column)
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === discordId) {
                // Parse user data from sheet
                userData = {
                    discordId: rows[i][0],
                    discordUsername: rows[i][1],
                    email: rows[i][2],
                    accountNumber: rows[i][3],
                    fullName: rows[i][4],
                    points: parseInt(rows[i][5]) || 0,
                    robloxUsername: rows[i][6],
                    memberSince: rows[i][7]
                };
                
                // Cache in KV
                await env.USERS_KV?.put(`user:${discordId}`, JSON.stringify(userData));
                return userData;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
    }
}

// Save user data to both KV and Google Sheets
async function saveUserData(userData, env) {
    try {
        // Save to KV
        await env.USERS_KV?.put(`user:${userData.discordId}`, JSON.stringify(userData));
        
        // Update Google Sheets
        const spreadsheetId = env.SPREADSHEET_ID;
        const sheetsApiKey = env.GOOGLE_SHEETS_API_KEY;
        
        if (spreadsheetId && sheetsApiKey) {
            const getResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1?key=${sheetsApiKey}`
            );
            const data = await getResponse.json();
            const rows = data.values || [];
            
            // Find row to update
            let rowIndex = -1;
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] === userData.discordId) {
                    rowIndex = i + 1; // +1 for 1-based index
                    break;
                }
            }
            
            if (rowIndex > 0) {
                // Update the row
                await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A${rowIndex}:H${rowIndex}?valueInputOption=RAW&key=${sheetsApiKey}`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            values: [[
                                userData.discordId,
                                userData.discordUsername,
                                userData.email,
                                userData.accountNumber,
                                userData.fullName,
                                userData.points,
                                userData.robloxUsername,
                                userData.memberSince
                            ]]
                        })
                    }
                );
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error saving user data:', error);
        return false;
    }
}

// Command Handlers
async function handleBalanceCommand(userId, env) {
    try {
        const userData = await getUserData(userId, env);
        
        if (!userData) {
            return jsonResponse({
                type: 4,
                data: {
                    embeds: [{
                        title: '❌ Account Not Found',
                        description: 'This user doesn\'t have a MyCirkle account yet!\n\nSign up at https://my.cirkledevelopment.co.uk',
                        color: 0xef4444
                    }],
                    flags: 64
                }
            });
        }

        const points = userData.points || 0;
        const tier = points < 100 ? '🥉 Bronze' : points < 500 ? '🥈 Silver' : '🥇 Gold';

        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: `💰 ${userData.fullName || userData.discordUsername}'s Balance`,
                    color: 0x10b981,
                    fields: [
                        { name: '⭐ Points', value: `**${points}** points`, inline: true },
                        { name: '🎯 Tier', value: tier, inline: true },
                        { name: '📈 Next Tier', value: points < 100 ? 'Silver at 100 pts' : points < 500 ? 'Gold at 500 pts' : 'Max tier!', inline: false }
                    ],
                    footer: { text: 'Use /rewards to see what you can redeem!' }
                }]
            }
        });
    } catch (error) {
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error fetching balance',
                flags: 64
            }
        });
    }
}

async function handleCardCommand(userId, env) {
    try {
        const userData = await env.USERS_KV?.get(`user:${userId}`, { type: 'json' });
        
        if (!userData) {
            return jsonResponse({
                type: 4,
                data: {
                    content: '❌ No account found. Sign up at https://my.cirkledevelopment.co.uk',
                    flags: 64
                }
            });
        }

        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '💳 Your MyCirkle Loyalty Card',
                    description: `View your full card at https://my.cirkledevelopment.co.uk`,
                    color: 0x5865F2,
                    fields: [
                        { name: '👤 Name', value: userData.fullName || 'Member', inline: true },
                        { name: '🔢 Account', value: userData.accountNumber || 'N/A', inline: true },
                        { name: '⭐ Points', value: `${userData.points || 0}`, inline: true },
                        { name: '📅 Member Since', value: userData.memberSince?.split('T')[0] || 'Unknown', inline: true }
                    ]
                }]
            }
        });
    } catch (error) {
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error fetching card',
                flags: 64
            }
        });
    }
}

async function handleRewardsCommand() {
    return jsonResponse({
        type: 4,
        data: {
            embeds: [{
                title: '🎁 Available Rewards',
                description: 'Redeem your points for exclusive rewards!',
                color: 0xf59e0b,
                fields: [
                    { name: '🎮 Roblox Item (50 pts)', value: 'Exclusive in-game item', inline: false },
                    { name: '💎 Premium Badge (100 pts)', value: 'Special Discord role', inline: false },
                    { name: '🎉 Mystery Box (200 pts)', value: 'Random premium reward', inline: false },
                    { name: '👑 VIP Access (500 pts)', value: 'Lifetime VIP status', inline: false }
                ],
                footer: { text: 'Use /redeem <reward-name> to claim!' }
            }]
        }
    });
}

async function handleRedeemCommand(userId, reward, env) {
    try {
        const userData = await env.USERS_KV?.get(`user:${userId}`, { type: 'json' });
        
        if (!userData) {
            return jsonResponse({
                type: 4,
                data: {
                    content: '❌ No account found',
                    flags: 64
                }
            });
        }

        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '🎁 Redeem Rewards',
                    description: 'Visit https://my.cirkledevelopment.co.uk to redeem rewards!\n\nYou can browse all available rewards and redeem them with your points.',
                    color: 0x10b981,
                    fields: [
                        { name: '⭐ Your Points', value: `${userData.points || 0} points`, inline: true }
                    ]
                }]
            }
        });
    } catch (error) {
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error processing redemption',
                flags: 64
            }
        });
    }
}

async function handleHistoryCommand(userId, env) {
    return jsonResponse({
        type: 4,
        data: {
            embeds: [{
                title: '📜 Points History',
                description: 'View your complete transaction history at https://my.cirkledevelopment.co.uk',
                color: 0x6366f1,
                fields: [
                    { name: '💡 Tip', value: 'Your full transaction history with detailed breakdowns is available on the website dashboard.', inline: false }
                ]
            }]
        }
    });
}

async function handleProfileCommand(userId, env) {
    try {
        const userData = await env.USERS_KV?.get(`user:${userId}`, { type: 'json' });
        
        if (!userData) {
            return jsonResponse({
                type: 4,
                data: {
                    content: '❌ No account found. Sign up at https://my.cirkledevelopment.co.uk',
                    flags: 64
                }
            });
        }

        const tier = userData.points < 100 ? '🥉 Bronze' : userData.points < 500 ? '🥈 Silver' : '🥇 Gold';

        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '👤 Your MyCirkle Profile',
                    color: 0x5865F2,
                    fields: [
                        { name: '📛 Name', value: userData.fullName || 'Member', inline: true },
                        { name: '📧 Email', value: userData.email || 'Not set', inline: true },
                        { name: '⭐ Points', value: `${userData.points || 0}`, inline: true },
                        { name: '🎯 Tier', value: tier, inline: true },
                        { name: '🎮 Roblox', value: userData.robloxUsername || 'Not linked', inline: true },
                        { name: '📅 Member Since', value: userData.memberSince?.split('T')[0] || 'Unknown', inline: true }
                    ],
                    footer: { text: 'Manage your profile at my.cirkledevelopment.co.uk' }
                }]
            }
        });
    } catch (error) {
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error fetching profile',
                flags: 64
            }
        });
    }
}

async function handleHelpCommand() {
    return jsonResponse({
        type: 4,
        data: {
            embeds: [{
                title: '❓ MyCirkle Bot Help',
                description: 'Here are all available commands:',
                color: 0x5865F2,
                fields: [
                    { name: '/balance', value: 'Check your points balance', inline: false },
                    { name: '/card', value: 'View your loyalty card details', inline: false },
                    { name: '/rewards', value: 'Browse available rewards', inline: false },
                    { name: '/redeem', value: 'Redeem a reward', inline: false },
                    { name: '/history', value: 'View your transaction history', inline: false },
                    { name: '/profile', value: 'View your account profile', inline: false },
                    { name: '/leaderboard', value: 'See top members', inline: false },
                    { name: '/help', value: 'Show this help message', inline: false }
                ],
                footer: { text: 'Visit my.cirkledevelopment.co.uk for full features!' }
            }]
        }
    });
}

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

