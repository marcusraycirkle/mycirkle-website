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
        DELETION: env.DELETION_WEBHOOK || ''
    };
}

