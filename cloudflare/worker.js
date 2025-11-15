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

        // Roblox API Proxy - Username lookup
        if (path === '/api/roblox/username' && request.method === 'POST') {
            try {
                const { username } = await request.json();
                
                if (!username) {
                    return jsonResponse({ error: 'Username required' }, 400, corsHeaders);
                }
                
                const response = await fetch('https://users.roblox.com/v1/usernames/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        usernames: [username], 
                        excludeBannedUsers: false 
                    })
                });
                
                const data = await response.json();
                return jsonResponse(data, response.status, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to lookup username', details: error.message }, 500, corsHeaders);
            }
        }

        // Roblox API Proxy - User ID lookup
        if (path.startsWith('/api/roblox/user/') && request.method === 'GET') {
            try {
                const userId = path.split('/').pop();
                
                if (!userId || isNaN(userId)) {
                    return jsonResponse({ error: 'Invalid user ID' }, 400, corsHeaders);
                }
                
                const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
                const data = await response.json();
                
                return jsonResponse(data, response.status, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to lookup user', details: error.message }, 500, corsHeaders);
            }
        }

        // Roblox API Proxy - Avatar thumbnail
        if (path.startsWith('/api/roblox/avatar/') && request.method === 'GET') {
            try {
                const userId = path.split('/').pop();
                
                if (!userId || isNaN(userId)) {
                    return jsonResponse({ error: 'Invalid user ID' }, 400, corsHeaders);
                }
                
                const response = await fetch(
                    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
                );
                const data = await response.json();
                
                return jsonResponse(data, response.status, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to fetch avatar', details: error.message }, 500, corsHeaders);
            }
        }

        // API: Signup with webhook notification
        // Validate referral code endpoint
        if (path === '/api/validate-referral' && request.method === 'GET') {
            try {
                const url = new URL(request.url);
                const code = url.searchParams.get('code');
                const discordId = url.searchParams.get('discordId');

                if (!code || !discordId) {
                    return jsonResponse({ 
                        valid: false, 
                        message: 'Missing required parameters' 
                    }, 400, corsHeaders);
                }

                // Normalize code to uppercase
                const normalizedCode = code.trim().toUpperCase();

                // Find the user who owns this referral code
                const allKeys = await env.USERS_KV?.list({ prefix: 'user:' });
                let referrerData = null;
                let referrerId = null;

                for (const key of allKeys.keys) {
                    const userData = await env.USERS_KV?.get(key.name);
                    if (userData) {
                        const user = JSON.parse(userData);
                        if (user.referralCode && user.referralCode.toUpperCase() === normalizedCode) {
                            referrerData = user;
                            referrerId = user.discordId;
                            break;
                        }
                    }
                }

                // Check if code exists
                if (!referrerData) {
                    return jsonResponse({ 
                        valid: false, 
                        message: 'Invalid referral code. Please check and try again.' 
                    }, 200, corsHeaders);
                }

                // Check for self-referral
                if (referrerId === discordId) {
                    return jsonResponse({ 
                        valid: false, 
                        message: 'You cannot use your own referral code!' 
                    }, 200, corsHeaders);
                }

                // Check if user has already used a referral code
                const currentUserData = await getUserData(discordId, env);
                if (currentUserData && currentUserData.usedReferralCode) {
                    return jsonResponse({ 
                        valid: false, 
                        message: 'You have already used a referral code. Each account can only use one code.' 
                    }, 200, corsHeaders);
                }

                // All checks passed
                return jsonResponse({ 
                    valid: true,
                    referrerId: referrerId,
                    referrerName: referrerData.firstName || 'Friend'
                }, 200, corsHeaders);

            } catch (error) {
                console.error('Referral validation error:', error);
                return jsonResponse({ 
                    valid: false, 
                    message: 'Error validating referral code' 
                }, 500, corsHeaders);
            }
        }

        if (path === '/api/signup' && request.method === 'POST') {
            try {
                const data = await request.json();
                const { 
                    discordId, discordUsername, firstName, lastName, fullName, email, memberSince,
                    country, timezone, language, robloxUsername, robloxUserId, robloxDisplayName, acceptedMarketing, accountNumber, referralCode
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

                // Process referral code if provided
                let referralBonus = 0;
                let referrerData = null;
                let referralApplied = false;
                
                if (referralCode) {
                    try {
                        const normalizedCode = referralCode.trim().toUpperCase();
                        
                        // Find referrer by code
                        const allKeys = await env.USERS_KV?.list({ prefix: 'user:' });
                        for (const key of allKeys.keys) {
                            const userData = await env.USERS_KV?.get(key.name);
                            if (userData) {
                                const user = JSON.parse(userData);
                                if (user.referralCode && user.referralCode.toUpperCase() === normalizedCode) {
                                    referrerData = user;
                                    break;
                                }
                            }
                        }
                        
                        // Validate referral
                        if (referrerData && referrerData.discordId !== discordId) {
                            referralBonus = 75;
                            referralApplied = true;
                        }
                    } catch (refError) {
                        console.error('Referral processing error:', refError);
                    }
                }

                // Generate referral code for new user (format: NAME-XXXX)
                const generateUserReferralCode = (firstName) => {
                    const namePart = (firstName || 'USER').toUpperCase().substring(0, 4).padEnd(4, 'X');
                    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
                    return `${namePart}-${randomPart}`;
                };

                // Create user data object with base points + referral bonus
                const totalPoints = 5 + referralBonus;
                const newUserData = {
                    discordId,
                    discordUsername,
                    email,
                    accountNumber: finalAccountNumber,
                    fullName: fullName || `${firstName} ${lastName}`,
                    firstName,
                    lastName,
                    points: totalPoints, // 5 base + 75 referral bonus if applicable
                    robloxUsername: robloxUsername || '',
                    robloxUserId: robloxUserId || '',
                    robloxDisplayName: robloxDisplayName || '',
                    country: country || '',
                    timezone: timezone || '',
                    language: language || '',
                    memberSince: memberSince || new Date().toISOString(),
                    referralCode: generateUserReferralCode(firstName), // Unique code for this user
                    usedReferralCode: referralApplied ? referralCode.trim().toUpperCase() : undefined,
                    referralCount: 0 // Track how many people used this user's code
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
                                    totalPoints, // Initial points (5 base + referral bonus)
                                    robloxUsername || '',
                                    memberSince || new Date().toISOString()
                                ]]
                            })
                        }
                    );
                }

                // Also save to KV for caching
                await env.USERS_KV?.put(`user:${discordId}`, JSON.stringify(newUserData));

                // Award referral bonus to referrer and log activities
                if (referralApplied && referrerData) {
                    try {
                        // Award 75 points to referrer
                        referrerData.points = (referrerData.points || 0) + 75;
                        referrerData.referralCount = (referrerData.referralCount || 0) + 1;
                        await env.USERS_KV?.put(`user:${referrerData.discordId}`, JSON.stringify(referrerData));
                        
                        // Add activity for referrer
                        const referrerActivities = JSON.parse(await env.USERS_KV?.get(`activities:${referrerData.discordId}`) || '[]');
                        referrerActivities.unshift({
                            type: 'referral_completed',
                            description: `${firstName} used your referral code!`,
                            points: 75,
                            timestamp: new Date().toISOString()
                        });
                        // Keep only last 50 activities
                        if (referrerActivities.length > 50) referrerActivities.length = 50;
                        await env.USERS_KV?.put(`activities:${referrerData.discordId}`, JSON.stringify(referrerActivities));
                        
                        // Add activity for new user
                        const newUserActivities = [{
                            type: 'referral_completed',
                            description: `Used referral code: ${referralCode.trim().toUpperCase()}`,
                            points: 75,
                            timestamp: new Date().toISOString()
                        }, {
                            type: 'signup',
                            description: 'Signed up for MyCirkle',
                            points: 5,
                            timestamp: new Date().toISOString()
                        }];
                        await env.USERS_KV?.put(`activities:${discordId}`, JSON.stringify(newUserActivities));
                        
                        console.log(`✅ Referral bonus applied: ${firstName} used ${referrerData.firstName}'s code. Both awarded 75 points.`);
                    } catch (refBonusError) {
                        console.error('Error applying referral bonus:', refBonusError);
                    }
                } else if (!referralApplied) {
                    // Add signup activity for non-referral users
                    const newUserActivities = [{
                        type: 'signup',
                        description: 'Signed up for MyCirkle',
                        points: 5,
                        timestamp: new Date().toISOString()
                    }];
                    await env.USERS_KV?.put(`activities:${discordId}`, JSON.stringify(newUserActivities));
                }

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
                                        description: `Hi **${firstName}**! Your loyalty account has been created successfully.${referralApplied ? '\n\n🎁 **Referral Bonus Applied!** You and your friend each earned 75 bonus points!' : ''}`,
                                        color: 0x00D9FF,
                                        fields: [
                                            { name: '📧 Email', value: email || 'Not provided', inline: true },
                                            { name: '🎮 Roblox', value: robloxUsername || 'Not linked', inline: true },
                                            { name: '🔢 Account Number', value: `\`${finalAccountNumber}\``, inline: false },
                                            { name: '⭐ Points Balance', value: `**${totalPoints} points**${referralApplied ? ' (5 welcome + 75 referral bonus!)' : ' (Welcome Bonus!)'}`, inline: true },
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
                            content: `🎊 Everyone, please welcome <@${discordId}>!${referralApplied ? ' 🎁 *Joined via referral!*' : ''}`,
                            embeds: [{
                                title: `🌟 ${firstName} joined MyCirkle!`,
                                description: `✨ **${firstName}** has joined the MyCirkle loyalty program and earned **${totalPoints} points**!${referralApplied ? '\n\n🎁 **Referral Bonus!** Both the new member and their friend earned 75 bonus points!' : ''}\n\n💎 Start earning points and redeem amazing rewards!`,
                                color: 0x00D9FF,
                                thumbnail: {
                                    url: avatarUrl
                                },
                                fields: [
                                    { name: '🎁 Starting Points', value: `${totalPoints} Points${referralApplied ? ' (5 + 75 referral)' : ''}`, inline: true },
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
                        console.log('📧 User opted into marketing - Email:', email, 'Name:', fullName);
                        
                        // Send welcome email
                        console.log('📨 Sending welcome email...');
                        const emailResult = await sendWelcomeEmail(env, email, firstName, finalAccountNumber, totalPoints);
                        console.log('✅ Welcome email sent:', emailResult);
                        
                        // Add to Resend mailing list - TRY/CATCH to prevent signup failure
                        try {
                            console.log('📋 Adding to Resend mailing list...');
                            const mailingResult = await addToMailingList(env, email, firstName, lastName);
                            console.log('✅ Added to mailing list:', mailingResult);
                            
                            // Send success webhook
                            if (mailingResult.success) {
                                console.log('🎉 Mailing list addition confirmed - sending success webhook');
                            }
                        } catch (mailingError) {
                            console.error('⚠️ Failed to add to mailing list (non-critical):', mailingError.message);
                            console.error('⚠️ Stack:', mailingError.stack);
                            // Continue signup process even if mailing list fails
                        }
                        
                        // Log to email dashboard (KV storage)
                        console.log('📊 Logging to email dashboard...');
                        await logEmailToDashboard(env, email, fullName || `${firstName} ${lastName}`, 'signup');
                        console.log('✅ Logged to email dashboard');
                        
                        // Send marketing webhook notification
                        console.log('🔔 Sending marketing signup webhook...');
                        const marketingWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
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
                        console.log('✅ Marketing email setup completed successfully');
                    } catch (emailError) {
                        console.error('❌ Welcome email/marketing error:', emailError);
                        console.error('Error details:', emailError.message, emailError.stack);
                    }
                } else {
                    console.log('⏭️ Skipping marketing emails - acceptedMarketing:', acceptedMarketing, 'email:', email);
                }
                
                // Assign MyCirkle Member role on Discord
                const memberRoleId = '1315065604738383982';
                const guildId = env.DISCORD_GUILD_ID;
                try {
                    console.log('🎭 Assigning MyCirkle Member role to Discord user:', discordId);
                    console.log('🎭 Guild ID:', guildId, 'Role ID:', memberRoleId);
                    
                    // Add delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    const roleResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${memberRoleId}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json',
                            'User-Agent': 'MyCirkle-Loyalty/1.0',
                            'X-Audit-Log-Reason': 'MyCirkle signup - automatic role assignment'
                        }
                    });
                    
                    console.log('🎭 Role assignment response status:', roleResponse.status);
                    
                    if (roleResponse.ok || roleResponse.status === 204) {
                        console.log('✅ Successfully assigned MyCirkle Member role to user', discordId);
                        
                        // Send role assignment confirmation webhook
                        const roleWebhook = 'https://discord.com/api/webhooks/1436394267986755648/CaQCKNNOLhRT3ngZSEYif7dNYwq63pTRq3kizD1TfTr6YROOYRin2pQ4LaZ4WUFKnlht';
                        try {
                            await fetch(roleWebhook, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    embeds: [{
                                        title: '✅ Role Assigned',
                                        description: `Successfully assigned MyCirkle Member role to <@${discordId}>`,
                                        color: 0x00ff00,
                                        fields: [
                                            { name: 'User', value: `<@${discordId}>`, inline: true },
                                            { name: 'Role', value: `<@&${memberRoleId}>`, inline: true }
                                        ],
                                        timestamp: new Date().toISOString()
                                    }]
                                })
                            });
                        } catch (webhookErr) {
                            console.error('Role webhook error:', webhookErr);
                        }
                    } else {
                        const roleError = await roleResponse.text();
                        console.error('❌ Failed to assign role:', roleResponse.status, roleError);
                        
                        // Send failure webhook
                        const roleWebhook = 'https://discord.com/api/webhooks/1436394267986755648/CaQCKNNOLhRT3ngZSEYif7dNYwq63pTRq3kizD1TfTr6YROOYRin2pQ4LaZ4WUFKnlht';
                        try {
                            await fetch(roleWebhook, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    embeds: [{
                                        title: '❌ Role Assignment Failed',
                                        description: `Failed to assign MyCirkle Member role to <@${discordId}>`,
                                        color: 0xff0000,
                                        fields: [
                                            { name: 'User', value: `<@${discordId}>`, inline: true },
                                            { name: 'Status', value: String(roleResponse.status), inline: true },
                                            { name: 'Error', value: roleError.substring(0, 1000), inline: false }
                                        ],
                                        timestamp: new Date().toISOString()
                                    }]
                                })
                            });
                        } catch (webhookErr) {
                            console.error('Error webhook error:', webhookErr);
                        }
                    }
                } catch (roleError) {
                    console.error('❌ Error assigning Discord role:', roleError);
                    
                    // Send error webhook
                    const roleWebhook = 'https://discord.com/api/webhooks/1436394267986755648/CaQCKNNOLhRT3ngZSEYif7dNYwq63pTRq3kizD1TfTr6YROOYRin2pQ4LaZ4WUFKnlht';
                    try {
                        await fetch(roleWebhook, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                embeds: [{
                                    title: '⚠️ Role Assignment Error',
                                    description: `Exception when assigning MyCirkle Member role to <@${discordId}>`,
                                    color: 0xffa500,
                                    fields: [
                                        { name: 'User', value: `<@${discordId}>`, inline: true },
                                        { name: 'Error', value: String(roleError).substring(0, 1000), inline: false }
                                    ],
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                    } catch (webhookErr) {
                        console.error('Error webhook error:', webhookErr);
                    }
                }
                
                // Send account information webhook
                const accountWebhook = 'https://discord.com/api/webhooks/1436394267986755648/CaQCKNNOLhRT3ngZSEYif7dNYwq63pTRq3kizD1TfTr6YROOYRin2pQ4LaZ4WUFKnlht';
                try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    const webhookResponse = await fetch(accountWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '📋 Account Information - New Signup',
                                description: `Complete account details for **${firstName} ${lastName}**${referralApplied ? ' 🎁 *Referral Signup*' : ''}`,
                                color: referralApplied ? 0x10b981 : 0x8b5cf6,
                                fields: [
                                    { name: '👤 Full Name', value: `${firstName} ${lastName}`, inline: true },
                                    { name: '📧 Email', value: email || 'Not provided', inline: true },
                                    { name: '🎮 Discord ID', value: discordId, inline: false },
                                    { name: '💬 Discord Username', value: discordUsername || 'Unknown', inline: true },
                                    { name: '🔢 Account Number', value: `\`${finalAccountNumber}\``, inline: true },
                                    { name: '🎮 Roblox Username', value: newUserData.robloxUsername || 'Not provided', inline: true },
                                    { name: '🆔 Roblox User ID', value: newUserData.robloxUserId || 'Not provided', inline: true },
                                    { name: '🌍 Country', value: country || 'Not provided', inline: true },
                                    { name: '🕐 Timezone', value: timezone || 'Not provided', inline: true },
                                    { name: '🗣️ Language', value: language || 'Not provided', inline: true },
                                    { name: '📬 Marketing Opt-in', value: acceptedMarketing ? 'Yes ✅' : 'No ❌', inline: true },
                                    { name: '🎁 Referral Source', value: referralApplied ? `Code: \`${referralCode.trim().toUpperCase()}\` (by ${referrerData.firstName})` : 'General signup', inline: false },
                                    { name: '⭐ Starting Points', value: `${totalPoints} points${referralApplied ? ' (5 + 75 referral bonus)' : ''}`, inline: true },
                                    { name: '📅 Member Since', value: new Date(memberSince || Date.now()).toLocaleString(), inline: false }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                    
                    if (!webhookResponse.ok) {
                        const errorText = await webhookResponse.text();
                        console.error('Account info webhook failed:', webhookResponse.status, errorText);
                    }
                } catch (webhookError) {
                    console.error('Account info webhook error:', webhookError);
                }

                return jsonResponse({ 
                    success: true, 
                    message: 'User registered',
                    accountNumber: finalAccountNumber,
                    referralApplied: referralApplied,
                    totalPoints: totalPoints
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

                console.log('📦 Products API Request:');
                console.log('  - Roblox Username:', robloxUsername);
                console.log('  - Account ID:', accountId);
                console.log('  - Request URL:', request.url);

                if (!robloxUsername || robloxUsername === 'null' || robloxUsername === 'undefined') {
                    console.log('❌ Invalid robloxUsername:', robloxUsername);
                    return jsonResponse({ success: true, error: 'Missing or invalid robloxUsername', products: [] }, 200, corsHeaders);
                }

                const PARCEL_API_KEY = env.PARCELROBLOX_API_KEY;
                const PRODUCT_ID = env.PARCEL_PRODUCT_ID || 'prod_BwM387gLYcCa8qhERIH1JliOQ';

                if (!PARCEL_API_KEY) {
                    console.error('❌ ParcelRoblox API key not configured');
                    return jsonResponse({ success: true, error: 'ParcelRoblox API not configured', products: [] }, 200, corsHeaders);
                }

                console.log('🔍 ParcelRoblox Configuration:');
                console.log('  - Product ID:', PRODUCT_ID);
                console.log('  - API Key:', PARCEL_API_KEY ? 'Configured ✓' : 'Missing ✗');

                // Check ownership via ParcelRoblox API
                const checkUrl = 'https://api.parcelroblox.com/v1/products/ownership';
                const requestBody = {
                    productId: PRODUCT_ID,
                    robloxUsername: robloxUsername
                };
                
                console.log('📡 Calling ParcelRoblox API...');
                console.log('  - Endpoint:', checkUrl);
                console.log('  - Request Body:', JSON.stringify(requestBody));
                
                const response = await fetch(checkUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${PARCEL_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('📥 ParcelRoblox Response:');
                console.log('  - Status:', response.status, response.statusText);
                console.log('  - Headers:', Object.fromEntries(response.headers));

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ ParcelRoblox API Error:');
                    console.error('  - Status:', response.status);
                    console.error('  - Response:', errorText);
                    return jsonResponse({ success: true, error: `API Error: ${response.status}`, products: [] }, 200, corsHeaders);
                }

                const data = await response.json();
                console.log('✅ ParcelRoblox Data:', JSON.stringify(data, null, 2));
                
                const products = data.owns ? [{
                    id: PRODUCT_ID,
                    name: data.productName || 'MyCirkle Product',
                    description: 'Verified product ownership',
                    owned: true
                }] : [];

                console.log('📦 Final Products Array:', JSON.stringify(products, null, 2));
                console.log('✅ Products API completed successfully');
                return jsonResponse({ success: true, products }, 200, corsHeaders);
            } catch (error) {
                console.error('❌ Products API Fatal Error:');
                console.error('  - Error:', error.message);
                console.error('  - Stack:', error.stack);
                return jsonResponse({ success: true, error: error.message, products: [] }, 200, corsHeaders);
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

                // Send webhook notification about account deletion
                try {
                    const deletionWebhook = 'https://discord.com/api/webhooks/1439026719326470164/-8qt_MMRzD55-Tr5BkV5AbuoC3lAa5NTc1hGBJ3dLn48kAXuZyQxmLHFouaNu9cnxc_X';
                    await fetch(deletionWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '🗑️ Account Deleted',
                                description: 'A user has deleted their MyCirkle account.',
                                color: 0xef4444,
                                fields: [
                                    { name: '👤 User', value: `<@${discordId}>`, inline: true },
                                    { name: '🆔 Discord ID', value: discordId, inline: true },
                                    { name: '📧 Email', value: userEmail || 'N/A', inline: false },
                                    { name: '👤 Name', value: userFirstName || 'N/A', inline: true },
                                    { name: '📅 Deleted At', value: new Date().toLocaleString(), inline: true }
                                ],
                                footer: { text: 'MyCirkle Account Deletion' },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                    console.log('✅ Account deletion webhook sent');
                } catch (webhookErr) {
                    console.error('❌ Failed to send deletion webhook:', webhookErr);
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
                const body = await request.json();
                console.log('📧 Send email request body:', body);
                
                const { recipients, subject, message, adminKey } = body;
                
                // Verify admin key
                if (adminKey !== env.ADMIN_KEY) {
                    console.log('❌ Admin key mismatch');
                    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
                }

                // Get mailing list contacts from Resend
                console.log('📋 Fetching mailing list from Resend...');
                const mailingList = await getMailingListContacts(env);
                console.log('📋 Mailing list response:', { length: mailingList.length, sample: mailingList[0] });
                
                // If using Resend audience contacts directly
                if (recipients === 'all' && mailingList.length > 0) {
                    console.log(`✅ Using ${mailingList.length} contacts directly from Resend audience`);
                    
                    const targetUsers = mailingList.map(contact => ({
                        email: contact.email,
                        firstName: contact.first_name || 'Member',
                        lastName: contact.last_name || '',
                        fullName: `${contact.first_name || 'Member'} ${contact.last_name || ''}`.trim()
                    }));
                    
                    console.log(`🎯 Target users: ${targetUsers.length}`);
                    
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
                }
                
                const mailingEmails = new Set(mailingList.map(c => c.email));
                console.log(`✅ Mailing list has ${mailingEmails.size} contacts`);
                
                // Get all users from Google Sheets
                console.log('📄 Fetching users from Google Sheets...');
                const allUsers = await getAllUsers(env);
                console.log(`📄 Found ${allUsers.length} total users`);
                
                // Filter to only users who are in the mailing list
                const users = allUsers.filter(u => u.email && mailingEmails.has(u.email));
                
                console.log(`Filtered to ${users.length} users who opted into marketing`);
                
                // Filter recipients further based on selection
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

                console.log(`🎯 Target users: ${targetUsers.length} (from ${users.length} marketing subscribers)`);
                
                if (targetUsers.length === 0) {
                    const errorMsg = recipients === 'test' 
                        ? 'No recipients found. Make sure at least one user has opted into marketing emails during signup.' 
                        : `No recipients found for filter "${recipients}". Total marketing subscribers: ${users.length}. Make sure users have opted into marketing emails during signup.`;
                    console.log('❌', errorMsg);
                    return jsonResponse({ error: errorMsg }, 400, corsHeaders);
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
                console.error('Send email error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        if (path === '/api/admin/email-stats' && request.method === 'GET') {
            try {
                const mailingList = await getMailingListContacts(env);
                const emailsToday = await getEmailsSentToday(env);
                
                return jsonResponse({
                    totalMembers: mailingList.length,
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

        // TEST: Add contact to mailing list
        if (path === '/api/admin/test-mailing-list' && request.method === 'POST') {
            try {
                const { email, firstName, lastName } = await request.json();
                console.log('🧪 TEST: Adding contact to mailing list:', { email, firstName, lastName });
                
                const result = await addToMailingList(env, email, firstName, lastName);
                console.log('🧪 TEST: Result:', result);
                
                return jsonResponse({ 
                    success: true, 
                    result,
                    message: 'Check Cloudflare logs for detailed output'
                }, 200, corsHeaders);
            } catch (error) {
                console.error('🧪 TEST: Error:', error);
                return jsonResponse({ 
                    success: false, 
                    error: error.message,
                    stack: error.stack 
                }, 500, corsHeaders);
            }
        }

        // TEST: ParcelRoblox hub and ownership check
        if (path === '/api/admin/test-parcel' && request.method === 'GET') {
            try {
                const url = new URL(request.url);
                const discordId = url.searchParams.get('discordId') || '1088907566844739624';
                const hubId = 'prod_BwM387gLYcCa8qhERIH1JliOQ';
                
                console.log('🧪 TEST: Discord ID:', discordId);
                console.log('🧪 TEST: Hub ID:', hubId);
                
                // Fetch hub info
                const hubUrl = `https://v2.parcelroblox.com/hub`;
                const hubResponse = await fetch(hubUrl, {
                    headers: {
                        'Authorization': `${hubId}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const hubData = await hubResponse.json();
                console.log('🧪 TEST: Hub data:', JSON.stringify(hubData, null, 2));
                
                // Test ownership check for first product
                let ownershipResults = [];
                if (hubData.data?.products && hubData.data.products.length > 0) {
                    const testProduct = hubData.data.products[0];
                    const productId = testProduct.id || testProduct._id || testProduct.productId;
                    
                    console.log('🧪 TEST: Checking ownership for product:', productId);
                    const checkUrl = `https://v2.parcelroblox.com/whitelist/check/discord/${discordId}?product_id=${productId}`;
                    console.log('🧪 TEST: Check URL:', checkUrl);
                    
                    const checkResponse = await fetch(checkUrl, {
                        headers: {
                            'Authorization': `${hubId}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    const checkData = await checkResponse.json();
                    console.log('🧪 TEST: Ownership check response:', JSON.stringify(checkData, null, 2));
                    
                    ownershipResults.push({
                        productId,
                        productName: testProduct.name,
                        checkUrl,
                        response: checkData
                    });
                }
                
                return jsonResponse({
                    hubResponse: {
                        status: hubResponse.status,
                        data: hubData
                    },
                    ownershipResults,
                    message: 'Check Cloudflare logs for detailed output'
                }, 200, corsHeaders);
            } catch (error) {
                console.error('🧪 TEST: Error:', error);
                return jsonResponse({ 
                    error: error.message,
                    stack: error.stack
                }, 500, corsHeaders);
            }
        }

        // API: Get daily reward
        if (path === '/api/daily-reward' && request.method === 'GET') {
            try {
                const dailyReward = await env.BOT_CONFIG_KV?.get('daily-reward', { type: 'json' });
                if (dailyReward) {
                    return jsonResponse(dailyReward, 200, corsHeaders);
                }
                // Return default if not set
                return jsonResponse({
                    name: 'Free Shipping Voucher',
                    points: 10,
                    setAt: new Date().toISOString()
                }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Activity-based rewards (messages, forum posts)
        if (path === '/api/activity-reward' && request.method === 'POST') {
            try {
                const { userId, points, reason } = await request.json();
                
                if (!userId || !points) {
                    return jsonResponse({ error: 'Missing userId or points' }, 400, corsHeaders);
                }
                
                // Get user data from KV
                const userKvKey = `user:${userId}`;
                const userData = await env.USERS_KV?.get(userKvKey, { type: 'json' });
                
                if (!userData) {
                    return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                }
                
                // Add points
                const oldPoints = userData.points || 0;
                const oldTier = getTier(oldPoints);
                userData.points = oldPoints + points;
                const newTier = getTier(userData.points);
                
                // Save to KV
                await env.USERS_KV?.put(userKvKey, JSON.stringify(userData));
                
                // Update Google Sheets
                try {
                    const rows = await fetchSheetData(env.SHEET_ID, env.GOOGLE_API_KEY);
                    const rowIndex = rows.findIndex(row => row[0] === userId);
                    
                    if (rowIndex !== -1) {
                        // Update points column (column G, index 6)
                        await updateSheetCell(
                            env.SHEET_ID,
                            env.GOOGLE_API_KEY,
                            rowIndex + 2, // +2 because sheets are 1-indexed and header row
                            'G',
                            userData.points
                        );
                    }
                } catch (sheetError) {
                    console.error('Failed to update Google Sheets:', sheetError);
                }
                
                // Check tier upgrade
                if (newTier !== oldTier) {
                    await sendTierUpgradeDM(env, userId, oldTier, newTier, userData.points);
                }
                
                // Log to activity logs channel
                try {
                    const logsWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
                    await fetch(logsWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '📊 Activity Points Awarded',
                                description: `<@${userId}> received points for activity!`,
                                color: 0x3b82f6,
                                fields: [
                                    { name: '🎯 Activity', value: reason || 'Activity reward', inline: false },
                                    { name: '➕ Points Earned', value: `+${points}`, inline: true },
                                    { name: '💰 Old Balance', value: `${oldPoints}`, inline: true },
                                    { name: '✨ New Balance', value: `${userData.points}`, inline: true },
                                    { name: '🏆 Tier', value: newTier, inline: true }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (webhookError) {
                    console.error('Activity log webhook error:', webhookError);
                }
                
                return jsonResponse({
                    success: true,
                    oldPoints,
                    newPoints: userData.points,
                    tierUpgrade: newTier !== oldTier ? { oldTier, newTier } : null
                }, 200, corsHeaders);
            } catch (error) {
                console.error('Activity reward error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Get user data by Discord ID
        if (path === '/api/get-user' && request.method === 'GET') {
            try {
                const url = new URL(request.url);
                const discordId = url.searchParams.get('discordId');
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId parameter required' }, 400, corsHeaders);
                }
                
                const userData = await getUserData(discordId, env);
                
                if (!userData) {
                    return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                }
                
                return jsonResponse(userData, 200, corsHeaders);
            } catch (error) {
                console.error('Get user error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Update user data (for referral codes, etc.)
        if (path === '/api/update-user' && request.method === 'POST') {
            try {
                const body = await request.json();
                const { discordId, updates } = body;
                
                if (!discordId || !updates) {
                    return jsonResponse({ error: 'discordId and updates required' }, 400, corsHeaders);
                }
                
                const userData = await getUserData(discordId, env);
                if (!userData) {
                    return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                }
                
                // Update user data
                Object.assign(userData, updates);
                await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(userData));
                
                return jsonResponse({ success: true, user: userData }, 200, corsHeaders);
            } catch (error) {
                console.error('Update user error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Add activity to user's activity feed
        if (path === '/api/add-activity' && request.method === 'POST') {
            try {
                const body = await request.json();
                const { discordId, activity } = body;
                
                if (!discordId || !activity) {
                    return jsonResponse({ error: 'discordId and activity required' }, 400, corsHeaders);
                }
                
                // Get existing activities
                const activitiesKey = `activities:${discordId}`;
                let activities = await env.USERS_KV.get(activitiesKey, 'json') || [];
                
                // Add new activity to beginning
                activities.unshift(activity);
                
                // Keep only last 50 activities
                activities = activities.slice(0, 50);
                
                // Save back to KV
                await env.USERS_KV.put(activitiesKey, JSON.stringify(activities));
                
                return jsonResponse({ success: true }, 200, corsHeaders);
            } catch (error) {
                console.error('Add activity error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Get user activities
        if (path === '/api/get-activities' && request.method === 'GET') {
            try {
                const url = new URL(request.url);
                const discordId = url.searchParams.get('discordId');
                const limit = parseInt(url.searchParams.get('limit')) || 3;
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId parameter required' }, 400, corsHeaders);
                }
                
                const activitiesKey = `activities:${discordId}`;
                let activities = await env.USERS_KV.get(activitiesKey, 'json') || [];
                
                // Return limited number
                activities = activities.slice(0, limit);
                
                return jsonResponse({ activities }, 200, corsHeaders);
            } catch (error) {
                console.error('Get activities error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Parcel API: Get user products
        if (path === '/api/parcel/products' && request.method === 'GET') {
            try {
                const url = new URL(request.url);
                const discordId = url.searchParams.get('discordId');
                const forceRefresh = url.searchParams.get('refresh') === 'true';
                
                console.log('🔍 Products API called with discordId:', discordId, '| Force refresh:', forceRefresh);
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId parameter required' }, 400, corsHeaders);
                }
                
                // Check cache first (unless forced refresh)
                const cacheKey = `parcel_products_${discordId}`;
                if (!forceRefresh) {
                    const cachedData = await env.USERS_KV.get(cacheKey, 'json');
                    if (cachedData && cachedData.timestamp > Date.now() - 86400000) { // 24 hour cache
                        const cacheAge = Math.round((Date.now() - cachedData.timestamp) / 60000);
                        console.log(`💾 Returning cached products (age: ${cacheAge} minutes)`);
                        return jsonResponse({ 
                            data: cachedData.products || [],
                            whitelisted: cachedData.whitelisted || false,
                            userId: cachedData.userId,
                            discordId,
                            hubId: cachedData.hubId,
                            cached: true,
                            cachedAt: new Date(cachedData.timestamp).toISOString()
                        }, 200, corsHeaders);
                    }
                }
                
                // Get user data to find Roblox ID
                let userData;
                try {
                    userData = await getUserData(discordId, env);
                    console.log('👤 User data found:', userData ? `Roblox ID: ${userData.robloxUserId}` : 'Not found');
                } catch (userError) {
                    console.error('❌ Error getting user data:', userError);
                    return jsonResponse({ error: 'Failed to retrieve user data', details: userError.message }, 500, corsHeaders);
                }
                
                if (!userData || !userData.robloxUserId) {
                    return jsonResponse({ 
                        error: 'Roblox account not linked',
                        data: [],
                        whitelisted: false,
                        userId: null
                    }, 200, corsHeaders);
                }
                
                // Fetch hub information to get all products
                const hubId = 'prod_BwM387gLYcCa8qhERIH1JliOQ';
                const hubUrl = `https://v2.parcelroblox.com/hub`;
                console.log('🔗 Calling ParcelRoblox hub API:', hubUrl);
                
                const hubResponse = await fetch(hubUrl, {
                    headers: {
                        'Authorization': `${hubId}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('📥 Hub API response status:', hubResponse.status);
                
                // Handle rate limiting
                if (hubResponse.status === 429) {
                    console.log('⚠️ Rate limited by ParcelRoblox');
                    // Try to return cached data even if expired
                    const cachedData = await env.USERS_KV.get(cacheKey, 'json');
                    if (cachedData) {
                        console.log('💾 Returning expired cache due to rate limit');
                        return jsonResponse({ 
                            data: cachedData.products || [],
                            whitelisted: cachedData.whitelisted || false,
                            userId: cachedData.userId,
                            discordId,
                            hubId: cachedData.hubId,
                            cached: true,
                            rateLimited: true,
                            message: 'Using cached data - ParcelRoblox rate limit reached (30 requests/day on free tier)'
                        }, 200, corsHeaders);
                    }
                    return jsonResponse({ 
                        data: [], 
                        whitelisted: false,
                        userId: userData.robloxUserId,
                        discordId,
                        hubId,
                        rateLimited: true,
                        error: 'ParcelRoblox rate limit reached (30 requests/day). Upgrade to paid tier or try again tomorrow.'
                    }, 200, corsHeaders);
                }
                
                if (!hubResponse.ok) {
                    const errorText = await hubResponse.text();
                    console.error('❌ Hub fetch failed:', hubResponse.status, errorText);
                    return jsonResponse({ 
                        error: 'ParcelRoblox Hub API error',
                        details: errorText,
                        data: [],
                        whitelisted: false,
                        userId: userData.robloxUserId
                    }, 200, corsHeaders);
                }
                
                const hubData = await hubResponse.json();
                console.log('📦 Hub response:', JSON.stringify(hubData, null, 2));
                
                // Get hub products and check which ones the user owns
                let userProducts = [];
                if (hubData.data && hubData.data.products && Array.isArray(hubData.data.products)) {
                    const hubProducts = hubData.data.products;
                    console.log('🏢 Hub has', hubProducts.length, 'total products');
                    
                    // Check each product to see if user owns it (using Discord ID directly)
                    for (const product of hubProducts) {
                        const productId = product.id || product._id || product.productId;
                        console.log('🔍 Checking ownership for product:', productId, '-', product.name);
                        
                        try {
                            // Use Discord ID type for direct checking
                            const checkUrl = `https://v2.parcelroblox.com/whitelist/check/discord/${discordId}?product_id=${productId}`;
                            console.log('🔗 Check URL:', checkUrl);
                            
                            const checkResponse = await fetch(checkUrl, {
                                headers: {
                                    'Authorization': `${hubId}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (checkResponse.ok) {
                                const checkData = await checkResponse.json();
                                console.log('📦 Ownership check result:', JSON.stringify(checkData, null, 2));
                                
                                // Check the owns_license field
                                if (checkData.data?.owns_license === true) {
                                    console.log('✅ User owns product:', product.name || productId);
                                    userProducts.push(product);
                                } else {
                                    console.log('❌ User does NOT own product:', product.name || productId);
                                }
                            } else {
                                const errorText = await checkResponse.text();
                                console.log('⚠️ Ownership check failed for product:', productId, '-', errorText);
                            }
                        } catch (err) {
                            console.error('❌ Error checking product:', productId, err);
                        }
                    }
                    
                    console.log('📦 User owns', userProducts.length, 'product(s) from this hub');
                } else {
                    console.log('⚠️ No products found in hub data');
                }
                
                // Check for new products and award points
                const cachedData = await env.USERS_KV.get(cacheKey, 'json');
                let newProductsDetected = [];
                let pointsAwarded = 0;
                
                if (cachedData && cachedData.products) {
                    // Compare current products with cached products
                    const cachedProductIds = new Set(cachedData.products.map(p => p.id || p._id || p.productId));
                    
                    for (const product of userProducts) {
                        const productId = product.id || product._id || product.productId;
                        if (!cachedProductIds.has(productId)) {
                            // New product detected!
                            console.log('🎉 NEW PRODUCT DETECTED:', product.name);
                            newProductsDetected.push(product);
                            
                            // Award points based on product price
                            const price = product.price || 0;
                            let tokensToAward = 150; // Default: ≤100 Robux
                            if (price > 500) {
                                tokensToAward = 400;
                            } else if (price > 100) {
                                tokensToAward = 250;
                            }
                            
                            pointsAwarded += tokensToAward;
                            
                            // Update user points
                            const oldPoints = userData.points || 0;
                            const oldTier = getTier(oldPoints);
                            userData.points = oldPoints + tokensToAward;
                            const newTier = getTier(userData.points);
                            
                            // Save to KV
                            await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(userData));
                            
                            console.log(`💰 Awarded ${tokensToAward} points for ${product.name} (${price} Robux)`);
                            
                            // Check tier upgrade
                            if (newTier !== oldTier) {
                                await sendTierUpgradeDM(env, discordId, oldTier, newTier, userData.points);
                            }
                            
                            // Log to Discord webhook
                            try {
                                const logsWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
                                await fetch(logsWebhook, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        embeds: [{
                                            title: '🛍️ New Product Purchase Detected',
                                            description: `<@${discordId}> purchased a new product!`,
                                            color: 0x10b981,
                                            fields: [
                                                { name: '🎁 Product', value: product.name || 'Unknown', inline: false },
                                                { name: '💰 Price', value: price ? `${price} Robux` : 'Unknown', inline: true },
                                                { name: '➕ Tokens Earned', value: `+${tokensToAward}`, inline: true },
                                                { name: '💎 Old Balance', value: `${oldPoints}`, inline: true },
                                                { name: '✨ New Balance', value: `${userData.points}`, inline: true },
                                                { name: '🏆 Tier', value: newTier, inline: true }
                                            ],
                                            timestamp: new Date().toISOString()
                                        }]
                                    })
                                });
                            } catch (webhookError) {
                                console.error('Webhook error:', webhookError);
                            }
                            
                            // Send DM to user
                            const botToken = env.DISCORD_BOT_TOKEN;
                            if (botToken) {
                                try {
                                    const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bot ${botToken}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ recipient_id: discordId })
                                    });
                                    
                                    if (channelResponse.ok) {
                                        const channel = await channelResponse.json();
                                        await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': `Bot ${botToken}`,
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                embeds: [{
                                                    title: '🎉 Purchase Reward!',
                                                    description: `You have received **${tokensToAward} tokens** for buying **${product.name || 'a product'}**!`,
                                                    color: 0x10b981,
                                                    thumbnail: {
                                                        url: 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'
                                                    },
                                                    fields: [
                                                        { name: '🎁 Product', value: product.name || 'Unknown', inline: false },
                                                        { name: '💰 Price', value: price ? `${price} Robux` : 'Unknown', inline: true },
                                                        { name: '⭐ Tokens Earned', value: `+${tokensToAward}`, inline: true },
                                                        { name: '💎 New Balance', value: `${userData.points} tokens`, inline: false }
                                                    ],
                                                    footer: {
                                                        text: 'MyCirkle Loyalty Program',
                                                        icon_url: 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'
                                                    },
                                                    timestamp: new Date().toISOString()
                                                }]
                                            })
                                        });
                                    }
                                } catch (dmError) {
                                    console.error('DM error:', dmError);
                                }
                            }
                        }
                    }
                }
                
                // Cache the result for 24 hours
                await env.USERS_KV.put(cacheKey, JSON.stringify({
                    products: userProducts,
                    whitelisted: userProducts.length > 0,
                    userId: userData.robloxUserId,
                    hubId: hubId,
                    timestamp: Date.now()
                }));
                console.log('💾 Cached products for 24 hours');
                
                return jsonResponse({ 
                    data: userProducts,
                    whitelisted: userProducts.length > 0,
                    userId: userData.robloxUserId,
                    discordId: discordId,
                    hubId: hubId,
                    cached: false,
                    newPurchases: newProductsDetected.length > 0 ? {
                        count: newProductsDetected.length,
                        products: newProductsDetected.map(p => p.name),
                        pointsAwarded: pointsAwarded
                    } : null
                }, 200, corsHeaders);
            } catch (error) {
                console.error('❌ Parcel API error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Parcel Webhook: Handle purchase notifications
        if (path === '/api/parcel/webhook' && request.method === 'POST') {
            try {
                const data = await request.json();
                const { userId, productId, productName, price } = data;
                
                // Find user by Roblox ID
                const spreadsheetId = env.SPREADSHEET_ID;
                const sheetsApiKey = env.GOOGLE_SHEETS_API_KEY;
                
                if (!spreadsheetId || !sheetsApiKey) {
                    return jsonResponse({ error: 'Sheets not configured' }, 500, corsHeaders);
                }
                
                const rows = await fetchSheetData(spreadsheetId, sheetsApiKey);
                let userData = null;
                let rowIndex = -1;
                
                // Find user by Roblox user ID (stored in column G or in userData)
                for (let i = 0; i < rows.length; i++) {
                    const discordId = rows[i][0];
                    const kvData = await env.USERS_KV?.get(`user:${discordId}`, { type: 'json' });
                    if (kvData && kvData.robloxUserId === String(userId)) {
                        userData = kvData;
                        rowIndex = i;
                        break;
                    }
                }
                
                if (!userData) {
                    console.log('User not found for Roblox ID:', userId);
                    return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                }
                
                // Calculate tokens based on price (in Robux)
                let tokensToAward = 150; // Default: ≤100 Robux
                if (price > 500) {
                    tokensToAward = 400;
                } else if (price > 100) {
                    tokensToAward = 250;
                }
                
                // Award tokens
                const oldPoints = userData.points || 0;
                const oldTier = getTier(oldPoints);
                userData.points = oldPoints + tokensToAward;
                const newTier = getTier(userData.points);
                
                // Save to KV
                await env.USERS_KV?.put(`user:${userData.discordId}`, JSON.stringify(userData));
                
                // Update Google Sheets
                if (rowIndex !== -1) {
                    await updateSheetCell(
                        spreadsheetId,
                        sheetsApiKey,
                        rowIndex + 2,
                        'G',
                        userData.points
                    );
                }
                
                // Check tier upgrade
                if (newTier !== oldTier) {
                    await sendTierUpgradeDM(env, userData.discordId, oldTier, newTier, userData.points);
                }
                
                // Log purchase to Discord
                const logsWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
                await fetch(logsWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        embeds: [{
                            title: '🛍️ Purchase Detected',
                            description: `<@${userData.discordId}> made a purchase!`,
                            color: 0x10b981,
                            fields: [
                                { name: '🎁 Product', value: productName || 'Unknown', inline: false },
                                { name: '💰 Price', value: `${price} Robux`, inline: true },
                                { name: '➕ Tokens Earned', value: `+${tokensToAward}`, inline: true },
                                { name: '💎 Old Balance', value: `${oldPoints}`, inline: true },
                                { name: '✨ New Balance', value: `${userData.points}`, inline: true },
                                { name: '🏆 Tier', value: newTier, inline: true }
                            ],
                            timestamp: new Date().toISOString()
                        }]
                    })
                });
                
                // Send DM to user
                const botToken = env.DISCORD_BOT_TOKEN;
                if (botToken) {
                    try {
                        const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ recipient_id: userData.discordId })
                        });
                        
                        if (channelResponse.ok) {
                            const channel = await channelResponse.json();
                            await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${botToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    embeds: [{
                                        title: '🎉 Purchase Reward!',
                                        description: `You have received **${tokensToAward} tokens** for buying **${productName || 'a product'}**!`,
                                        color: 0x10b981,
                                        thumbnail: {
                                            url: 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'
                                        },
                                        fields: [
                                            { name: '🎁 Product', value: productName || 'Unknown', inline: false },
                                            { name: '💰 Price', value: `${price} Robux`, inline: true },
                                            { name: '⭐ Tokens Earned', value: `+${tokensToAward}`, inline: true },
                                            { name: '💎 New Balance', value: `${userData.points} tokens`, inline: false }
                                        ],
                                        footer: {
                                            text: 'MyCirkle Loyalty Program',
                                            icon_url: 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'
                                        },
                                        timestamp: new Date().toISOString()
                                    }]
                                })
                            });
                        }
                    } catch (dmError) {
                        console.error('Failed to send purchase DM:', dmError);
                    }
                }
                
                return jsonResponse({ success: true, tokensAwarded: tokensToAward }, 200, corsHeaders);
            } catch (error) {
                console.error('Parcel webhook error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Test Purchase DM endpoint
        if (path === '/api/test-purchase-dm' && request.method === 'POST') {
            try {
                const { discordId } = await request.json();
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId required' }, 400, corsHeaders);
                }
                
                const botToken = env.DISCORD_BOT_TOKEN;
                if (!botToken) {
                    return jsonResponse({ error: 'Bot token not configured' }, 500, corsHeaders);
                }
                
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
                
                if (!channelResponse.ok) {
                    const error = await channelResponse.text();
                    return jsonResponse({ error: 'Failed to create DM channel', details: error }, channelResponse.status, corsHeaders);
                }
                
                const channel = await channelResponse.json();
                
                // Send test purchase DM
                const dmResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            title: '🎉 Purchase Reward! [TEST]',
                            description: `You have received **250 tokens** for buying **Test Product**!`,
                            color: 0x10b981,
                            thumbnail: {
                                url: 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'
                            },
                            fields: [
                                { name: '🎁 Product', value: 'Test Product (Sample Item)', inline: false },
                                { name: '💰 Price', value: '250 Robux', inline: true },
                                { name: '⭐ Tokens Earned', value: '+250', inline: true },
                                { name: '💎 New Balance', value: '250 tokens', inline: false }
                            ],
                            footer: {
                                text: 'This is a test message from MyCirkle',
                                icon_url: 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'
                            },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });
                
                if (!dmResponse.ok) {
                    const error = await dmResponse.text();
                    return jsonResponse({ error: 'Failed to send DM', details: error }, dmResponse.status, corsHeaders);
                }
                
                return jsonResponse({ success: true, message: 'Test purchase DM sent successfully!' }, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to send test DM', details: error.message }, 500, corsHeaders);
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

        // API: Test role assignment
        if (path === '/api/test-role-assignment' && request.method === 'POST') {
            try {
                const { discordId } = await request.json();
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId required' }, 400, corsHeaders);
                }
                
                const botToken = env.DISCORD_BOT_TOKEN;
                const guildId = env.DISCORD_GUILD_ID;
                const memberRoleId = '1315065604738383982';
                
                if (!botToken) {
                    return jsonResponse({ error: 'Bot token not configured' }, 500, corsHeaders);
                }
                
                console.log('🧪 Testing role assignment for Discord user:', discordId);
                console.log('🧪 Guild ID:', guildId, 'Role ID:', memberRoleId);
                
                // Assign MyCirkle Member role
                const roleResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${memberRoleId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'MyCirkle-Loyalty/1.0',
                        'X-Audit-Log-Reason': 'MyCirkle role test - manual test endpoint'
                    }
                });
                
                const statusCode = roleResponse.status;
                const responseText = await roleResponse.text();
                
                console.log('🧪 Role assignment response:', statusCode, responseText);
                
                if (roleResponse.ok || statusCode === 204) {
                    return jsonResponse({ 
                        success: true, 
                        message: 'Role assigned successfully!',
                        details: {
                            discordId,
                            roleId: memberRoleId,
                            guildId,
                            status: statusCode
                        }
                    }, 200, corsHeaders);
                } else {
                    return jsonResponse({ 
                        error: 'Failed to assign role',
                        status: statusCode,
                        details: responseText
                    }, statusCode, corsHeaders);
                }
            } catch (error) {
                console.error('🧪 Role test error:', error);
                return jsonResponse({ error: 'Role assignment failed', details: error.message }, 500, corsHeaders);
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
        const adminCommands = ['givepoints', 'deductpoints', 'process', 'dailyreward', 'adminconfig'];
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
            
            case 'adminconfig':
                return handleAdminConfigCommand(interaction, env);
            
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

    // Handle message component interactions (buttons, select menus)
    if (interaction.type === 3) {
        const customId = interaction.data.custom_id;
        
        // Check admin permission for suspension actions
        const isAdmin = await checkAdminRole(interaction.member, env);
        if (!isAdmin) {
            return jsonResponse({
                type: 4,
                data: {
                    content: '❌ You do not have permission to perform this action.',
                    flags: 64
                }
            });
        }
        
        if (customId === 'suspend_user_select') {
            const selectedUserId = interaction.data.values[0];
            const adminUser = interaction.member?.user || interaction.user;
            
            try {
                // Get user data
                const userData = await getUserData(selectedUserId, env);
                
                if (!userData) {
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: '❌ User not found.',
                            flags: 64
                        }
                    });
                }
                
                // Toggle suspension status
                const wasSuspended = userData.suspended === true;
                userData.suspended = !wasSuspended;
                userData.suspendedAt = wasSuspended ? null : new Date().toISOString();
                userData.suspendedBy = wasSuspended ? null : adminUser.id;
                
                // Save updated user data
                await env.USERS_KV.put(`user:${selectedUserId}`, JSON.stringify(userData));
                
                const action = wasSuspended ? 'unsuspended' : 'suspended';
                const emoji = wasSuspended ? '✅' : '⚠️';
                
                // Log to admin webhook
                const adminLogsWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
                try {
                    await fetch(adminLogsWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: `${emoji} User ${action.charAt(0).toUpperCase() + action.slice(1)}`,
                                description: `<@${selectedUserId}> has been ${action}`,
                                color: wasSuspended ? 0x10b981 : 0xef4444,
                                fields: [
                                    { name: '👤 User', value: `<@${selectedUserId}>`, inline: true },
                                    { name: '🆔 User ID', value: selectedUserId, inline: true },
                                    { name: '👨‍💼 Admin', value: `<@${adminUser.id}>`, inline: true },
                                    { name: '📊 Account', value: userData.robloxUsername || 'Unknown', inline: true }
                                ],
                                footer: { text: '🛡️ User Management' },
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
                        content: `${emoji} Successfully ${action} <@${selectedUserId}>`,
                        flags: 64
                    }
                });
            } catch (error) {
                console.error('Suspension error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error updating user suspension status.',
                        flags: 64
                    }
                });
            }
        }
    }

    // Handle modal submissions
    if (interaction.type === 5) {
        const customId = interaction.data.custom_id;
        
        // Check admin permission
        const isAdmin = await checkAdminRole(interaction.member, env);
        if (!isAdmin) {
            return jsonResponse({
                type: 4,
                data: {
                    content: '❌ You do not have permission to perform this action.',
                    flags: 64
                }
            });
        }
        
        if (customId === 'suspend_modal') {
            const discordId = interaction.data.components[0].components[0].value.trim();
            const adminUser = interaction.member?.user || interaction.user;
            
            // Validate Discord ID format
            if (!/^\d{17,20}$/.test(discordId)) {
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Invalid Discord ID format. Must be 17-20 digits.',
                        flags: 64
                    }
                });
            }
            
            try {
                // Get user data
                const userData = await getUserData(discordId, env);
                
                if (!userData) {
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: `❌ User with ID \`${discordId}\` not found in the system.`,
                            flags: 64
                        }
                    });
                }
                
                // Toggle suspension status
                const wasSuspended = userData.suspended === true;
                userData.suspended = !wasSuspended;
                userData.suspendedAt = wasSuspended ? null : new Date().toISOString();
                userData.suspendedBy = wasSuspended ? null : adminUser.id;
                
                // Save updated user data
                await env.USERS_KV.put(`user:${discordId}`, JSON.stringify(userData));
                
                const action = wasSuspended ? 'unsuspended' : 'suspended';
                const emoji = wasSuspended ? '✅' : '⚠️';
                
                // Send DM to user (try, but don't fail if we can't)
                try {
                    const dmChannelResponse = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ recipient_id: discordId })
                    });
                    
                    if (dmChannelResponse.ok) {
                        const dmChannel = await dmChannelResponse.json();
                        await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                embeds: [{
                                    title: wasSuspended ? '✅ Account Unsuspended' : '⚠️ Account Suspended',
                                    description: wasSuspended 
                                        ? 'Your MyCirkle account has been unsuspended. You can now access the dashboard and earn points again.'
                                        : 'Your MyCirkle account has been suspended. Please contact an administrator if you believe this was done in error.',
                                    color: wasSuspended ? 0x10b981 : 0xef4444,
                                    footer: { text: 'MyCirkle Account Management' },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                    }
                } catch (dmError) {
                    console.log('Could not send DM:', dmError);
                }
                
                // Log to admin webhook
                const adminLogsWebhook = 'https://discord.com/api/webhooks/1436826617853902948/ZBLTXr0vbLpZbj-fhEy_EosA64VbyS2P6GQPFnR96qQ6ojg7l9QoZEmI65v7f0PyvXvX';
                try {
                    await fetch(adminLogsWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: `${emoji} User ${action.charAt(0).toUpperCase() + action.slice(1)}`,
                                description: `<@${discordId}> has been ${action}`,
                                color: wasSuspended ? 0x10b981 : 0xef4444,
                                fields: [
                                    { name: '👤 User', value: `<@${discordId}>`, inline: true },
                                    { name: '🆔 User ID', value: discordId, inline: true },
                                    { name: '👨‍💼 Admin', value: `<@${adminUser.id}>`, inline: true },
                                    { name: '📊 Account', value: userData.robloxUsername || 'Unknown', inline: true }
                                ],
                                footer: { text: '🛡️ User Management' },
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
                        content: `${emoji} Successfully ${action} **${userData.robloxUsername || 'User'}** (<@${discordId}>)\n\n📊 **Account Details:**\n• Roblox: ${userData.robloxUsername || 'Unknown'}\n• Points: ${userData.points || 0}\n• Status: ${wasSuspended ? 'Active' : 'Suspended'}`,
                        flags: 64
                    }
                });
            } catch (error) {
                console.error('Suspension error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error updating user suspension status: ' + error.message,
                        flags: 64
                    }
                });
            }
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
    
    // Required admin role ID
    const REQUIRED_ADMIN_ROLE = '1436825229090623623';
    
    // Check if user has the specific admin role
    if (member.roles.includes(REQUIRED_ADMIN_ROLE)) {
        return true;
    }
    
    // Also check for Discord Administrator permission as fallback
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
        const tier = getTier(points);
        
        // Calculate next tier
        let nextTierText = '';
        if (points < 750) {
            nextTierText = `Silver 🥈 at 750 pts (${750 - points} pts away)`;
        } else if (points < 1000) {
            nextTierText = `Gold 🥇 at 1000 pts (${1000 - points} pts away)`;
        } else if (points < 2000) {
            nextTierText = `Diamond 💎 at 2000 pts (${2000 - points} pts away)`;
        } else {
            nextTierText = 'Max tier reached! 🎉';
        }

        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: `💰 ${userData.fullName || userData.discordUsername}'s Balance`,
                    color: 0x10b981,
                    fields: [
                        { name: '⭐ Points', value: `**${points}** points`, inline: true },
                        { name: '🎯 Tier', value: tier, inline: true },
                        { name: '📈 Next Tier', value: nextTierText, inline: false }
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

        const tier = getTier(userData.points || 0);

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
        // Get all users from KV
        const list = await env.USERS_KV.list({ prefix: 'user:' });
        
        if (!list || !list.keys || list.keys.length === 0) {
            return jsonResponse({
                type: 4,
                data: {
                    embeds: [{
                        title: '🏆 MyCirkle Leaderboard',
                        description: 'No users yet! Join MyCirkle to be the first on the leaderboard!',
                        color: 0xfbbf24
                    }]
                }
            });
        }
        
        // Fetch all user data
        const users = [];
        for (const key of list.keys) {
            try {
                const userData = await env.USERS_KV.get(key.name, 'json');
                if (userData && userData.points !== undefined) {
                    users.push({
                        name: userData.robloxUsername || userData.username || 'Unknown User',
                        discordId: userData.discordId,
                        points: parseInt(userData.points) || 0
                    });
                }
            } catch (err) {
                console.error('Error fetching user:', key.name, err);
            }
        }
        
        // Sort by points (highest first)
        users.sort((a, b) => b.points - a.points);
        
        // Take top 10
        const topUsers = users.slice(0, 10);
        
        // Build leaderboard text
        let leaderboardText = '';
        topUsers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            leaderboardText += `${medal} **${user.name}** - ${user.points.toLocaleString()} pts\n`;
        });
        
        return jsonResponse({
            type: 4,
            data: {
                embeds: [{
                    title: '🏆 MyCirkle Leaderboard',
                    description: leaderboardText || 'No users with points yet!',
                    color: 0xfbbf24,
                    footer: { text: `Total Members: ${users.length}` },
                    timestamp: new Date().toISOString()
                }]
            }
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        return jsonResponse({ 
            type: 4, 
            data: { 
                content: '❌ Error fetching leaderboard. Please try again later.', 
                flags: 64 
            } 
        });
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
        
        const oldPoints = userData.points || 0;
        const oldTier = getTier(oldPoints);
        userData.points = oldPoints + points;
        const newTier = getTier(userData.points);
        
        await saveUserData(userData, env);
        
        // Send DM to user about points received
        const botToken = env.DISCORD_BOT_TOKEN;
        if (botToken) {
            try {
                const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ recipient_id: targetUserId })
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
                            title: '✨ Points Received!',
                            description: `You've received **${points} points**!`,
                            color: 0x10b981,
                            fields: [
                                { name: '📝 Reason', value: reason, inline: false },
                                { name: '⭐ Points Added', value: `+${points}`, inline: true },
                                { name: '💰 New Balance', value: `${userData.points} points`, inline: true },
                                { name: '🏆 Current Tier', value: newTier, inline: true }
                            ],
                            footer: { text: 'MyCirkle Loyalty Program' },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });
            } catch (dmError) {
                console.error('DM error:', dmError);
            }
        }
        
        // Check for tier upgrade and send DM
        if (newTier !== oldTier) {
            await sendTierUpgradeDM(env, targetUserId, oldTier, newTier, userData.points);
        }
        
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
        
        const oldPoints = userData.points || 0;
        const oldTier = getTier(oldPoints);
        userData.points = Math.max(0, oldPoints - points);
        const newTier = getTier(userData.points);
        
        await saveUserData(userData, env);
        
        // Send DM to user about points deducted
        const botToken = env.DISCORD_BOT_TOKEN;
        if (botToken) {
            try {
                const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ recipient_id: targetUserId })
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
                            title: '⚠️ Points Deducted',
                            description: `**${points} points** have been deducted from your account.`,
                            color: 0xf59e0b,
                            fields: [
                                { name: '📝 Reason', value: reason, inline: false },
                                { name: '⭐ Points Removed', value: `-${points}`, inline: true },
                                { name: '💰 New Balance', value: `${userData.points} points`, inline: true },
                                { name: '🏆 Current Tier', value: newTier, inline: true }
                            ],
                            footer: { text: 'MyCirkle Loyalty Program' },
                            timestamp: new Date().toISOString()
                        }]
                    })
                });
            } catch (dmError) {
                console.error('DM error:', dmError);
            }
        }
        
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
        '20_off_product': { name: '20% off product', needsCoupon: true, discount: '20%' },
        '40_off_commission': { name: '40% off commission', needsCoupon: true, discount: '40%' },
        'free_product': { name: 'Free Product', needsCoupon: false }
    };
    
    const info = rewardInfo[reward];
    
    try {
        const userData = await getUserData(targetUserId, env);
        if (!userData) {
            return jsonResponse({ type: 4, data: { content: '❌ User not found', flags: 64 } });
        }
        
        const couponCode = `MYC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const botToken = env.DISCORD_BOT_TOKEN;
        
        // Send DM to user
        if (botToken) {
            try {
                const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ recipient_id: targetUserId })
                });
                const channel = await channelResponse.json();
                
                const dmEmbed = {
                    title: '🎉 Reward Processed!',
                    description: `Your **${info.name}** reward has been processed!`,
                    color: 0x10b981,
                    fields: [
                        { name: '🎁 Reward', value: info.name, inline: false }
                    ],
                    footer: { text: 'Thank you for being part of MyCirkle!' },
                    timestamp: new Date().toISOString()
                };
                
                if (info.needsCoupon) {
                    dmEmbed.fields.push({
                        name: '🎫 Your Coupon Code',
                        value: `\`${couponCode}\``,
                        inline: false
                    });
                }
                
                await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ embeds: [dmEmbed] })
                });
            } catch (dmError) {
                console.error('DM error:', dmError);
            }
        }
        
        // Log to redemption webhook
        const redemptionWebhook = 'https://discord.com/api/webhooks/1436826526883647569/mpdU8WILa-zH7hd3AI9wN6g2hUmNerpXbcq0WKzQeAEAL3A2MosB-56jvCRZtdYUPgGR';
        try {
            const embedData = {
                title: '✅ Reward Processed',
                description: `Processed **${info.name}** for <@${targetUserId}>`,
                color: 0x10b981,
                fields: [
                    { name: '👤 User', value: `<@${targetUserId}>`, inline: true },
                    { name: '🎁 Reward', value: info.name, inline: true },
                    { name: '👨‍💼 Processed By', value: `<@${adminUser.id}>`, inline: true }
                ],
                footer: { text: '🎉 Reward Processing Log' },
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
            description: `Successfully processed **${info.name}** for <@${targetUserId}>`,
            color: 0x10b981,
            fields: [
                { name: '🎁 Reward', value: info.name, inline: true },
                { name: '👤 User', value: `<@${targetUserId}>`, inline: true }
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

async function handleAdminConfigCommand(interaction, env) {
    const options = interaction.data.options;
    const action = options.find(opt => opt.name === 'action')?.value;
    
    if (action === 'suspend') {
        // Show modal for Discord ID input (instant response, no KV fetching)
        return jsonResponse({
            type: 9, // Type 9 = Modal response
            data: {
                custom_id: 'suspend_modal',
                title: 'Suspend/Unsuspend User',
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 4, // Text input
                                custom_id: 'discord_id_input',
                                label: 'Discord User ID',
                                style: 1, // Short text
                                placeholder: 'Enter the Discord ID (e.g., 1234567890)',
                                required: true,
                                min_length: 17,
                                max_length: 20
                            }
                        ]
                    }
                ]
            }
        });
    }
    
    return jsonResponse({
        type: 4,
        data: {
            content: '❌ Unknown action',
            flags: 64
        }
    });
}



