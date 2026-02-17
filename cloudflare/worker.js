// cloudflare/worker.js - MyCirkle Loyalty Program Backend
// 🛡️ PROTECTED BY SENTINEL SECURITY v2.0 - Enhanced Security Implementation

// ====================================================================================
// SENTINEL SECURITY SYSTEM - Advanced Protection Layer
// ====================================================================================
// Rate Limiting: 60 requests/minute per IP
// Request Validation: User-Agent, Origin, Malicious Pattern Detection  
// Security Headers: CSP, HSTS, X-Frame-Options, XSS Protection
// Webhook Protection: Never exposed in logs, environment variables only
// ====================================================================================

class SentinelSecurity {
    constructor() {
        this.rateLimits = new Map();
        this.blockedIPs = new Set();
    }

    async checkRateLimit(ip) {
        const now = Date.now();
        const key = `rate_${ip}`;
        const limit = this.rateLimits.get(key) || { count: 0, resetTime: now + 60000 };
        
        if (now > limit.resetTime) {
            limit.count = 1;
            limit.resetTime = now + 60000;
        } else {
            limit.count++;
        }
        
        this.rateLimits.set(key, limit);
        
        if (limit.count > 60) {
            this.blockedIPs.add(ip);
            return false;
        }
        
        return true;
    }

    validateRequest(request) {
        const userAgent = request.headers.get('user-agent') || '';
        
        if (!userAgent || userAgent.length < 10) {
            return { valid: false, reason: 'Invalid user agent' };
        }
        
        const malicious = ['sqlmap', 'nikto', 'nmap', 'masscan', 'burp', 'scanner', 
                          'exploit', 'hack', 'injection', 'xss', 'bypass', 'attack'];
        
        const lowerUA = userAgent.toLowerCase();
        for (const pattern of malicious) {
            if (lowerUA.includes(pattern)) {
                return { valid: false, reason: 'Malicious pattern detected' };
            }
        }
        
        return { valid: true };
    }

    getSecurityHeaders() {
        return {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'Content-Security-Policy': [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
                "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
                "img-src 'self' data: https: blob:",
                "connect-src 'self' https://*.workers.dev https://discord.com https://api.roblox.com https://sheets.googleapis.com",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'"
            ].join('; '),
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
            'X-Protected-By': 'SENTINEL-Security-v2.0',
            'X-Security-Status': 'Enhanced-Protection-Active'
        };
    }
}

const SENTINEL = new SentinelSecurity();

// ====================================================================================
// SECURE WEBHOOK MANAGER - Environment Variables Only, Never Hardcoded
// ====================================================================================
function getWebhooks(env) {
    return {
        ACCOUNT: env.ACCOUNT_WEBHOOK || '',
        REDEMPTION: env.REDEMPTION_WEBHOOK || '',
        POINTS: env.POINTS_WEBHOOK || '',
        LOGS: env.LOGS_WEBHOOK || '',
        DELETION: env.DELETION_WEBHOOK || '',
        WELCOME: env.WELCOME_WEBHOOK || ''
    };
}


