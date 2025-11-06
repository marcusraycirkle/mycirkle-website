// cloudflare/worker.js - MyCirkle Loyalty Program Backend
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        if (path === '/auth/discord') {
            const clientId = env.DISCORD_CLIENT_ID;
            if (!clientId) {
                return new Response(JSON.stringify({ error: 'DISCORD_CLIENT_ID not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            const frontendRedirect = url.searchParams.get('redirect_uri') || 'http://localhost:8080';
            const workerCallbackUrl = `${url.protocol}//${url.host}/auth/callback`;
            
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: workerCallbackUrl,
                response_type: 'code',
                scope: 'identify guilds',
                state: frontendRedirect // Pass frontend URL in state
            });
            return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
        } else if (path === '/auth/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state'); // Original redirect URI
            
            if (!code) {
                return new Response('Missing code', { status: 400, headers: corsHeaders });
            }

            const clientId = env.DISCORD_CLIENT_ID;
            const clientSecret = env.DISCORD_CLIENT_SECRET;
            if (!clientId || !clientSecret) {
                return new Response(JSON.stringify({ error: 'Discord credentials not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            
            // The redirect_uri must match what we sent to Discord (worker callback URL)
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
                    return new Response(JSON.stringify(tokenData), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                const userResponse = await fetch('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` }
                });
                const user = await userResponse.json();

                // Redirect back to frontend with user data in URL fragment
                const frontendUrl = state || 'http://localhost:8080';
                const userDataEncoded = encodeURIComponent(JSON.stringify(user));
                return Response.redirect(`${frontendUrl}#discord-callback?user=${userDataEncoded}`, 302);
            } catch (error) {
                return new Response(JSON.stringify({ error: 'OAuth error', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        } else if (path === '/auth/check-membership') {
            const userId = url.searchParams.get('user_id');
            if (!userId) {
                return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            
            const guildId = env.DISCORD_GUILD_ID;
            const botToken = env.DISCORD_BOT_TOKEN;
            if (!guildId || !botToken) {
                return new Response(JSON.stringify({ error: 'Discord bot credentials not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            try {
                const memberResponse = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
                    headers: { Authorization: `Bot ${botToken}` }
                });
                
                if (memberResponse.status === 404) {
                    return new Response(JSON.stringify({ isMember: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                
                const member = await memberResponse.json();
                return new Response(JSON.stringify({ isMember: !!member.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'Membership check failed', isMember: false }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        } else if (path === '/api/signup' && request.method === 'POST') {
            try {
                const data = await request.json();
                const { discordId, discordUsername, firstName, lastName, email, memberSince } = data;

                if (!discordId || !firstName || !lastName) {
                    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                await saveToGoogleSheets(env, {
                    discordId,
                    discordUsername,
                    firstName,
                    lastName,
                    email,
                    memberSince: memberSince || new Date().toISOString(),
                    signupDate: new Date().toISOString()
                });

                return new Response(JSON.stringify({ success: true, message: 'User registered' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'Signup failed', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        } else if (path === '/api/user-data' && request.method === 'POST') {
            try {
                const { discordId } = await request.json();
                
                if (!discordId) {
                    return new Response(JSON.stringify({ error: 'Missing discordId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                const userData = await getUserFromSheets(env, discordId);
                
                return new Response(JSON.stringify(userData || { found: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'Failed to fetch user', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        } else if (path === '/api/update-points' && request.method === 'POST') {
            try {
                const { discordId, points } = await request.json();
                
                if (!discordId || points === undefined) {
                    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                await updateUserPoints(env, discordId, points);
                
                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'Failed to update points', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        } else if (path === '/api/products' && request.method === 'POST') {
            try {
                const body = await request.json();
                const { discordId, productId } = body || {};

                if (!discordId) {
                    return new Response(JSON.stringify({ error: 'Missing discordId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                const products = await getUserProducts(env, discordId, productId);

                return new Response(JSON.stringify({ success: true, products }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'Failed to fetch products', details: error.message, products: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
};

async function saveToGoogleSheets(env, userData) {
    const GOOGLE_SHEETS_API_KEY = env.GOOGLE_SHEETS_API_KEY;
    const SPREADSHEET_ID = env.SPREADSHEET_ID;
    if (!GOOGLE_SHEETS_API_KEY || !SPREADSHEET_ID) {
        throw new Error('Google Sheets credentials not configured');
    }
    
    const range = 'Users!A3:H';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&key=${GOOGLE_SHEETS_API_KEY}`;
    
    const values = [[
        userData.discordId,
        userData.discordUsername,
        userData.firstName,
        userData.lastName,
        userData.email,
        userData.memberSince,
        userData.signupDate,
        '0'
    ]];

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error('Failed to save: ' + error);
    }

    return await response.json();
}

async function getUserFromSheets(env, discordId) {
    const GOOGLE_SHEETS_API_KEY = env.GOOGLE_SHEETS_API_KEY;
    const SPREADSHEET_ID = env.SPREADSHEET_ID;
    if (!GOOGLE_SHEETS_API_KEY || !SPREADSHEET_ID) {
        throw new Error('Google Sheets credentials not configured');
    }
    
    const range = 'Users!A3:H';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${GOOGLE_SHEETS_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error('Failed to fetch: ' + error);
    }

    const data = await response.json();
    const rows = data.values || [];
    
    for (let i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i][0] === discordId) {
            return {
                found: true,
                discordId: rows[i][0],
                discordUsername: rows[i][1] || '',
                firstName: rows[i][2] || '',
                lastName: rows[i][3] || '',
                email: rows[i][4] || '',
                memberSince: rows[i][5] || '',
                signupDate: rows[i][6] || '',
                points: parseInt(rows[i][7] || '0'),
                rowIndex: i + 3
            };
        }
    }
    
    return { found: false };
}

async function updateUserPoints(env, discordId, points) {
    const GOOGLE_SHEETS_API_KEY = env.GOOGLE_SHEETS_API_KEY;
    const SPREADSHEET_ID = env.SPREADSHEET_ID;
    if (!GOOGLE_SHEETS_API_KEY || !SPREADSHEET_ID) {
        throw new Error('Google Sheets credentials not configured');
    }
    
    const userData = await getUserFromSheets(env, discordId);
    
    if (!userData.found) {
        throw new Error('User not found');
    }

    const updateRange = `Users!H${userData.rowIndex}`;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${updateRange}?valueInputOption=RAW&key=${GOOGLE_SHEETS_API_KEY}`;
    
    const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[points.toString()]] })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error('Failed to update points: ' + error);
    }

    return await response.json();
}

async function getUserProducts(env, discordId, productId) {
    // Accept either PARCELROBLOX_API_KEY or PARCEL_API_KEY (legacy)
    const PARCEL_API_KEY = env.PARCELROBLOX_API_KEY || env.PARCEL_API_KEY;
    if (!PARCEL_API_KEY) {
        throw new Error('Parcel API key not configured');
    }

    // Get user data to find their email or identifier
    const userData = await getUserFromSheets(env, discordId);

    if (!userData.found) {
        return [];
    }

    const identifier = userData.email || userData.discordId || '';
    const identifierType = userData.email ? 'email' : 'discordId';

    try {
        // If caller requested a single productId, check ownership for that product.
        if (productId) {
            // We POST to a Parcel ownership-check endpoint. If your Parcel API differs, update this path.
            const checkUrl = 'https://api.parcelroblox.com/v1/ownerships/check';
            const response = await fetch(checkUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PARCEL_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    product_id: productId,
                    identifier: identifier,
                    identifier_type: identifierType
                })
            });

            if (!response.ok) {
                console.error('Parcel ownership check error:', await response.text());
                return [];
            }

            const data = await response.json();
            // Expecting response shape like { owned: true, product: { ... } }
            if (data && data.owned) {
                const p = data.product || { id: productId, name: 'Owned Product' };
                return [{
                    id: p.id || productId,
                    name: p.name || 'Owned Product',
                    price: p.price ? `$${(p.price / 100).toFixed(2)}` : 'N/A',
                    img: p.image || p.thumbnail || 'https://via.placeholder.com/200x150?text=Product',
                    desc: p.description || '',
                    payment: p.paymentMethod || 'N/A',
                    date: p.purchaseDate || new Date().toISOString().split('T')[0]
                }];
            }

            return [];
        }

        // Otherwise request all owned products for this identifier
        const listUrl = `https://api.parcelroblox.com/v1/products/owned?identifier=${encodeURIComponent(identifier)}&identifier_type=${encodeURIComponent(identifierType)}`;
        const listResp = await fetch(listUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PARCEL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!listResp.ok) {
            console.error('Parcel list error:', await listResp.text());
            return [];
        }

        const listData = await listResp.json();
        const products = (listData.products || []).map(product => ({
            id: product.id || product.productId,
            name: product.name || 'Unknown Product',
            price: product.price ? `$${(product.price / 100).toFixed(2)}` : 'N/A',
            img: product.image || product.thumbnail || 'https://via.placeholder.com/200x150?text=Product',
            desc: product.description || 'No description available',
            payment: product.paymentMethod || 'N/A',
            date: product.purchaseDate || product.createdAt || new Date().toISOString().split('T')[0]
        }));

        return products;
    } catch (error) {
        console.error('Error fetching Parcel products:', error);
        return [];
    }
}