// ===== EMAIL FUNCTIONS =====

// Send bulk emails via Resend
async function sendBulkEmails(env, users, subject, message) {
    const sent = [];
    
    // Use verified Resend domain
    const fromEmail = 'MyCirkle <mycirkle@notifications.cirkledevelopment.co.uk>';
    const headerImageUrl = 'https://www.dropbox.com/scl/fi/7chi01vofepeowexh8gk3/cirkledevtest.png?rlkey=qbrgav91n9vw63o7tv2ktphsw&st=e9zza41p&dl=1';
    const logoImageUrl = 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png';
    
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
                    from: fromEmail,
                    to: [user.email],
                    subject: personalizedSubject,
                    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;"><div style="text-align: center; padding: 0; margin: 0;"><img src="${headerImageUrl}" alt="MyCirkle Header" width="600" height="auto" style="width: 100%; max-width: 600px; height: auto; display: block; margin: 0; padding: 0; border: 0; outline: none;" /></div><div style="text-align: center; padding: 20px 0;"><img src="${logoImageUrl}" alt="MyCirkle Logo" width="80" height="80" style="width: 80px; height: 80px; display: block; margin: 0 auto; border: 0; outline: none;" /></div><div style="padding: 30px; background: #f9fafb;"><div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${personalizedMessage.split('\n').map(line => `<p style="color: #374151; line-height: 1.6;">${line}</p>`).join('')}</div></div><div style="background: #1f2937; padding: 20px; text-align: center;"><p style="color: #9ca3af; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} Cirkle Development. All rights reserved.</p><p style="color: #6b7280; margin: 5px 0 0 0; font-size: 11px;">To unsubscribe from future marketing emails, please open a support ticket in the MyCirkle Category.</p></div></div>`
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
    const headerImageUrl = 'https://www.dropbox.com/scl/fi/7chi01vofepeowexh8gk3/cirkledevtest.png?rlkey=qbrgav91n9vw63o7tv2ktphsw&st=e9zza41p&dl=1'; // MyCirkle header image
    const logoImageUrl = 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png'; // MyCirkle logo
    
    // Use verified Resend domain
    const fromEmail = 'MyCirkle <mycirkle@notifications.cirkledevelopment.co.uk>';
    
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
                        <img src="${headerImageUrl}" alt="MyCirkle Header" width="600" height="auto" style="width: 100%; max-width: 600px; height: auto; display: block; margin: 0; padding: 0; border: 0; outline: none;" />
                    </div>
                    
                    <!-- Logo -->
                    <div style="text-align: center; padding: 20px 0;">
                        <img src="${logoImageUrl}" alt="MyCirkle Logo" width="80" height="80" style="width: 80px; height: 80px; display: block; margin: 0 auto; border: 0; outline: none;" />
                    </div>
                    
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
                        <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 11px;">You're receiving this because you signed up for MyCirkle Marketing Updates.</p>
                        <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 11px;">To unsubscribe from future marketing emails, please open a support ticket in the MyCirkle Category.</p>
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
        console.log('📧 Adding to Resend mailing list:', { email, firstName, lastName });
        const audienceId = env.RESEND_AUDIENCE_ID || '22e67837-6cf5-426e-8c49-234b619a521f';
        console.log('📧 Using audience ID:', audienceId);
        
        const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
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
        
        console.log('📥 Resend API Response:');
        console.log('  - Status:', response.status, response.statusText);
        console.log('  - OK:', response.ok);
        
        const result = await response.json();
        console.log('  - Result:', JSON.stringify(result, null, 2));
        
        if (!response.ok) {
            // Check if it's a duplicate contact error (409 or specific error message)
            if (response.status === 409 || (result.message && result.message.includes('already exists'))) {
                console.log('⚠️ Contact already exists in mailing list (this is OK):', email);
                return { success: true, data: result, duplicate: true };
            }
            
            console.error('❌ Failed to add to mailing list:', result);
            throw new Error(`Resend API error: ${response.status} - ${JSON.stringify(result)}`);
        }
        
        console.log('✅ Successfully added to mailing list:', email);
        return { success: true, data: result, duplicate: false };
    } catch (error) {
        console.error('❌ Exception adding to mailing list:', error.message, error.stack);
        throw error; // Re-throw so signup process knows it failed
    }
}