export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
        
        // ========== SENTINEL SECURITY CHECKS ==========
        
        // 1. Check if IP is blocked
        if (SENTINEL.blockedIPs.has(clientIP)) {
            return new Response('Access Denied - Rate limit exceeded', {
                status: 429,
                headers: { ...SENTINEL.getSecurityHeaders(), 'Retry-After': '3600' }
            });
        }
        
        // 2. Rate limiting
        const rateLimitOK = await SENTINEL.checkRateLimit(clientIP);
        if (!rateLimitOK) {
            return new Response('Too Many Requests - Protected by SENTINEL Security', {
                status: 429,
                headers: { ...SENTINEL.getSecurityHeaders(), 'Retry-After': '60' }
            });
        }
        
        // 3. Request validation  
        const validation = SENTINEL.validateRequest(request);
        if (!validation.valid) {
            return new Response(`Security Check Failed: ${validation.reason}`, {
                status: 403,
                headers: SENTINEL.getSecurityHeaders()
            });
        }
        
        // ========== END SENTINEL SECURITY ==========

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            ...SENTINEL.getSecurityHeaders()
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

        // MyCirkle Membership Verification API
        // This endpoint checks if a Discord user has a MyCirkle membership
        if (path === '/api/verify-membership' && request.method === 'POST') {
            try {
                const { discordId } = await request.json();
                
                if (!discordId) {
                    return jsonResponse({ 
                        error: 'Discord ID required',
                        verified: false 
                    }, 400, corsHeaders);
                }
                
                // Check if user exists in MyCirkle database
                const userData = await getUserData(discordId, env);
                
                if (userData && userData.accountNumber) {
                    // User has a MyCirkle account
                    return jsonResponse({
                        verified: true,
                        message: 'You have been verified as a MyCirkle member!',
                        member: {
                            discordUsername: userData.discordUsername,
                            accountNumber: userData.accountNumber,
                            points: userData.points || 0,
                            memberSince: userData.memberSince,
                            tier: getTier(userData.points || 0)
                        }
                    }, 200, corsHeaders);
                } else {
                    // User does not have a MyCirkle account
                    return jsonResponse({
                        verified: false,
                        message: "I'm sorry. I could not find your MyCirkle account. Please check if you are on the right Discord account or sign up at my.cirkledevelopment.co.uk"
                    }, 200, corsHeaders);
                }
            } catch (error) {
                console.error('Membership verification error:', error);
                return jsonResponse({ 
                    error: 'Failed to verify membership',
                    details: error.message,
                    verified: false 
                }, 500, corsHeaders);
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
                    referralCount: 0, // Track how many people used this user's code
                    loginStreak: 0, // Daily login streak counter
                    lastLoginDate: null // Last login date (YYYY-MM-DD format)
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
                        
                        // Send DM to new user about referral bonus
                        try {
                            await new Promise(resolve => setTimeout(resolve, 200));
                            const newUserChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'MyCirkle-Loyalty/1.0'
                                },
                                body: JSON.stringify({ recipient_id: discordId })
                            });
                            
                            if (newUserChannelResponse.ok) {
                                const newUserChannel = await newUserChannelResponse.json();
                                await new Promise(resolve => setTimeout(resolve, 100));
                                await fetch(`https://discord.com/api/v10/channels/${newUserChannel.id}/messages`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                                        'Content-Type': 'application/json',
                                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                                    },
                                    body: JSON.stringify({
                                        embeds: [{
                                            title: '🎉 Referral Bonus Earned!',
                                            description: `You've earned **75 bonus points** for using **${referrerData.firstName}'s** referral code!`,
                                            color: 0x10b981,
                                            fields: [
                                                { name: '💰 Bonus Points', value: '75 Points', inline: true },
                                                { name: '👤 Referred By', value: referrerData.firstName, inline: true }
                                            ],
                                            footer: { text: 'Thanks for joining MyCirkle!' },
                                            timestamp: new Date().toISOString()
                                        }]
                                    })
                                });
                            }
                        } catch (dmError) {
                            console.error('Error sending referral DM to new user:', dmError);
                        }
                        
                        // Send DM to referrer about successful referral
                        try {
                            await new Promise(resolve => setTimeout(resolve, 200));
                            const referrerChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'MyCirkle-Loyalty/1.0'
                                },
                                body: JSON.stringify({ recipient_id: referrerData.discordId })
                            });
                            
                            if (referrerChannelResponse.ok) {
                                const referrerChannel = await referrerChannelResponse.json();
                                await new Promise(resolve => setTimeout(resolve, 100));
                                await fetch(`https://discord.com/api/v10/channels/${referrerChannel.id}/messages`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                                        'Content-Type': 'application/json',
                                        'User-Agent': 'MyCirkle-Loyalty/1.0'
                                    },
                                    body: JSON.stringify({
                                        embeds: [{
                                            title: '🎊 Someone Used Your Referral Code!',
                                            description: `**${firstName}** just signed up using your referral code! You both earned **75 bonus points**!`,
                                            color: 0x667eea,
                                            fields: [
                                                { name: '💰 Your Bonus', value: '75 Points', inline: true },
                                                { name: '👤 New Member', value: firstName, inline: true },
                                                { name: '📊 Total Referrals', value: String(referrerData.referralCount), inline: true }
                                            ],
                                            footer: { text: 'Keep sharing your code to earn more!' },
                                            timestamp: new Date().toISOString()
                                        }]
                                    })
                                });
                            }
                        } catch (dmError) {
                            console.error('Error sending referral DM to referrer:', dmError);
                        }
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
                const webhookUrl1 = getWebhooks(env).WELCOME;
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
                    
                    await fetch(webhookUrl1, {
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
                        const webhookUrl2 = getWebhooks(env).LOGS;
                        await fetch(webhookUrl2, {
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
                        const webhookUrl3 = getWebhooks(env).ACCOUNT;
                        try {
                            await fetch(webhookUrl3, {
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
                        const webhookUrl4 = getWebhooks(env).ACCOUNT;
                        try {
                            await fetch(webhookUrl4, {
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
                    const webhookUrl5 = getWebhooks(env).ACCOUNT;
                    try {
                        await fetch(webhookUrl5, {
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
                const webhookUrl6 = getWebhooks(env).ACCOUNT;
                try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    const webhookResponse = await fetch(webhookUrl6, {
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

        // API: Get user data with products
        if (path === '/api/user-data' && request.method === 'GET') {
            try {
                const discordId = url.searchParams.get('discordId');
                
                if (!discordId) {
                    return jsonResponse({ error: 'Missing discordId' }, 400, corsHeaders);
                }

                const userData = await env.USERS_KV?.get(`user:${discordId}`, { type: 'json' }) || {};
                
                return jsonResponse(userData, 200, corsHeaders);
            } catch (error) {
                return jsonResponse({ error: 'Failed to fetch user data', details: error.message }, 500, corsHeaders);
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

                // Store redemption in history
                const redemptionsKey = `redemptions:${discordId}`;
                let redemptions = await env.USERS_KV.get(redemptionsKey, 'json') || [];
                redemptions.unshift({
                    rewardType,
                    pointsCost,
                    code,
                    timestamp: new Date().toISOString()
                });
                // Keep only last 50 redemptions
                if (redemptions.length > 50) redemptions.length = 50;
                await env.USERS_KV.put(redemptionsKey, JSON.stringify(redemptions));

                // Log to redemption webhook
                const redemptionWebhook = getWebhooks(env).REDEMPTION;
                console.log('🔔 Sending to REDEMPTION webhook:', redemptionWebhook ? 'SET' : 'NOT SET');
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
                    console.log('✅ Redemption webhook sent successfully');
                } catch (webhookError) {
                    console.error('❌ Webhook error:', webhookError);
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
                    const deletionWebhook = getWebhooks(env).DELETION;
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
                
                // Always fetch user data from Google Sheets to get points
                console.log('📄 Fetching users from Google Sheets for points data...');
                const allUsers = await getAllUsers(env);
                console.log(`📄 Found ${allUsers.length} total users`);
                
                // Create email to user data map
                const userDataMap = new Map();
                allUsers.forEach(user => {
                    if (user.email) {
                        userDataMap.set(user.email.toLowerCase(), user);
                    }
                });
                
                // If using Resend audience contacts, merge with points data
                if (recipients === 'all' && mailingList.length > 0) {
                    console.log(`✅ Using ${mailingList.length} contacts from Resend audience`);
                    
                    const targetUsers = mailingList.map(contact => {
                        const userData = userDataMap.get(contact.email.toLowerCase());
                        return {
                            email: contact.email,
                            firstName: contact.first_name || 'Member',
                            lastName: contact.last_name || '',
                            fullName: `${contact.first_name || 'Member'} ${contact.last_name || ''}`.trim(),
                            points: userData?.points || 0,
                            discordId: userData?.discordId || null
                        };
                    });
                    
                    console.log(`🎯 Target users: ${targetUsers.length}`);
                    
                    // Send emails via Resend with rate limiting and progress updates
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
                
                // Filter to only users who are in the mailing list (already have allUsers from above)
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

                // Send emails via Resend with rate limiting and progress updates
                const sent = await sendBulkEmailsWithProgress(env, targetUsers, subject, message);
                
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
                    const webhookUrl7 = getWebhooks(env).ACCOUNT;
                    await fetch(getWebhooks(env).LOGS, {
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

        // Get redemption history endpoint
        if (path === '/api/get-redemptions' && request.method === 'GET') {
            try {
                const url = new URL(request.url);
                const discordId = url.searchParams.get('discordId');
                const limit = parseInt(url.searchParams.get('limit')) || 5;
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId parameter required' }, 400, corsHeaders);
                }
                
                const redemptionsKey = `redemptions:${discordId}`;
                let redemptions = await env.USERS_KV.get(redemptionsKey, 'json') || [];
                
                // Return limited number
                redemptions = redemptions.slice(0, limit);
                
                return jsonResponse({ redemptions }, 200, corsHeaders);
            } catch (error) {
                console.error('Get redemptions error:', error);
                return jsonResponse({ error: error.message }, 500, corsHeaders);
            }
        }

        // Daily login check endpoint
        if (path === '/api/check-daily-login' && request.method === 'POST') {
            try {
                const data = await request.json();
                const { discordId } = data;
                
                if (!discordId) {
                    return jsonResponse({ error: 'discordId required' }, 400, corsHeaders);
                }
                
                // Get user data
                const userData = await getUserData(discordId, env);
                if (!userData) {
                    return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                }
                
                const now = new Date();
                const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
                
                // Check last login date
                const lastLoginDate = userData.lastLoginDate || null;
                const loginStreak = userData.loginStreak || 0;
                
                // If already logged in today, return existing data
                if (lastLoginDate === today) {
                    return jsonResponse({ 
                        alreadyLoggedIn: true,
                        streak: loginStreak,
                        points: userData.points
                    }, 200, corsHeaders);
                }
                
                // Calculate new streak
                let newStreak = loginStreak;
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                
                if (lastLoginDate === yesterdayStr) {
                    // Continued streak
                    newStreak += 1;
                } else if (lastLoginDate) {
                    // Streak broken, reset to 1
                    newStreak = 1;
                } else {
                    // First login ever
                    newStreak = 1;
                }
                
                // Calculate points reward
                let pointsReward = 2; // Daily base reward
                let isStreakBonus = false;
                
                if (newStreak % 7 === 0) {
                    // 7th day bonus - give 25 points instead of 2
                    pointsReward = 25;
                    isStreakBonus = true;
                }
                
                // Update user data
                userData.points = (userData.points || 0) + pointsReward;
                userData.lastLoginDate = today;
                userData.loginStreak = newStreak;
                
                // Save to KV
                await env.USERS_KV?.put(`user:${discordId}`, JSON.stringify(userData));
                
                // Add activity
                const activities = JSON.parse(await env.USERS_KV?.get(`activities:${discordId}`) || '[]');
                activities.unshift({
                    type: isStreakBonus ? 'daily_reward' : 'login',
                    description: isStreakBonus ? `7-day streak bonus! 🎉` : 'Daily login',
                    points: pointsReward,
                    timestamp: now.toISOString()
                });
                if (activities.length > 50) activities.length = 50;
                await env.USERS_KV?.put(`activities:${discordId}`, JSON.stringify(activities));
                
                // Calculate days until next bonus
                const daysUntilBonus = 7 - (newStreak % 7);
                
                return jsonResponse({ 
                    firstLoginToday: true,
                    pointsEarned: pointsReward,
                    newStreak: newStreak,
                    totalPoints: userData.points,
                    isStreakBonus: isStreakBonus,
                    daysUntilBonus: daysUntilBonus === 7 ? 7 : daysUntilBonus
                }, 200, corsHeaders);
                
            } catch (error) {
                console.error('Daily login check error:', error);
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
                                const webhookUrl8 = getWebhooks(env).ACCOUNT;
                                await fetch(getWebhooks(env).LOGS, {
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
                const webhookUrl9 = getWebhooks(env).ACCOUNT;
                await fetch(getWebhooks(env).LOGS, {
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

        // API: Get Payhip products
        if (path === '/api/payhip-products' && request.method === 'GET') {
            try {
                console.log('Fetching Payhip products...');
                
                // Try to get products from cache first
                let cachedProducts = await env.USERS_KV?.get('payhip_products_cache', { type: 'json' });
                
                if (cachedProducts && cachedProducts.cached_at) {
                    const cacheAge = Date.now() - new Date(cachedProducts.cached_at).getTime();
                    // Use cache if less than 10 minutes old
                    if (cacheAge < 600000) {
                        console.log('Returning cached Payhip products');
                        return jsonResponse({ 
                            success: true,
                            products: cachedProducts.products,
                            cached: true
                        }, 200, corsHeaders);
                    }
                }
                
                // Fetch from your timeclock backend's Payhip sync endpoint
                console.log('Fetching fresh products from Payhip sync endpoint...');
                const syncResponse = await fetch('https://timeclock-backend.marcusray.workers.dev/api/finance/sync-payhip', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('Payhip sync response status:', syncResponse.status);
                
                if (!syncResponse.ok) {
                    const errorText = await syncResponse.text();
                    console.error('Payhip sync failed, will use fallback');
                    throw new Error(`Payhip sync returned ${syncResponse.status}`);
                }
                
                const syncData = await syncResponse.json();
                console.log('Payhip sync successful, products count:', syncData.products?.length || 0);
                
                if (!syncData.success || !syncData.products || syncData.products.length === 0) {
                    throw new Error('No products returned from Payhip');
                }
                
                // Transform products to match our format (strip sensitive HTML)
                const products = syncData.products.map(product => ({
                    id: product.payhipId || product.id,
                    name: product.name,
                    description: (product.description || '').replace(/<[^>]*>/g, '').substring(0, 200), // Strip HTML, limit length
                    price: product.price ? `€${(product.price / 80).toFixed(2)}` : 'N/A' // Price in EUR (Robux converted to EUR approximation)
                }));
                
                console.log('Transformed products:', products.length);
                
                // Cache the results for 10 minutes
                await env.USERS_KV?.put('payhip_products_cache', JSON.stringify({
                    products: products,
                    cached_at: new Date().toISOString()
                }), {
                    expirationTtl: 600
                });
                
                // Also update the manual config as backup
                await env.USERS_KV?.put('payhip_products', JSON.stringify(products));
                
                return jsonResponse({ 
                    success: true,
                    products: products,
                    source: 'payhip_sync',
                    count: products.length
                }, 200, corsHeaders);
            } catch (error) {
                console.error('Payhip products error:', error);
                
                // Fallback to manually configured products in KV
                console.log('Attempting to load manually configured products from KV...');
                let fallbackProducts = await env.USERS_KV?.get('payhip_products', { type: 'json' });
                
                if (fallbackProducts && fallbackProducts.length > 0) {
                    console.log('Using manually configured products:', fallbackProducts.length);
                    return jsonResponse({ 
                        success: true,
                        products: fallbackProducts,
                        source: 'manual_config'
                    }, 200, corsHeaders);
                }
                
                // Final fallback to demo products
                fallbackProducts = [
                    { id: 'demo_product_1', name: 'Demo Product 1', description: 'Sample product for testing', price: '$9.99' },
                    { id: 'demo_product_2', name: 'Demo Product 2', description: 'Another sample product', price: '$19.99' },
                    { id: 'demo_product_3', name: 'Demo Product 3', description: 'Third sample product', price: '$29.99' }
                ];
                
                return jsonResponse({ 
                    success: true,
                    error: error.message,
                    products: fallbackProducts,
                    source: 'fallback'
                }, 200, corsHeaders);
            }
        }

        // API: Request product access
        if (path === '/api/request-product' && request.method === 'POST') {
            try {
                const { discordId, productId, productName, userName } = await request.json();
                
                if (!discordId || !productId || !productName) {
                    return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
                }
                
                const botToken = env.DISCORD_BOT_TOKEN;
                const requestsChannelId = env.PRODUCT_REQUESTS_CHANNEL_ID || '1315045336040869888'; // Default to support channel
                
                if (!botToken) {
                    return jsonResponse({ error: 'Bot not configured' }, 500, corsHeaders);
                }
                
                // Send embed to Discord with approve/deny buttons
                const embedResponse = await fetch(`https://discord.com/api/v10/channels/${requestsChannelId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            title: '🆕 New Product Request',
                            description: `**${userName || `<@${discordId}>`}** has requested access to a product.`,
                            color: 0x6366f1,
                            fields: [
                                { name: '👤 User', value: `<@${discordId}>`, inline: true },
                                { name: '🆔 User ID', value: discordId, inline: true },
                                { name: '📦 Product', value: productName, inline: false },
                                { name: '🔖 Product ID', value: productId, inline: false }
                            ],
                            footer: { text: '⏰ Pending Approval' },
                            timestamp: new Date().toISOString()
                        }],
                        components: [{
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    style: 3,
                                    label: 'Approve',
                                    custom_id: `approve_product_${discordId}_${productId}`,
                                    emoji: { name: '✅' }
                                },
                                {
                                    type: 2,
                                    style: 4,
                                    label: 'Deny',
                                    custom_id: `deny_product_${discordId}_${productId}`,
                                    emoji: { name: '❌' }
                                }
                            ]
                        }]
                    })
                });
                
                if (!embedResponse.ok) {
                    const errorText = await embedResponse.text();
                    throw new Error(`Discord API error: ${errorText}`);
                }
                
                const messageData = await embedResponse.json();
                
                // Store request in KV for reference
                await env.USERS_KV?.put(`product_request:${messageData.id}`, JSON.stringify({
                    discordId,
                    productId,
                    productName,
                    userName,
                    requestedAt: new Date().toISOString(),
                    status: 'pending'
                }), {
                    expirationTtl: 604800 // 7 days
                });
                
                return jsonResponse({ 
                    success: true,
                    message: 'Product request sent successfully!',
                    messageId: messageData.id
                }, 200, corsHeaders);
            } catch (error) {
                console.error('Product request error:', error);
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
        const adminCommands = ['givepoints', 'deductpoints', 'process', 'dailyreward', 'adminconfig', 'productembed', 'removeproduct', 'embed'];
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
            
            case 'productembed':
                return handleProductEmbedCommand(interaction, env);
            
            case 'removeproduct':
                return handleRemoveProductCommand(interaction, env);
            
            case 'embed':
                return handleEmbedCommand(interaction, env);
            
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
        
        // Handle product request approve/deny buttons
        if (customId.startsWith('approve_product_') || customId.startsWith('deny_product_')) {
            const isApproval = customId.startsWith('approve_product_');
            const parts = customId.split('_');
            const targetUserId = parts[2];
            const productId = parts.slice(3).join('_');
            const adminUser = interaction.member?.user || interaction.user;
            
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
            
            try {
                const botToken = env.DISCORD_BOT_TOKEN;
                
                // Get the original message to extract product name
                const messageId = interaction.message.id;
                const channelId = interaction.channel_id;
                const requestData = await env.USERS_KV?.get(`product_request:${messageId}`, { type: 'json' });
                const productName = requestData?.productName || 'Unknown Product';
                
                if (isApproval) {
                    // APPROVAL FLOW
                    // 1. Get user data and add product to their account
                    let userData = await getUserData(targetUserId, env);
                    
                    // Initialize user data if it doesn't exist
                    if (!userData) {
                        userData = {
                            discordId: targetUserId,
                            products: []
                        };
                    }
                    
                    // Initialize products array if it doesn't exist
                    if (!userData.products) {
                        userData.products = [];
                    }
                    
                    console.log('Adding product to user:', targetUserId, 'Product:', productId);
                    
                    // Add product if not already present
                    if (!userData.products.find(p => p.id === productId)) {
                        userData.products.push({
                            id: productId,
                            name: productName,
                            addedAt: new Date().toISOString(),
                            addedBy: 'admin_approval',
                            approvedBy: adminUser.id
                        });
                        
                        console.log('Saving user data with products:', userData.products);
                        await env.USERS_KV.put(`user:${targetUserId}`, JSON.stringify(userData));
                        console.log('Product saved successfully');
                    } else {
                        console.log('Product already exists for user');
                    }
                    
                    // 2. Send DM to user
                    try {
                        const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ recipient_id: targetUserId })
                        });
                        
                        const dmChannel = await dmChannelResponse.json();
                        
                        await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                embeds: [{
                                    title: '✅ Product Request Approved!',
                                    description: `Your request for **${productName}** has been approved!`,
                                    color: 0x10b981,
                                    fields: [
                                        { name: '📦 Product', value: productName, inline: false },
                                        { name: '✨ Status', value: 'The product has been added to your dashboard', inline: false }
                                    ],
                                    footer: { text: 'MyCirkle Product Access' },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                    } catch (dmError) {
                        console.error('Failed to send approval DM:', dmError);
                    }
                    
                    // 3. Update the original embed to green with removed buttons
                    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            embeds: [{
                                ...interaction.message.embeds[0],
                                color: 0x10b981,
                                footer: { text: `✅ Approved by ${adminUser.username}` },
                                timestamp: new Date().toISOString()
                            }],
                            components: []
                        })
                    });
                    
                    // Update request status in KV
                    if (requestData) {
                        requestData.status = 'approved';
                        requestData.approvedBy = adminUser.id;
                        requestData.approvedAt = new Date().toISOString();
                        await env.USERS_KV.put(`product_request:${messageId}`, JSON.stringify(requestData), {
                            expirationTtl: 604800
                        });
                    }
                    
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: `✅ Approved product access for <@${targetUserId}>`,
                            flags: 64
                        }
                    });
                } else {
                    // DENIAL FLOW
                    // 1. Send DM to user
                    try {
                        const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ recipient_id: targetUserId })
                        });
                        
                        const dmChannel = await dmChannelResponse.json();
                        
                        await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                embeds: [{
                                    title: '❌ Product Request Denied',
                                    description: `Your request for **${productName}** has been denied.`,
                                    color: 0xef4444,
                                    fields: [
                                        { name: '📦 Product', value: productName, inline: false },
                                        { name: '💬 Note', value: 'Please contact an administrator if you believe this was in error.', inline: false }
                                    ],
                                    footer: { text: 'MyCirkle Product Access' },
                                    timestamp: new Date().toISOString()
                                }]
                            })
                        });
                    } catch (dmError) {
                        console.error('Failed to send denial DM:', dmError);
                    }
                    
                    // 2. Update the original embed to red with removed buttons
                    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            embeds: [{
                                ...interaction.message.embeds[0],
                                color: 0xef4444,
                                footer: { text: `❌ Denied by ${adminUser.username}` },
                                timestamp: new Date().toISOString()
                            }],
                            components: []
                        })
                    });
                    
                    // Update request status in KV
                    if (requestData) {
                        requestData.status = 'denied';
                        requestData.deniedBy = adminUser.id;
                        requestData.deniedAt = new Date().toISOString();
                        await env.USERS_KV.put(`product_request:${messageId}`, JSON.stringify(requestData), {
                            expirationTtl: 604800
                        });
                    }
                    
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: `❌ Denied product access for <@${targetUserId}>`,
                            flags: 64
                        }
                    });
                }
            } catch (error) {
                console.error('Product approval/denial error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error processing product request.',
                        flags: 64
                    }
                });
            }
        }
        
        // Handle guidelines dropdown menu
        if (customId === 'guidelines_dropdown') {
            const selectedOption = interaction.data.values[0];
            const botToken = env.DISCORD_BOT_TOKEN;
            
            try {
                if (selectedOption === 'guidelines_ad') {
                    // Send hidden ad message with codeblock button
                    const adContent = `## INVITE | Cirkle Development 
*"building connections, creating solutions"*

Looking for sleek, modern products already made for your game? Look no further then Cirkle. With our bilingual customer service, veteran developers and reliable products.. you can rely on **us** for your needs.

📦 **Why Choose Us?**
- **Veteran Developers**: Stunning maps, immersive worlds, and unique assets tailored to your needs.
- **Creative Scripting:** Smooth mechanics, custom features, and innovative game systems.
- **Collaborative Approach:** We work with you every step of the way to ensure your ideas are in *our* product list.
- **Unique Systems:** Cirkle Development uses many systems to ensure consistency. We use our one of a kind, custom, most advanced and streamlined Staffing Portal out of all tech groups! This ensures consistency and flexibility within our team 

Cirkle Development is proud to announce the first ever advanced and comprehensive customer loyalty program, MyCirkle. A completely free and useful account with Cirkle Development! Literally send some chats, buy some products, enagage in events/giveaways to earn points! Join our discord server and signup in 2 minutes!

**Join Cirkle Development!** 
🔗: https://discord.gg/2452XzVPZd
🌐: **https://shop.cirkledevelopment.co.uk**
🌐: **https://allcareers.cirkledevelopment.co.uk**`;

                    return jsonResponse({
                        type: 4,
                        data: {
                            embeds: [{
                                title: 'Cirkle Development Advertisement',
                                description: adContent,
                                color: 0x10b981,
                                image: {
                                    url: 'https://media.discordapp.net/attachments/1315044517199740928/1439306370229866606/image.png?ex=691a0a03&is=6918b883&hm=aeba16a161182e3ccd1f3486718f5170e75c95559f0d2e92bfff016303ba2df6&=&format=webp&quality=lossless'
                                }
                            }],
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            style: 1,
                                            label: 'Show codeblock',
                                            custom_id: 'ad_toggle_codeblock'
                                        }
                                    ]
                                }
                            ],
                            flags: 64 // Ephemeral/hidden message
                        }
                    });
                } else if (selectedOption === 'guidelines_team') {
                    // Send hidden message with team image
                    return jsonResponse({
                        type: 4,
                        data: {
                            embeds: [{
                                title: 'Meet the Cirkle Development Team',
                                color: 0x10b981,
                                image: {
                                    url: 'https://media.discordapp.net/attachments/1315674711719547003/1473328133297012787/meettheteam.png?ex=6995cf40&is=69947dc0&hm=95834a379fe3c1876ed434a6a72cb03793a1419c0e22b309d8ad99df40529ace&=&format=webp&quality=lossless'
                                }
                            }],
                            flags: 64 // Ephemeral/hidden message
                        }
                    });
                }
            } catch (error) {
                console.error('Guidelines dropdown error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error loading selection.',
                        flags: 64
                    }
                });
            }
        }
        
        // Handle codeblock toggle button
        if (customId === 'ad_toggle_codeblock') {
            const adContent = `## INVITE | Cirkle Development 
*"building connections, creating solutions"*

Looking for sleek, modern products already made for your game? Look no further then Cirkle. With our bilingual customer service, veteran developers and reliable products.. you can rely on **us** for your needs.

📦 **Why Choose Us?**
- **Veteran Developers**: Stunning maps, immersive worlds, and unique assets tailored to your needs.
- **Creative Scripting:** Smooth mechanics, custom features, and innovative game systems.
- **Collaborative Approach:** We work with you every step of the way to ensure your ideas are in *our* product list.
- **Unique Systems:** Cirkle Development uses many systems to ensure consistency. We use our one of a kind, custom, most advanced and streamlined Staffing Portal out of all tech groups! This ensures consistency and flexibility within our team 

Cirkle Development is proud to announce the first ever advanced and comprehensive customer loyalty program, MyCirkle. A completely free and useful account with Cirkle Development! Literally send some chats, buy some products, enagage in events/giveaways to earn points! Join our discord server and signup in 2 minutes!

**Join Cirkle Development!** 
🔗: https://discord.gg/2452XzVPZd
🌐: **https://shop.cirkledevelopment.co.uk**
🌐: **https://allcareers.cirkledevelopment.co.uk**

https://media.discordapp.net/attachments/1315044517199740928/1439306370229866606/image.png?ex=691a0a03&is=6918b883&hm=aeba16a161182e3ccd1f3486718f5170e75c95559f0d2e92bfff016303ba2df6&=&format=webp&quality=lossless`;

            const messageId = interaction.message.id;
            const channelId = interaction.channel_id;
            
            try {
                // Get current message to check if it's in codeblock
                const currentMessage = interaction.message;
                const currentButtonLabel = currentMessage.components?.[0]?.components?.[0]?.label;
                const isCurrentlyCodeblock = currentButtonLabel === 'Show normal';
                
                if (isCurrentlyCodeblock) {
                    // Switch to normal - show embed version
                    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: null,
                            embeds: [{
                                title: 'Cirkle Development Advertisement',
                                description: adContent.split('\n\nhttps://')[0],
                                color: 0x10b981,
                                image: {
                                    url: 'https://media.discordapp.net/attachments/1315044517199740928/1439306370229866606/image.png?ex=691a0a03&is=6918b883&hm=aeba16a161182e3ccd1f3486718f5170e75c95559f0d2e92bfff016303ba2df6&=&format=webp&quality=lossless'
                                }
                            }],
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            style: 1,
                                            label: 'Show codeblock',
                                            custom_id: 'ad_toggle_codeblock'
                                        }
                                    ]
                                }
                            ]
                        })
                    });
                } else {
                    // Switch to codeblock
                    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: `\`\`\`\n${adContent}\n\`\`\``,
                            embeds: [],
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            style: 1,
                                            label: 'Show normal',
                                            custom_id: 'ad_toggle_codeblock'
                                        }
                                    ]
                                }
                            ]
                        })
                    });
                }
                
                return jsonResponse({
                    type: 4,
                    data: {
                        content: isCurrentlyCodeblock ? '✅ Switched to normal view' : '✅ Switched to codeblock view',
                        flags: 64
                    }
                });
            } catch (error) {
                console.error('Codeblock toggle error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error updating message.',
                        flags: 64
                    }
                });
            }
        }
        
        // Handle advertising access button
        if (customId === 'advertising_access_button') {
            const userId = interaction.member?.user?.id || interaction.user?.id;
            const roleId = '1323791955569938554';
            const guildId = interaction.guild_id;
            const botToken = env.DISCORD_BOT_TOKEN;
            
            try {
                // Check if user already has the role
                const memberResponse = await fetch(
                    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
                    {
                        headers: {
                            'Authorization': `Bot ${botToken}`
                        }
                    }
                );
                
                if (!memberResponse.ok) {
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: '❌ Could not verify member status.',
                            flags: 64
                        }
                    });
                }
                
                const memberData = await memberResponse.json();
                const hasRole = memberData.roles.includes(roleId);
                
                if (hasRole) {
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: 'You already have advertising access!',
                            flags: 64
                        }
                    });
                }
                
                // Add role to user
                const roleResponse = await fetch(
                    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({})
                    }
                );
                
                if (!roleResponse.ok) {
                    return jsonResponse({
                        type: 4,
                        data: {
                            content: '❌ Failed to grant advertising access.',
                            flags: 64
                        }
                    });
                }
                
                // Increment advertiser count
                let advertiserData = { count: 0 };
                try {
                    const existing = await env.USERS_KV.get('advertising_advertiser_count', { type: 'json' });
                    if (existing && existing.count) {
                        advertiserData.count = existing.count + 1;
                    } else {
                        advertiserData.count = 1;
                    }
                } catch (err) {
                    advertiserData.count = 1;
                }
                
                await env.USERS_KV.put('advertising_advertiser_count', JSON.stringify(advertiserData));
                
                // Update the embed with new advertiser count
                const messageId = interaction.message.id;
                const channelId = interaction.channel_id;
                const currentEmbed = interaction.message.embeds[0];
                
                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            ...currentEmbed,
                            footer: {
                                text: `Advertisers: ${advertiserData.count}`
                            }
                        }],
                        components: interaction.message.components
                    })
                }).catch(err => console.error('Failed to update embed:', err));
                
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '✅ You now have access to advertising! You can now post in the advertising channels.',
                        flags: 64
                    }
                });
            } catch (error) {
                console.error('Advertising access button error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error granting advertising access.',
                        flags: 64
                    }
                });
            }
        }
        
        // Handle suggestion approve button
        if (customId.startsWith('suggestion_approve_')) {
            const userId = interaction.member?.user?.id || interaction.user?.id;
            const approverName = interaction.member?.user?.username || interaction.user?.username;
            
            // Check if user has the required role
            const allowedRoles = ['1315323804528017498', '1315041666851274822'];
            const hasRole = interaction.member?.roles?.some(role => allowedRoles.includes(role));
            
            if (!hasRole) {
                // Send public error message that will be deleted after 3s
                const errorResponse = await fetch(
                    `https://discord.com/api/v10/channels/${interaction.channel_id}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: `<@${userId}>, you cannot use these buttons! Please wait for a developer`,
                            message_reference: {
                                message_id: interaction.message.id
                            }
                        })
                    }
                );
                
                if (errorResponse.ok) {
                    const errorMsg = await errorResponse.json();
                    // Delete the message after 3 seconds
                    setTimeout(async () => {
                        await fetch(
                            `https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${errorMsg.id}`,
                            {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
                                }
                            }
                        ).catch(err => console.error('Failed to delete error message:', err));
                    }, 3000);
                }
                
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ You do not have permissions to use this button.',
                        flags: 64
                    }
                });
            }
            
            // Update the embed to approved state
            const currentEmbed = interaction.message.embeds[0];
            await fetch(`https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${interaction.message.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    embeds: [{
                        ...currentEmbed,
                        description: `${currentEmbed.description.split('Please wait')[0]}\n✅ **Suggestion has been approved!**\nApproved by: ${approverName}`
                    }],
                    components: []
                })
            }).catch(err => console.error('Failed to update embed:', err));
            
            return jsonResponse({
                type: 4,
                data: {
                    content: '✅ Suggestion approved!',
                    flags: 64
                }
            });
        }
        
        // Handle suggestion deny button
        if (customId.startsWith('suggestion_deny_')) {
            const userId = interaction.member?.user?.id || interaction.user?.id;
            const approverName = interaction.member?.user?.username || interaction.user?.username;
            
            // Check if user has the required role
            const allowedRoles = ['1315323804528017498', '1315041666851274822'];
            const hasRole = interaction.member?.roles?.some(role => allowedRoles.includes(role));
            
            if (!hasRole) {
                // Send public error message that will be deleted after 3s
                const errorResponse = await fetch(
                    `https://discord.com/api/v10/channels/${interaction.channel_id}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: `<@${userId}>, you cannot use these buttons! Please wait for a developer`,
                            message_reference: {
                                message_id: interaction.message.id
                            }
                        })
                    }
                );
                
                if (errorResponse.ok) {
                    const errorMsg = await errorResponse.json();
                    // Delete the message after 3 seconds
                    setTimeout(async () => {
                        await fetch(
                            `https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${errorMsg.id}`,
                            {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`
                                }
                            }
                        ).catch(err => console.error('Failed to delete error message:', err));
                    }, 3000);
                }
                
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ You do not have permissions to use this button.',
                        flags: 64
                    }
                });
            }
            
            // Show denial reason modal
            return jsonResponse({
                type: 9,
                data: {
                    custom_id: `suggestion_deny_modal_${interaction.message.id}`,
                    title: 'Deny Suggestion',
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4,
                                    custom_id: 'denial_reason',
                                    label: 'Denial Reason',
                                    style: 2,
                                    placeholder: 'Enter the reason for denial...',
                                    required: true,
                                    min_length: 10,
                                    max_length: 1000
                                }
                            ]
                        }
                    ]
                }
            });
        }
        
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
                const webhookUrl10 = getWebhooks(env).ACCOUNT;
                try {
                    await fetch(getWebhooks(env).LOGS, {
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
        
        // Handle suggestion denial submission
        if (customId.startsWith('suggestion_deny_modal_')) {
            const denialReason = interaction.data.components[0].components[0].value;
            const denierName = interaction.member?.user?.username || interaction.user?.username;
            
            // Extract message ID from custom_id
            const messageId = customId.split('suggestion_deny_modal_')[1];
            
            try {
                // Update the embed to denied state
                const currentEmbed = interaction.message.embeds[0];
                const channelId = interaction.channel_id;
                const botToken = env.DISCORD_BOT_TOKEN;
                
                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        embeds: [{
                            ...currentEmbed,
                            description: `${currentEmbed.description.split('Please wait')[0]}\n❌ **Suggestion has been Denied!**\nDenied by: ${denierName}\nReason: ${denialReason}`
                        }],
                        components: []
                    })
                }).catch(err => console.error('Failed to update denial embed:', err));
                
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '✅ Suggestion denied!',
                        flags: 64
                    }
                });
            } catch (error) {
                console.error('Denial submission error:', error);
                return jsonResponse({
                    type: 4,
                    data: {
                        content: '❌ Error processing denial.',
                        flags: 64
                    }
                });
            }
        }
        
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
                const webhookUrl11 = getWebhooks(env).ACCOUNT;
                try {
                    await fetch(getWebhooks(env).LOGS, {
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
        const pointsWebhook = getWebhooks(env).POINTS;
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
        const pointsWebhook = getWebhooks(env).POINTS;
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
        const webhookUrl12 = getWebhooks(env).REDEMPTION;
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
            
            await fetch(getWebhooks(env).REDEMPTION, {
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
        const webhookUrl13 = getWebhooks(env).ACCOUNT;
        try {
            await fetch(getWebhooks(env).LOGS, {
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

async function handleEmbedCommand(interaction, env) {
    const embedType = interaction.data.options.find(opt => opt.name === 'type')?.value;
    
    try {
        if (embedType === 'guidelines') {
            return await sendGuidelinesEmbeds(interaction, env);
        } else if (embedType === 'tos') {
            return await sendTOSEmbed(interaction, env);
        } else if (embedType === 'advertising') {
            return await sendAdvertisingEmbed(interaction, env);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Unknown embed type.',
                flags: 64
            }
        });
    } catch (error) {
        console.error('Embed command error:', error);
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error sending embed. Please try again.',
                flags: 64
            }
        });
    }
}

async function sendGuidelinesEmbeds(interaction, env) {
    const channelId = '1315044257664336024';
    const botToken = env.DISCORD_BOT_TOKEN;
    
    try {
        // Send the three embeds together
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embeds: [
                    {
                        title: '<:fulllogo:1315278697443495968> © Cirkle Development 2024',
                        description: `Founded in December 2024, Cirkle Development is on a mission to redefine the global tech landscape. Our goal is not just to provide innovative solutions but to empower businesses with stronger, more dynamic identities that help them thrive in a competitive world.

At Cirkle Development, we are committed to delivering top-tier products that seamlessly combine quality and simplicity. Our offerings are designed to stand out for all the right reasons—offered at competitive, affordable prices while exceeding expectations in performance and design.
●○●○●○●○●●○●○●○●○●●○●○●○●○●`,
                        color: 0x10b981,
                        thumbnail: {
                            url: 'https://media.discordapp.net/attachments/1315278404009988107/1473323652735828029/Eco_Clean.jpg?ex=6995cb13&is=69947993&hm=2895dc7b4f092c92e8d4771b9a276dfa51cab70fc07c61b37068b245c96d4171&=&format=webp'
                        }
                    },
                    {
                        title: '📜 Server Rules',
                        description: `To keep this server safe and appropriate, we ask that you follow the rules listed below. Cirkle not only ensures it's best quality of products but also ensures a safe server evironment.

1. Be respectful of others.
2. Keep content appropriate.
3. No spamming.
4. Avoid Drama.
5. Respect privacy.
6. No Malicious Links
7. No Illegal Activity
8. **Please be sure to follow Discords and Roblox's ToS and Guidelines!**`,
                        color: 0x10b981
                    },
                    {
                        title: '<:cirkledev:1315278604736794745> Our Socials and Links',
                        description: `●○●○●○●○●●○●○●○●○●●○●○●○●○●

<:cirkledev:1315278604736794745> Our Socials and Links
- <:tiktok:1315671765753659433><:youtube:1315671254438514739><:xlogo:1315672400456716422><:instagram:1452042193299706019> @cirkledev
<:cirkledev:1315278604736794745> shop.cirkledevelopment.co.uk
<:clearlydev:1315671921987289119> [Our ClearlyDev Store](https://clearlydev.com/store/cirkle-development)
<:roblox:1315671124901888061> [Join our Roblox Group!](https://www.roblox.com/communities/8321615/Cirkle-Development#!/about)`,
                        color: 0x10b981,
                        image: {
                            url: 'https://media.discordapp.net/attachments/1315278404009988107/1433584166447874221/cirkledevtest.png?ex=6995950b&is=6994438b&hm=047bf700e3b41554ac1ab9fc89cfa7467115ce8c7a7ab786e494405bfdf38561&=&format=webp&quality=lossless'
                        }
                    }
                ],
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 3,
                                custom_id: 'guidelines_dropdown',
                                placeholder: 'Select an option...',
                                options: [
                                    {
                                        label: 'Our ad',
                                        value: 'guidelines_ad',
                                        description: 'View Cirkle advertisements'
                                    },
                                    {
                                        label: 'Meet the team',
                                        value: 'guidelines_team',
                                        description: 'Meet the Cirkle team'
                                    }
                                ]
                            }
                        ]
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to send embeds: ${error}`);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                content: '✅ Guidelines embeds sent successfully!',
                flags: 64
            }
        });
    } catch (error) {
        console.error('Guidelines embeds error:', error);
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error sending guidelines embeds.',
                flags: 64
            }
        });
    }
}

async function sendTOSEmbed(interaction, env) {
    const channelId = '1315321398008217652';
    const botToken = env.DISCORD_BOT_TOKEN;
    
    try {
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embeds: [{
                    title: '<:fulllogo:1315278697443495968> Cirkle TOS',
                    description: `When purchasing a Cirkle product, you agree to the TOS Listed below.

• **No Refunds** - Refunds on purchased products are not permitted at Cirkle.
• **Do not leak**- We prohibit the use of our products without a license. All of our products are installed with a security system to ensure users have a license to use. If found without one, you will receive a blacklist from Cirkle.
• **These products can only be used on games or groups YOU OWN.**
• **Keep Cirkle Branding** - Any attempts to change or remove Cirkle Branding without permission from a higher rank (Assistant Director+) will result in consequences.
• **Reselling is prohibited** - Cirkle prohibits the act to resell our products. If found reselling without permission from a higher rank (Assistant Director+), you will receive consequences.

👉 **Failure to comply with the TOS listed will result in ownership removal and blacklist from the company and other companies under the Cirkle Development Group**.`,
                    color: 0x10b981,
                    image: {
                        url: 'https://media.discordapp.net/attachments/1315278404009988107/1315686108281045062/image.png?ex=6995236c&is=6993d1ec&hm=fd29a5fc8d46b3936689f25769019244ac8eec2a0c99ef15c8522980d854c339&=&format=webp'
                    }
                }]
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to send TOS embed: ${error}`);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                content: '✅ TOS embed sent successfully!',
                flags: 64
            }
        });
    } catch (error) {
        console.error('TOS embed error:', error);
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error sending TOS embed.',
                flags: 64
            }
        });
    }
}

