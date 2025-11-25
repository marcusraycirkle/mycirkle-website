// cloudflare/worker.js - MyCirkle Loyalty Program Backend
// 🛡️ PROTECTED BY SENTINEL SECURITY - Enhanced 2X Security Implementation

// ============================================================================
// SENTINEL SECURITY SYSTEM v2.0 - Advanced Protection Layer
// ============================================================================

class SentinelSecurity {
    constructor() {
        this.rateLimits = new Map();
        this.blockedIPs = new Set();
        this.requestLog = [];
    }

    // Rate limiting: Max 60 requests per minute per IP
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
        
        // Block if exceeded 60 requests/minute
        if (limit.count > 60) {
            this.blockedIPs.add(ip);
            return false;
        }
        
        return true;
    }

    // Validate request origin and headers
    validateRequest(request) {
        const origin = request.headers.get('origin');
        const referer = request.headers.get('referer');
        const userAgent = request.headers.get('user-agent');
        
        // Block requests without user agent (likely bots)
        if (!userAgent || userAgent.length < 10) {
            return { valid: false, reason: 'Invalid user agent' };
        }
        
        // Block known malicious patterns
        const maliciousPatterns = [
            'sqlmap', 'nikto', 'nmap', 'masscan', 'burp', 'scanner',
            'exploit', 'hack', 'injection', 'xss', 'bypass'
        ];
        
        const lowerUA = userAgent.toLowerCase();
        for (const pattern of maliciousPatterns) {
            if (lowerUA.includes(pattern)) {
                return { valid: false, reason: 'Malicious user agent detected' };
            }
        }
        
        return { valid: true };
    }

    // Sanitize webhook URLs (never expose in logs)
    sanitizeForLogging(data) {
        const sanitized = JSON.parse(JSON.stringify(data));
        
        // Remove sensitive data
        const sensitiveKeys = ['webhook', 'token', 'secret', 'password', 'api_key', 'authorization'];
        
        const sanitizeObject = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    for (const sensitive of sensitiveKeys) {
                        if (key.toLowerCase().includes(sensitive)) {
                            obj[key] = '***REDACTED_BY_SENTINEL***';
                        }
                    }
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObject(obj[key]);
                }
            }
        };
        
        sanitizeObject(sanitized);
        return sanitized;
    }

    // Enhanced security headers
    getSecurityHeaders() {
        return {
            // Prevent XSS attacks
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            
            // HTTPS enforcement
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            
            // Content Security Policy - STRICT
            'Content-Security-Policy': [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
                "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
                "img-src 'self' data: https: blob:",
                "connect-src 'self' https://*.workers.dev https://discord.com https://api.roblox.com",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'"
            ].join('; '),
            
            // Referrer policy
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            
            // Permissions policy
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
            
            // SENTINEL Security header (custom)
            'X-Protected-By': 'SENTINEL-Security-v2.0',
            'X-Security-Status': 'Enhanced-Protection-Active'
        };
    }
}

// Initialize SENTINEL Security
const SENTINEL = new SentinelSecurity();

// ============================================================================
// SECURE WEBHOOK CONFIGURATION - Environment Variables Only
// ============================================================================
// IMPORTANT: These are retrieved from env variables, NEVER hardcoded
// Set in Cloudflare Dashboard: Workers > mycirkle-auth > Settings > Variables

function getSecureWebhooks(env) {
    return {
        ACCOUNT_WEBHOOK: env.ACCOUNT_WEBHOOK || '',
        REDEMPTION_WEBHOOK: env.REDEMPTION_WEBHOOK || '',
        POINTS_WEBHOOK: env.POINTS_WEBHOOK || '',
        LOGS_WEBHOOK: env.LOGS_WEBHOOK || '',
        DELETION_WEBHOOK: env.DELETION_WEBHOOK || '',
        // Legacy webhooks for compatibility
        LEADERBOARD_WEBHOOK: env.LEADERBOARD_WEBHOOK || env.LOGS_WEBHOOK || '',
        ACTIVITY_WEBHOOK: env.ACTIVITY_WEBHOOK || env.POINTS_WEBHOOK || ''
    };
}

// ============================================================================
// MAIN WORKER EXPORT
// ============================================================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
        
        // ========== SENTINEL SECURITY LAYER ==========
        
        // 1. Check if IP is blocked
        if (SENTINEL.blockedIPs.has(clientIP)) {
            return new Response('Access Denied - Rate limit exceeded', {
                status: 429,
                headers: {
                    ...SENTINEL.getSecurityHeaders(),
                    'Retry-After': '3600'
                }
            });
        }
        
        // 2. Rate limiting check
        const rateLimitOK = await SENTINEL.checkRateLimit(clientIP);
        if (!rateLimitOK) {
            return new Response('Too Many Requests - Protected by SENTINEL Security', {
                status: 429,
                headers: {
                    ...SENTINEL.getSecurityHeaders(),
                    'Retry-After': '60'
                }
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
        
        // ========== END SENTINEL SECURITY LAYER ==========

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            ...SENTINEL.getSecurityHeaders() // Add security headers to CORS
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Discord Interactions (Slash Commands)
        if (path === '/interactions' && request.method === 'POST') {
            return handleDiscordInteraction(request, env, corsHeaders);
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
            
            const discordAuthUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
            return Response.redirect(discordAuthUrl, 302);
        }

        if (path === '/auth/callback') {
            return handleDiscordCallback(request, env, corsHeaders);
        }

        // Roblox OAuth routes
        if (path === '/auth/roblox') {
            return handleRobloxAuth(request, env, corsHeaders);
        }

        if (path === '/auth/roblox/callback') {
            return handleRobloxCallback(request, env, corsHeaders);
        }

        // API Endpoints - All secured by SENTINEL
        if (path.startsWith('/api/')) {
            return handleApiRequest(path, request, env, corsHeaders);
        }

        // Default response
        return jsonResponse({ 
            message: 'MyCirkle Loyalty Program API',
            status: 'online',
            security: 'Protected by SENTINEL Security v2.0',
            timestamp: new Date().toISOString()
        }, 200, corsHeaders);
    }
};
