// cloudflare/worker.js - MyCirkle Loyalty Program Backend - UPDATED
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
                // Add delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                    },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: workerCallbackUrl
                    })
                });

                // Check for rate limit headers
                const rateLimitRemaining = tokenResponse.headers.get('X-RateLimit-Remaining');
                const rateLimitReset = tokenResponse.headers.get('X-RateLimit-Reset');
                
                if (tokenResponse.status === 429) {
                    const retryAfter = tokenResponse.headers.get('Retry-After');
                    return jsonResponse({ 
                        error: 'Rate limited', 
                        details: `Too many requests. Please wait ${retryAfter || '10'} seconds.`,
                        retryAfter: retryAfter || '10'
                    }, 429, corsHeaders);
                }

                // Handle non-JSON responses
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

                // Add another small delay before user fetch
                await new Promise(resolve => setTimeout(resolve, 50));

                const userResponse = await fetch('https://discord.com/api/users/@me', {
                    headers: { 
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                    }
                });
                
                if (userResponse.status === 429) {
                    // If rate limited on user fetch, use cached data or return error
                    return jsonResponse({ 
                        error: 'Rate limited', 
                        details: 'Too many login attempts. Please wait a moment and try again.'
                    }, 429, corsHeaders);
                }
                
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
            
            // If guild check is not configured, allow access
            if (!guildId || !botToken) {
                return jsonResponse({ 
                    isMember: true, 
                    note: 'Guild check not configured, access granted' 
                }, 200, corsHeaders);
            }

            try {
                // Add delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const memberResponse = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
                    headers: { 
                        'Authorization': `Bot ${botToken}`,
                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                    }
                });
                
                // Check for rate limit
                if (memberResponse.status === 429) {
                    // If rate limited, allow access (fail open)
                    return jsonResponse({ 
                        isMember: true,
                        note: 'Rate limited, access granted as precaution'
                    }, 200, corsHeaders);
                }
                
                // If user not found, they're not in the server
                if (memberResponse.status === 404) {
                    return jsonResponse({ 
                        isMember: false,
                        error: 'You must be a member of the Cirkle Development Discord server to use MyCirkle.',
                        guildId: guildId
                    }, 200, corsHeaders);
                }
                
                // If forbidden, bot doesn't have permission - allow access anyway
                if (memberResponse.status === 403) {
                    return jsonResponse({ 
                        isMember: true,
                        note: 'Bot permission issue, access granted'
                    }, 200, corsHeaders);
                }
                
                const member = await memberResponse.json();
                return jsonResponse({ 
                    isMember: !!member.user,
                    username: member.user?.username 
                }, 200, corsHeaders);
            } catch (error) {
                // On error, allow access (fail open)
                return jsonResponse({ 
                    isMember: true, 
                    note: 'Membership check failed, access granted',
                    error: error.message 
                }, 200, corsHeaders);
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

                // Check if user already exists
                const existingUser = await getUserData(discordId, env);
                if (existingUser) {
                    return jsonResponse({ 
                        success: true,
                        message: 'Welcome back!',
                        user: existingUser,
                        isExisting: true
                    }, 200, corsHeaders);
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
                        // Add delay to prevent rate limiting
                        await new Promise(resolve => setTimeout(resolve, 150));
                        
                        // Create DM channel
                        const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json',
                                'User-Agent': 'MyCirkle-Loyalty/1.0'
                            },
                            body: JSON.stringify({ recipient_id: discordId })
                        });
                        
                        if (channelResponse.status === 429) {
                            // Rate limited, skip DM (user can still use the service)
                            console.log('Rate limited on DM channel creation, skipping welcome DM');
                        } else {
                            const channel = await channelResponse.json();

                            // Add small delay before sending message
                            await new Promise(resolve => setTimeout(resolve, 50));

                            // Send welcome DM with account details
                            const dmResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${botToken}`,
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'MyCirkle-Loyalty/1.0'
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
                            
                            if (dmResponse.status === 429) {
                                console.log('Rate limited on DM send, welcome message not sent');
                            }
                        }
                    } catch (dmError) {
                        console.error('DM error:', dmError);
                    }
                }

                // Send public welcome message to channel with user's profile photo
                const welcomeChannelWebhook = 'https://discord.com/api/webhooks/1436827145438629889/mWIgNNaADaZ5GLzD1IPxuGEFm_SXMMKfkSphTAI0LVrHiGGBvtSoEFfSA1Z51rV_boG8';
                try {
                    // Add delay to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Fetch user's Discord data to get avatar
                    const userResponse = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
                        headers: { 
                            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                            'User-Agent': 'MyCirkle-Loyalty/1.0'
                        }
                    });
                    
                    let avatarUrl = `https://cdn.discordapp.com/embed/avatars/0.png`; // Default avatar
                    
                    if (userResponse.status === 429) {
                        // Rate limited, use default avatar
                        console.log('Rate limited on user fetch, using default avatar');
                    } else if (userResponse.ok) {
                        const discordUser = await userResponse.json();
                        avatarUrl = discordUser.avatar 
                            ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png?size=256`
                            : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`;
                    }
                    
                    // Add small delay before webhook
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    await fetch(welcomeChannelWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: `🎊 Everyone, please welcome <@${discordId}>!`,
                            embeds: [{
                                title: `🌟 ${firstName} joined MyCirkle!`,
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

                // Send welcome email if they accepted marketing
                if (acceptedMarketing && email) {
                    try {
                        console.log('Sending welcome email to:', email, 'Name:', fullName);
                        await sendWelcomeEmail(env, email, firstName, finalAccountNumber, 5);
                        
                        // Add to Resend mailing list
                        console.log('Adding to mailing list:', email);
                        await addToMailingList(env, email, firstName, lastName);
                        
                        // Log to email dashboard (KV storage)
                        console.log('Logging to email dashboard:', email, fullName);
                        await logEmailToDashboard(env, email, fullName || `${firstName} ${lastName}`, 'signup');
                        
                        // Send marketing webhook notification
                        const marketingWebhook = 'https://discord.com/api/webhooks/1437082041194778754/5iiSF3_4XND_ftVDb3widQlaQ3VwkKS384hWHfnJXCDyjoafJ9L-Bo6CcE4DKtdwOgjU';
                        await fetch(marketingWebhook, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                embeds: [{
                                    title: '📧 New Marketing Signup',
                                    description: `**${firstName} ${lastName}** has signed up for marketing emails!`,
                                    color: 0x10b981,
                                    fields: [
                                        { name: '📧 Email', value: email, inline: true },
                                        { name: '👤 Name', value: `${firstName} ${lastName}`, inline: true },
                                        { name: '📅 Date', value: new Date().toLocaleString(), inline: false }
                                    ],
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                        console.log('Marketing email setup completed successfully');
                    } catch (emailError) {
                        console.error('Welcome email/marketing error:', emailError);
                    }
                } else {
                    console.log('Skipping marketing emails - acceptedMarketing:', acceptedMarketing, 'email:', email);
                }
                
                // Send account creation webhook
                const accountWebhook = 'https://discord.com/api/webhooks/1436826449150742679/P7Z3v2HpDpZxINW8OWF5YDM4_MJRtSYDpWcgK_yOu2JcW63JJVVmWNPi62f5vYRy_xLI';
                try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    const webhookResponse = await fetch(accountWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '🆕 New Account Created',
                                description: `**${firstName} ${lastName}** just created a MyCirkle account!`,
                                color: 0x3b82f6,
                                fields: [
                                    { name: '👤 Discord', value: `<@${discordId}>`, inline: true },
                                    { name: '📧 Email', value: email || 'Not provided', inline: true },
                                    { name: '🔢 Account Number', value: `\`${finalAccountNumber}\``, inline: false },
                                    { name: '⭐ Starting Points', value: '5 points', inline: true },
                                    { name: '📬 Marketing Emails', value: acceptedMarketing ? 'Yes ✅' : 'No ❌', inline: true }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                    
                    if (!webhookResponse.ok) {
                        const errorText = await webhookResponse.text();
                        console.error('Account webhook failed:', webhookResponse.status, errorText);
                    }
                } catch (webhookError) {
                    console.error('Account webhook error:', webhookError);
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

        // API: Redeem reward
        if (path === '/api/redeem' && request.method === 'POST') {
            try {
                const { discordId, rewardType, pointsCost } = await request.json();
                
                if (!discordId || !rewardType || !pointsCost) {
                    return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
                }

                // Get user data
                const userData = await getUserData(discordId, env);
                if (!userData) {
                    return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                }

                // Check if user has enough points
                if (userData.points < pointsCost) {
                    return jsonResponse({ error: 'Insufficient points', currentPoints: userData.points, required: pointsCost }, 400, corsHeaders);
                }

                // Deduct points
                userData.points -= pointsCost;
                await saveUserData(userData, env);

                // Generate redemption code
                const code = generateRedemptionCode();

                // Log to redemption webhook
                const redemptionWebhook = env.REDEMPTION_WEBHOOK || 'https://discord.com/api/webhooks/1436826526883647569/mpdU8WILa-zH7hd3AI9wN6g2hUmNerpXbcq0WKzQeAEAL3A2MosB-56jvCRZtdYUPgGR';
                try {
                    await fetch(redemptionWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '🎁 Reward Redeemed',
                                description: `<@${discordId}> redeemed **${rewardType}**!`,
                                color: 0x10b981,
                                fields: [
                                    { name: '👤 User', value: `<@${discordId}>`, inline: true },
                                    { name: '🎁 Reward', value: rewardType, inline: true },
                                    { name: '💰 Points Spent', value: `${pointsCost} points`, inline: true },
                                    { name: '📊 Remaining Balance', value: `${userData.points} points`, inline: true },
                                    { name: '🎫 Redemption Code', value: `\`${code}\``, inline: false }
                                ],
                                footer: { text: '🎉 Redemption Activity' },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (webhookError) {
                    console.error('Webhook error:', webhookError);
                }

                return jsonResponse({ 
                    success: true, 
                    code,
                    newPoints: userData.points
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Redemption failed', details: error.message }, 500, corsHeaders);
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
                const { discordId, action } = await request.json();
                const botToken = env.DISCORD_BOT_TOKEN;
                
                if (!botToken) {
                    return jsonResponse({ error: 'Bot not configured' }, 500, corsHeaders);
                }
                
                if (!discordId || !action) {
                    return jsonResponse({ error: 'Missing discordId or action' }, 400, corsHeaders);
                }

                // Generate 6-digit code
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                
                // Store code in KV with 10 minute expiration
                const verificationKey = `verify:${discordId}:${action}`;
                await env.USERS_KV?.put(verificationKey, code, { expirationTtl: 600 }); // 10 minutes

                // Add delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 150));

                // Create DM channel
                const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                    },
                    body: JSON.stringify({ recipient_id: discordId })
                });
                
                if (channelResponse.status === 429) {
                    return jsonResponse({ error: 'Rate limited. Please try again in a moment.' }, 429, corsHeaders);
                }

                const channel = await channelResponse.json();

                // Add small delay before sending message
                await new Promise(resolve => setTimeout(resolve, 50));

                // Send verification code with action in message
                const dmResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            title: '🔐 MyCirkle Verification Code',
                            description: `Your verification code for **${action || 'verification'}**:`,
                            color: 0x5865F2,
                            fields: [{
                                name: 'Verification Code',
                                value: `\`\`\`\n${code}\n\`\`\``,
                                inline: false
                            }],
                            footer: { text: 'This code expires in 10 minutes. Do not share it with anyone.' },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });
                
                if (dmResponse.status === 429) {
                    return jsonResponse({ error: 'Rate limited sending DM. Code saved, please wait and try again.' }, 429, corsHeaders);
                }

                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                console.error('Verification code error:', error);
                return jsonResponse({ error: 'Failed to send code' }, 500, corsHeaders);
            }
        }

        // API: Verify code
        if (path === '/api/verify-code' && request.method === 'POST') {
            try {
                const { discordId, action, code } = await request.json();
                
                if (!discordId || !action || !code) {
                    return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
                }

                // Get stored code from KV
                const verificationKey = `verify:${discordId}:${action}`;
                const storedCode = await env.USERS_KV?.get(verificationKey);
                
                if (!storedCode) {
                    return jsonResponse({ 
                        success: false, 
                        error: 'Verification code expired or not found. Please request a new code.' 
                    }, 400, corsHeaders);
                }
                
                if (storedCode !== code.trim()) {
                    return jsonResponse({ 
                        success: false, 
                        error: 'Invalid verification code. Please check and try again.' 
                    }, 400, corsHeaders);
                }
                
                // Code is valid, delete it so it can't be reused
                await env.USERS_KV?.delete(verificationKey);
                
                return jsonResponse({ success: true, message: 'Code verified successfully' }, 200, corsHeaders);
            } catch (error) {
                console.error('Verification error:', error);
                return jsonResponse({ error: 'Verification failed', details: error.message }, 500, corsHeaders);
            }
        }

        // API: Delete account
        if (path === '/api/delete-account' && request.method === 'DELETE') {
            try {
                const { discordId, accountId, verificationCode } = await request.json();
                
                // Verify the code first
                if (!verificationCode) {
                    return jsonResponse({ error: 'Verification code required' }, 400, corsHeaders);
                }
                
                const verificationKey = `verify:${discordId}:account deletion`;
                const storedCode = await env.USERS_KV?.get(verificationKey);
                
                if (!storedCode || storedCode !== verificationCode.trim()) {
                    return jsonResponse({ error: 'Invalid or expired verification code' }, 400, corsHeaders);
                }
                
                // Delete the verification code
                await env.USERS_KV?.delete(verificationKey);
                
                // GET USER DATA BEFORE DELETION to access email
                const userKvKey = `user:${discordId}`;
                const userData = await env.USERS_KV?.get(userKvKey, { type: 'json' });
                const userEmail = userData?.email;
                const userFirstName = userData?.firstName;
                
                // DELETE USER DATA FROM KV - THIS IS CRITICAL!
                await env.USERS_KV?.delete(userKvKey);
                console.log(`🗑️ Deleted user data from KV: ${userKvKey}`);
                
                // Remove from mailing list if they have an email
                if (userEmail) {
                    try {
                        await removeFromMailingList(env, userEmail);
                        console.log(`📧 Removed from mailing list: ${userEmail}`);
                    } catch (err) {
                        console.error('Mailing list removal error:', err);
                    }
                }
                
                // Remove from email history dashboard
                if (userEmail) {
                    try {
                        await removeFromEmailHistory(env, userEmail);
                        console.log(`📊 Removed from email history: ${userEmail}`);
                    } catch (err) {
                        console.error('Email history removal error:', err);
                    }
                }
                
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

        // Admin Email Endpoints
        if (path === '/api/admin/send-email' && request.method === 'POST') {
            try {
                const { recipients, subject, message, adminKey } = await request.json();
                
                // Verify admin key
                if (adminKey !== env.ADMIN_KEY) {
                    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
                }

                // Get all users from Google Sheets
                const users = await getAllUsers(env);
                
                // Filter recipients
                let targetUsers = [];
                const now = Date.now();
                
                switch (recipients) {
                    case 'all':
                        targetUsers = users;
                        break;
                    case 'active':
                        // Users who logged in last 30 days (we'll send to all for now)
                        targetUsers = users;
                        break;
                    case 'high-points':
                        targetUsers = users.filter(u => (u.points || 0) >= 500);
                        break;
                    case 'new':
                        // Users who joined last 7 days
                        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
                        targetUsers = users.filter(u => {
                            const joinedDate = new Date(u.memberSince).getTime();
                            return joinedDate >= sevenDaysAgo;
                        });
                        break;
                    case 'test':
                        // Send only to first user or admin
                        targetUsers = users.slice(0, 1);
                        break;
                    default:
                        targetUsers = users;
                }

                if (targetUsers.length === 0) {
                    return jsonResponse({ error: 'No recipients found' }, 400, corsHeaders);
                }

                // Send emails via Resend
                const sent = await sendBulkEmails(env, targetUsers, subject, message);
                
                // Log to history
                await logEmailHistory(env, {
                    recipients,
                    subject,
                    sent: sent.length,
                    timestamp: new Date().toISOString()
                });

                return jsonResponse({ 
                    success: true, 
                    sent: sent.length,
                    failed: targetUsers.length - sent.length
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        if (path === '/api/admin/email-stats' && request.method === 'GET') {
            try {
                const users = await getAllUsers(env);
                const emailsToday = await getEmailsSentToday(env);
                
                return jsonResponse({
                    totalMembers: users.length,
                    emailsToday
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        if (path === '/api/admin/email-history' && request.method === 'GET') {
            try {
                const history = await getEmailHistory(env);
                return jsonResponse({ emails: history }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Transactional Emails (Welcome, Account Deletion)
        if (path === '/api/email/welcome' && request.method === 'POST') {
            try {
                const { email, firstName, accountNumber, points } = await request.json();
                await sendWelcomeEmail(env, email, firstName, accountNumber, points);
                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: error.message }, 500, corsHeaders);
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

function generateRedemptionCode() {
    // Generate redemption code in format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (numbers only)
    let code = '';
    for (let i = 0; i < 24; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += Math.floor(Math.random() * 10);
    }
    return code;
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


// ===== EMAIL FUNCTIONS =====

// Send bulk emails via Resend
async function sendBulkEmails(env, users, subject, message) {
    const sent = [];
    
    for (const user of users) {
        try {
            const personalizedMessage = message
                .replace(/{{firstName}}/g, user.fullName?.split(' ')[0] || 'Friend')
                .replace(/{{points}}/g, user.points || 5);
            
            const personalizedSubject = subject
                .replace(/{{firstName}}/g, user.fullName?.split(' ')[0] || 'Friend')
                .replace(/{{points}}/g, user.points || 5);
            
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'MyCirkle <mycirkle@cirkledevelopment.co.uk>',
                    to: [user.email],
                    subject: personalizedSubject,
                    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;"><h1 style="color: white; margin: 0;">MyCirkle</h1></div><div style="padding: 30px; background: #f9fafb;"><div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${personalizedMessage.split('\n').map(line => `<p style="color: #374151; line-height: 1.6;">${line}</p>`).join('')}</div></div><div style="background: #1f2937; padding: 20px; text-align: center;"><p style="color: #9ca3af; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} Cirkle Development. All rights reserved.</p></div></div>`
                })
            });
            
            if (response.ok) sent.push(user.email);
        } catch (error) {
            console.error(`Failed to send to ${user.email}:`, error);
        }
    }
    
    return sent;
}

// Send welcome email
async function sendWelcomeEmail(env, email, firstName, accountNumber, points) {
    const headerImageUrl = 'https://i.postimg.cc/hPdGLf78/cirkledevtest.png'; // MyCirkle header image
    
    // Use verified domain or fallback to onboarding@resend.dev for testing
    const fromEmail = env.RESEND_VERIFIED_DOMAIN 
        ? `MyCirkle <noreply@${env.RESEND_VERIFIED_DOMAIN}>` 
        : 'MyCirkle <onboarding@resend.dev>';
    
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: '🎉 Welcome to MyCirkle!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <!-- Header Image -->
                    <div style="text-align: center; padding: 0; margin: 0;">
                        <img src="${headerImageUrl}" alt="MyCirkle" style="width: 100%; max-width: 600px; display: block; margin: 0;" />
                    </div>
                    
                    <!-- Spacing -->
                    <div style="height: 20px;"></div>
                    
                    <!-- Content -->
                    <div style="padding: 30px; background: #f9fafb;">
                        <div style="background: white; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #1f2937; margin-top: 0;">Hi ${firstName}!</h2>
                            <p style="color: #374151; line-height: 1.6;">Thank you for joining MyCirkle! We're excited to have you as part of our loyalty family. 💜</p>
                            
                            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #1f2937; margin-top: 0;">Your Account Details:</h3>
                                <p style="color: #374151; margin: 5px 0;"><strong>Account Number:</strong> ${accountNumber}</p>
                                <p style="color: #374151; margin: 5px 0;"><strong>Welcome Bonus:</strong> ${points} points 🎁</p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://my.cirkledevelopment.co.uk" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">View Dashboard</a>
                            </div>
                            
                            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Start earning points and redeeming amazing rewards today!</p>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background: #1f2937; padding: 20px; text-align: center;">
                        <p style="color: #9ca3af; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} Cirkle Development</p>
                        <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 11px;">You're receiving this because you signed up for MyCirkle.</p>
                    </div>
                </div>
            `
        })
    });
    
    const result = await response.json();
    if (!response.ok) {
        console.error('Failed to send welcome email:', result);
    } else {
        console.log('Welcome email sent successfully to:', email);
    }
    return result;
}

// Add email to Resend mailing list
async function addToMailingList(env, email, firstName, lastName) {
    try {
        const response = await fetch('https://api.resend.com/audiences/78618937-ef3f-45f7-a1ce-8549070384a5/contacts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                first_name: firstName,
                last_name: lastName,
                unsubscribed: false
            })
        });
        
        const result = await response.json();
        if (!response.ok) {
            console.error('Failed to add to mailing list:', result);
        } else {
            console.log('Successfully added to mailing list:', email);
        }
        return result;
    } catch (error) {
        console.error('Failed to add to mailing list:', error);
    }
}

// Remove email from Resend mailing list
async function removeFromMailingList(env, email) {
    try {
        const audienceId = '78618937-ef3f-45f7-a1ce-8549070384a5';
        const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts/${email}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const result = await response.json();
            console.error('Failed to remove from mailing list:', result);
        } else {
            console.log('Successfully removed from mailing list:', email);
        }
    } catch (error) {
        console.error('Failed to remove from mailing list:', error);
    }
}

// Log email to dashboard (KV storage)
async function logEmailToDashboard(env, email, name, action) {
    try {
        const historyKey = 'email:history';
        let history = [];
        
        const existingHistory = await env.USERS_KV?.get(historyKey, { type: 'json' });
        if (existingHistory) {
            history = existingHistory;
        }
        
        history.unshift({
            email,
            name,
            action,
            timestamp: new Date().toISOString()
        });
        
        // Keep last 100 emails
        await env.USERS_KV?.put(historyKey, JSON.stringify(history.slice(0, 100)));
    } catch (error) {
        console.error('Failed to log email to dashboard:', error);
    }
}

// Remove email from dashboard history
async function removeFromEmailHistory(env, emailToRemove) {
    try {
        const historyKey = 'email:history';
        const existingHistory = await env.USERS_KV?.get(historyKey, { type: 'json' });
        
        if (existingHistory) {
            // Filter out all entries with this email
            const updatedHistory = existingHistory.filter(entry => entry.email !== emailToRemove);
            await env.USERS_KV?.put(historyKey, JSON.stringify(updatedHistory));
            console.log(`Removed ${existingHistory.length - updatedHistory.length} entries for ${emailToRemove}`);
        }
    } catch (error) {
        console.error('Failed to remove from email history:', error);
    }
}

// Send account deleted email
async function sendAccountDeletedEmail(env, email, firstName) {
    const headerImageUrl = 'https://i.postimg.cc/hPdGLf78/cirkledevtest.png';
    
    const fromEmail = env.RESEND_VERIFIED_DOMAIN 
        ? `MyCirkle <noreply@${env.RESEND_VERIFIED_DOMAIN}>` 
        : 'MyCirkle <onboarding@resend.dev>';
    
    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: '👋 Your MyCirkle Account Has Been Deleted',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <!-- Header Image -->
                    <div style="text-align: center; padding: 0; margin: 0;">
                        <img src="${headerImageUrl}" alt="MyCirkle" style="width: 100%; max-width: 600px; display: block; margin: 0;" />
                    </div>
                    
                    <!-- Spacing -->
                    <div style="height: 20px;"></div>
                    
                    <!-- Content -->
                    <div style="padding: 30px; background: #f9fafb;">
                        <div style="background: white; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #1f2937;">Hi ${firstName},</h2>
                            <p style="color: #374151;">Your MyCirkle account has been successfully deleted. All your data has been permanently removed.</p>
                            <p style="color: #374151;">We're sad to see you go! You're always welcome to come back. 💜</p>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background: #1f2937; padding: 20px; text-align: center;">
                        <p style="color: #9ca3af; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} Cirkle Development</p>
                    </div>
                </div>
            `
        })
    });
}

// Get all users from Google Sheets
async function getAllUsers(env) {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/Sheet1?key=${env.GOOGLE_SHEETS_API_KEY}`);
        const data = await response.json();
        const rows = data.values || [];
        if (rows.length <= 1) return [];
        
        const users = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            users.push({
                discordId: row[0],
                discordUsername: row[1],
                email: row[2],
                accountNumber: row[3],
                fullName: row[4],
                points: parseInt(row[5]) || 0,
                robloxUsername: row[6],
                memberSince: row[7]
            });
        }
        return users;
    } catch (error) {
        console.error('Error getting users:', error);
        return [];
    }
}

// Log email history to KV
async function logEmailHistory(env, emailData) {
    try {
        const history = await getEmailHistory(env);
        history.unshift(emailData);
        await env.USERS_KV?.put('email:history', JSON.stringify(history.slice(0, 50)));
    } catch (error) {
        console.error('Error logging email history:', error);
    }
}

// Get email history from KV
async function getEmailHistory(env) {
    try {
        const data = await env.USERS_KV?.get('email:history');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        return [];
    }
}

// Get emails sent today
async function getEmailsSentToday(env) {
    try {
        const history = await getEmailHistory(env);
        const today = new Date().toDateString();
        return history.filter(email => new Date(email.timestamp).toDateString() === today).reduce((sum, email) => sum + email.sent, 0);
    } catch (error) {
        return 0;
    }
}