async function sendAdvertisingEmbed(interaction, env) {
    const channelId = '1323358326309916702';
    const botToken = env.DISCORD_BOT_TOKEN;
    
    try {
        // Get current advertiser count
        let advertiserCount = 0;
        try {
            const countData = await env.USERS_KV.get('advertising_advertiser_count', { type: 'json' });
            if (countData && countData.count) {
                advertiserCount = countData.count;
            }
        } catch (err) {
            console.log('No advertiser count found, starting at 0');
        }
        
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embeds: [{
                    title: '<:cirkledev:1315278604736794745> Cirkle Advertisement/Campaign Regulations',
                    description: `To maintain a positive and relevant community experience at Cirkle,, please adhere to the following regulations when advertising or sharing campaigns:

> ### - Roblox Servers Only
> - Please refrain from advertising servers that are not related to Roblox. As this server is dedicated to the Roblox community, we aim to keep the focus on Roblox-related discussions and interactions.

> ### - No NSFW Content
> - NSFW content (including but not limited to sexually suggestive, explicit, or violent material) is strictly prohibited within this server.

> ### - 3-Hour Cooldown on Advertising
> - To prevent excessive spam and ensure a balanced experience for all members, there is a 3-hour cooldown period between advertisements in each designated advertising channel.

Cirkle has the right to delete or take down any advertisements/campaigns if we suspect any of these rules are broken. Cirkle also has the right to issue appropriate sanctions to users using the advertising category, These could include removing your advertisements or campaigns, giving you a warning, or temporarily or permanently banning you from certain channels or features.`,
                    color: 0x7c3aed,
                    footer: {
                        text: `Advertisers: ${advertiserCount}`
                    }
                }],
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 3,
                                label: '✅ Click here to gain access to advertising',
                                custom_id: 'advertising_access_button'
                            }
                        ]
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to send advertising embed: ${error}`);
        }
        
        return jsonResponse({
            type: 4,
            data: {
                content: '✅ Advertising embed sent successfully!',
                flags: 64
            }
        });
    } catch (error) {
        console.error('Advertising embed error:', error);
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error sending advertising embed.',
                flags: 64
            }
        });
    }
}

async function handleProductEmbedCommand(interaction, env) {
    // Get the channel ID where the command was used
    const channelId = interaction.channel_id;
    
    try {
        // Send the embed to the channel (not as a reply)
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embeds: [{
                    title: '<:fulllogo:1315278697443495968> Thanks for choosing Cirkle!',
                    description: `Thank you for your interest in purchasing a product at Cirkle! This product can be found on:\n- <:cirkledev:1315278604736794745> [Our Website](https://shop.cirkledevelopment.co.uk)\n- 📦 [Our Product Hub](https://www.roblox.com/games/132122804601498/CD-Product-Hub)\n- <:clearlydev:1315671921987289119> [Our ClearlyDev](https://clearlydev.com/public-marketplace/real-technologies-corp)\n\nIf you have the time afterwards, it is highly appreciated if you left us a [review](https://discord.com/channels/1310656642672627752/1315679706745409566). If you require support, open a ticket in <#1315045336040869888> and click \`Product Support\`.\nThanks for choosing Cirkle once again!`,
                    color: 0x5865F2,
                    image: {
                        url: 'https://media.discordapp.net/attachments/1315278404009988107/1319652298930257951/Utilities_960_x_540_px_680_x_240_px.png?ex=6936cd7a&is=69357bfa&hm=90ea3386fd57629ab2e9506a05e232ba58149f505715fd4839ff458abb3d8d8c&=&format=webp&quality=lossless&width=748&height=264'
                    }
                }]
            })
        });
        
        // Send a confirmation message (ephemeral)
        return jsonResponse({
            type: 4,
            data: {
                content: '✅ Product embed sent successfully!',
                flags: 64 // Ephemeral
            }
        });
    } catch (error) {
        console.error('Product embed error:', error);
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error sending product embed. Please try again.',
                flags: 64
            }
        });
    }
}