// Remove email from Resend mailing list
async function removeFromMailingList(env, email) {
    try {
        console.log('🗑️ Removing from mailing list:', email);
        const audienceId = env.RESEND_AUDIENCE_ID || '22e67837-6cf5-426e-8c49-234b619a521f';
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

// Get mailing list contacts from Resend
async function getMailingListContacts(env) {
    try {
        const audienceId = env.RESEND_AUDIENCE_ID || '22e67837-6cf5-426e-8c49-234b619a521f';
        const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Failed to fetch mailing list:', response.status, errorText);
            return [];
        }
        
        const result = await response.json();
        console.log('✅ Mailing list contacts fetched:', result.data?.length || 0);
        return result.data || [];
    } catch (error) {
        console.error('❌ Failed to fetch mailing list:', error);
        return [];
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
            name: name || 'Unknown',
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
    const headerImageUrl = 'https://www.dropbox.com/scl/fi/7chi01vofepeowexh8gk3/cirkledevtest.png?rlkey=qbrgav91n9vw63o7tv2ktphsw&st=e9zza41p&dl=1';
    const logoImageUrl = 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png';
    
    // Use verified Resend domain
    const fromEmail = 'MyCirkle <mycirkle@notifications.cirkledevelopment.co.uk>';
    
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
                        <img src="${headerImageUrl}" alt="MyCirkle Header" width="600" height="auto" style="width: 100%; max-width: 600px; height: auto; display: block; margin: 0; padding: 0; border: 0; outline: none;" />
                    </div>
                    
                    <!-- Logo -->
                    <div style="text-align: center; padding: 20px 0;">
                        <img src="${logoImageUrl}" alt="MyCirkle Logo" width="80" height="80" style="width: 80px; height: 80px; display: block; margin: 0 auto; border: 0; outline: none;" />
                    </div>
                    
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

// Get tier based on points
function getTier(points) {
    if (points >= 2000) return 'Diamond 💎';
    if (points >= 1000) return 'Gold 🥇';
    if (points >= 750) return 'Silver 🥈';
    return 'Bronze 🥉';
}

// Send tier upgrade DM
async function sendTierUpgradeDM(env, userId, oldTier, newTier, points) {
    const botToken = env.DISCORD_BOT_TOKEN;
    if (!botToken) return;
    
    try {
        const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipient_id: userId })
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
                    title: '🎉 Tier Upgrade!',
                    description: `Congratulations! You've reached a new tier!`,
                    color: 0xfbbf24,
                    fields: [
                        { name: '📊 Previous Tier', value: oldTier, inline: true },
                        { name: '🆙 New Tier', value: newTier, inline: true },
                        { name: '💰 Current Points', value: `${points} points`, inline: false }
                    ],
                    footer: { text: 'Keep earning to reach even higher tiers!' },
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch (error) {
        console.error('Tier upgrade DM error:', error);
    }
}

