const crypto = require('crypto');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SITE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.URL || 'http://localhost:3000';

// Simple JWT implementation
function createJWT(payload, expiresIn = '7d') {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const expMap = { '7d': 604800, '1h': 3600, '24h': 86400 };
    const exp = now + (expMap[expiresIn] || 604800);
    const fullPayload = { ...payload, iat: now, exp };

    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const headerB64 = encode(header);
    const payloadB64 = encode(fullPayload);

    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyJWT(token) {
    try {
        const [headerB64, payloadB64, signature] = token.split('.');
        const expectedSig = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');

        if (signature !== expectedSig) {
            return { valid: false, error: 'Invalid signature' };
        }

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return { valid: false, error: 'Token expired' };
        }

        return { valid: true, payload };
    } catch (error) {
        return { valid: false, error: 'Invalid token format' };
    }
}

function createMagicLinkToken(email) {
    const payload = { email, purpose: 'magic-link' };
    return createJWT(payload, '1h');
}

async function sendMagicLinkEmail(email, magicLink) {
    if (!RESEND_API_KEY) {
        console.log('DEV MODE: Magic link would be sent to', email);
        console.log('Magic Link:', magicLink);
        return { success: true, dev: true };
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'Dwayne Fitness <noreply@resend.dev>',
            to: email,
            subject: '🔐 Your Admin Login Link',
            html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #FF6B35; margin-bottom: 24px;">Dwayne Fitness Admin</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.6;">
            Click the button below to log in to your admin panel. This link expires in 1 hour.
          </p>
          <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #FF6B35, #FF8F65); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 24px 0;">
            Log In to Admin →
          </a>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            <strong>On mobile?</strong> Copy this link instead:
          </p>
          <p style="color: #FF6B35; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 12px; border-radius: 6px;">
            ${magicLink}
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            If you didn't request this link, you can safely ignore this email.
          </p>
        </div>
      `,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send email: ${error}`);
    }

    return { success: true };
}

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        return res.status(204).end();
    }

    // Set CORS headers for all responses
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    const { path } = req.query;
    console.log('Auth Request:', { method: req.method, query: req.query, path });
    const action = Array.isArray(path) ? path[0] : path;

    try {
        // POST /api/auth/request - Request a magic link
        if (req.method === 'POST' && action === 'request') {
            const { email } = req.body || {};

            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            // Check if email is authorized
            if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email.toLowerCase())) {
                return res.status(200).json({ message: 'If this email is registered, you will receive a login link.' });
            }

            // Generate magic link
            const magicToken = createMagicLinkToken(email);
            const magicLink = `${SITE_URL}/admin/?token=${magicToken}`;

            // Send email
            await sendMagicLinkEmail(email, magicLink);

            return res.status(200).json({
                message: 'If this email is registered, you will receive a login link.',
            });
        }

        // POST /api/auth/verify - Verify magic link token
        if (req.method === 'POST' && action === 'verify') {
            const { token } = req.body || {};

            if (!token) {
                return res.status(400).json({ error: 'Token is required' });
            }

            const result = verifyJWT(token);

            if (!result.valid || result.payload.purpose !== 'magic-link') {
                return res.status(401).json({ error: 'Invalid or expired link' });
            }

            const sessionToken = createJWT({
                email: result.payload.email,
                role: 'admin',
            }, '7d');

            return res.status(200).json({
                token: sessionToken,
                email: result.payload.email,
                expiresIn: '7d',
            });
        }

        // GET /api/auth/me - Get current user info
        if (req.method === 'GET' && action === 'me') {
            const authHeader = req.headers.authorization || '';
            const token = authHeader.replace('Bearer ', '');

            if (!token) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const result = verifyJWT(token);

            if (!result.valid) {
                return res.status(401).json({ error: result.error });
            }

            return res.status(200).json({
                email: result.payload.email,
                role: result.payload.role,
            });
        }

        return res.status(404).json({ error: 'Not found' });

    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Export verifyJWT for use in content API
module.exports.verifyJWT = verifyJWT;