async function handleRemoveProductCommand(interaction, env) {
    const options = interaction.data.options;
    const targetUser = options.find(opt => opt.name === 'user')?.value;
    const productIdentifier = options.find(opt => opt.name === 'product')?.value;
    const reason = options.find(opt => opt.name === 'reason')?.value || 'No reason provided';
    const adminUser = interaction.member?.user || interaction.user;
    
    try {
        // Get user data
        let userData = await getUserData(targetUser, env);
        
        if (!userData || !userData.products || userData.products.length === 0) {
            return jsonResponse({
                type: 4,
                data: {
                    content: '❌ User has no products to remove.',
                    flags: 64
                }
            });
        }
        
        // Find and remove the product
        const originalLength = userData.products.length;
        const removedProducts = userData.products.filter(p => 
            p.id === productIdentifier || p.name.toLowerCase().includes(productIdentifier.toLowerCase())
        );
        
        userData.products = userData.products.filter(p => 
            p.id !== productIdentifier && !p.name.toLowerCase().includes(productIdentifier.toLowerCase())
        );
        
        if (userData.products.length === originalLength) {
            return jsonResponse({
                type: 4,
                data: {
                    content: `❌ Product "${productIdentifier}" not found for user <@${targetUser}>.`,
                    flags: 64
                }
            });
        }
        
        // Save updated user data
        await env.USERS_KV.put(`user:${targetUser}`, JSON.stringify(userData));
        
        console.log(`Product removed for user ${targetUser}:`, {
            productId: productIdentifier,
            removedProduct: removedProducts[0],
            remainingProducts: userData.products.length
        });
        
        const removedProductName = removedProducts[0]?.name || productIdentifier;
        
        // Send DM to user
        try {
            const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ recipient_id: targetUser })
            });
            
            const dmChannel = await dmChannelResponse.json();
            
            await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    embeds: [{
                        title: '⚠️ Product Access Removed',
                        description: `Your access to **${removedProductName}** has been removed from your dashboard.`,
                        color: 0xf59e0b,
                        fields: [
                            { name: '📦 Product', value: removedProductName, inline: false },
                            { name: '📝 Reason', value: reason, inline: false },
                            { name: '🔄 Action Required', value: 'Please refresh your dashboard to see the update.', inline: false }
                        ],
                        footer: { text: 'MyCirkle Product Access' },
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        } catch (dmError) {
            console.error('Failed to send removal DM:', dmError);
        }
        
        // Log to webhook
        try {
            await fetch(getWebhooks(env).LOGS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '🗑️ Product Removed',
                        description: `Product access has been revoked`,
                        color: 0xf59e0b,
                        fields: [
                            { name: '👤 User', value: `<@${targetUser}>`, inline: true },
                            { name: '📦 Product', value: removedProductName, inline: true },
                            { name: '👨‍💼 Admin', value: `<@${adminUser.id}>`, inline: true },
                            { name: '📝 Reason', value: reason, inline: false }
                        ],
                        footer: { text: '🛡️ Product Management' },
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
                content: `✅ Removed **${removedProductName}** from <@${targetUser}>'s dashboard.\n📝 Reason: ${reason}`,
                flags: 64
            }
        });
    } catch (error) {
        console.error('Remove product error:', error);
        return jsonResponse({
            type: 4,
            data: {
                content: '❌ Error removing product. Please try again.',
                flags: 64
            }
        });
    }
}



