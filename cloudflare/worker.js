// cloudflare/worker.js (Corrected Version)
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request, event.env));  // Pass env here!
});

async function handleRequest(request, env) {  // env is now received
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/auth/discord') {
        // Start OAuth flow
        const clientId = env.DISCORD_CLIENT_ID;
        if (!clientId) {
            return new Response('Missing DISCORD_CLIENT_ID environment variable', { status: 500 });
        }
        const redirectUri = url.searchParams.get('redirect_uri') || 'https://marcusraycirkle.github.io/mycirkle-website/';  // Update with your GitHub username
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'identify'
        });
        return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
    } else if (path === '/auth/callback') {
        // Handle OAuth callback
        const code = url.searchParams.get('code');
        if (!code) {
            return new Response('Missing code', { status: 400 });
        }

        const clientId = env.DISCORD_CLIENT_ID;
        const clientSecret = env.DISCORD_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return new Response('Missing Discord credentials in environment variables', { status: 500 });
        }
        const redirectUri = url.searchParams.get('redirect_uri') || 'https://marcusraycirkle.github.io/mycirkle-website/';

        try {
            // Exchange code for access token
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri
                })
            });

            const tokenData = await tokenResponse.json();
            if (tokenData.error) {
                return new Response(JSON.stringify(tokenData), { status: 400 });
            }

            // Fetch user data
            const userResponse = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const user = await userResponse.json();

            // Return user data to client
            return new Response(JSON.stringify(user), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('OAuth callback error:', error);
            return new Response('Internal server error during OAuth', { status: 500 });
        }
    } else if (path === '/auth/check-membership') {
        // Check guild membership
        const userId = url.searchParams.get('user_id');
        if (!userId) {
            return new Response('Missing user_id', { status: 400 });
        }
        const guildId = '1310656642672627752';
        const botToken = env.DISCORD_BOT_TOKEN;
        if (!botToken) {
            return new Response('Missing DISCORD_BOT_TOKEN environment variable', { status: 500 });
        }

        try {
            const memberResponse = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
                headers: { Authorization: `Bot ${botToken}` }
            });
            const member = await memberResponse.json();
            return new Response(JSON.stringify({ isMember: !!member.user }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Membership check error:', error);
            return new Response('Error checking membership', { status: 500 });
        }
    }

    return new Response('Not Found', { status: 404 });
}