// ===== EMAIL FUNCTIONS =====

// Send progress DM to admin
async function sendProgressDM(env, messageId, totalEmails, sentCount, isComplete = false) {
    const ADMIN_USER_ID = '1088907566844739624';
    
    try {
        if (!env.DISCORD_BOT_TOKEN) return;
        
        // Get or create DM channel
        const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipient_id: ADMIN_USER_ID })
        });
        
        if (!dmChannelResponse.ok) return;
        const dmChannel = await dmChannelResponse.json();
        
        const percentage = Math.round((sentCount / totalEmails) * 100);
        const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
        
        const embed = {
            title: isComplete ? '✅ Email Campaign Complete!' : '📧 Processing Email Campaign',
            description: isComplete 
                ? `Successfully sent **${sentCount}** out of **${totalEmails}** emails!`
                : `Sending emails... Please wait.`,
            color: isComplete ? 0x10b981 : 0x3b82f6,
            fields: [
                {
                    name: '📊 Progress',
                    value: `${progressBar} ${percentage}%\n**${sentCount}** / **${totalEmails}** emails sent`,
                    inline: false
                }
            ],
            footer: { text: isComplete ? 'Campaign finished' : 'Updating every 10 emails...' },
            timestamp: new Date().toISOString()
        };
        
        if (messageId) {
            // Edit existing message
            await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages/${messageId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ embeds: [embed] })
            });
        } else {
            // Create new message
            const response = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ embeds: [embed] })
            });
            
            if (response.ok) {
                const msg = await response.json();
                return msg.id;
            }
        }
    } catch (error) {
        console.error('Error sending progress DM:', error);
    }
    return messageId;
}

// Send bulk emails via Resend with rate limiting
async function sendBulkEmails(env, users, subject, message) {
    const sent = [];
    const totalEmails = users.length;
    let progressMessageId = null;
    
    // Send initial progress DM
    progressMessageId = await sendProgressDM(env, null, totalEmails, 0);
    
    // Use verified Resend domain
    const fromEmail = 'MyCirkle <mycirkle@notifications.cirkledevelopment.co.uk>';
    const headerImageUrl = 'https://www.dropbox.com/scl/fi/7chi01vofepeowexh8gk3/cirkledevtest.png?rlkey=qbrgav91n9vw63o7tv2ktphsw&st=e9zza41p&dl=1';
    const logoImageUrl = 'https://raw.githubusercontent.com/marcusraycirkle/mycirkle-website/main/assets/mycirkle-logo.png';
    
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        try {
            const personalizedMessage = message
                .replace(/{{firstName}}/g, user.fullName?.split(' ')[0] || user.firstName || 'Friend')
                .replace(/{{points}}/g, user.points !== undefined ? user.points : 0);
            
            const personalizedSubject = subject
                .replace(/{{firstName}}/g, user.fullName?.split(' ')[0] || user.firstName || 'Friend')
                .replace(/{{points}}/g, user.points !== undefined ? user.points : 0);
            
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
                    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;"><div style="text-align: center; padding: 0; margin: 0;"><img src="${headerImageUrl}" alt="MyCirkle Header" width="600" height="auto" style="width: 100%; max-width: 600px; height: auto; display: block; margin: 0; padding: 0; border: 0; outline: none;" /></div><div style="text-align: center; padding: 20px 0;"><img src="${logoImageUrl}" alt="MyCirkle Logo" width="80" height="80" style="width: 80px; height: 80px; display: block; margin: 0 auto; border: 0; outline: none;" /></div><div style="padding: 30px; background: #f9fafb;"><div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="color: #374151; line-height: 1.6;">${personalizedMessage.replace(/\n/g, '<br>')}</div></div></div><div style="background: #1f2937; padding: 20px; text-align: center;"><p style="color: #9ca3af; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} Cirkle Development. All rights reserved.</p><p style="color: #6b7280; margin: 5px 0 0 0; font-size: 11px;">To unsubscribe from future marketing emails, please open a support ticket in the MyCirkle Category.</p></div></div>`
                })
            });
            
            if (response.ok) {
                sent.push(user.email);
                
                // Update progress DM every 10 emails or on last email
                if ((i + 1) % 10 === 0 || i === users.length - 1) {
                    progressMessageId = await sendProgressDM(env, progressMessageId, totalEmails, sent.length, i === users.length - 1);
                }
            }
            
            // Rate limit: 4 seconds between emails
            if (i < users.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 4000));
            }
        } catch (error) {
            console.error(`Failed to send to ${user.email}:`, error);
        }
    }
    
    // Send final completion DM
    await sendProgressDM(env, progressMessageId, totalEmails, sent.length, true);
    
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

