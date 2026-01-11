/**
 * Authentication API for Dwayne's Fitness Blog Admin
 * Uses Magic Link authentication with JWT tokens
 */

const crypto = require('crypto');

// Environment variables (set in Netlify dashboard)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
// Support multiple admin emails (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SITE_URL = process.env.URL || 'http://localhost:8888';

// Simple JWT implementation (no external dependencies)
function createJWT(payload, expiresIn = '7d') {
    const header = { alg: 'HS256', typ: 'JWT' };

    // Calculate expiration
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

        // Verify signature
        const expectedSig = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');

        if (signature !== expectedSig) {
            return { valid: false, error: 'Invalid signature' };
        }

        // Decode payload
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

        // Check expiration
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return { valid: false, error: 'Token expired' };
        }

        return { valid: true, payload };
    } catch (error) {
        return { valid: false, error: 'Invalid token format' };
    }
}

// Generate a magic link token
function generateMagicToken() {
    return crypto.randomBytes(32).toString('hex');
}

// In-memory store for magic tokens (in production, use a database or KV store)
// For simplicity, we'll use a signed token approach instead
function createMagicLinkToken(email) {
    const payload = { email, purpose: 'magic-link' };
    return createJWT(payload, '1h'); // Magic links expire in 1 hour
}

// Send magic link email via Resend
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
          <p style="color: #666; font-size: 14px; margin-top: 32px;">
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

exports.handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const path = event.path.replace('/.netlify/functions/auth', '').replace('/api/auth', '');

    try {
        // POST /auth/request - Request a magic link
        if (event.httpMethod === 'POST' && path === '/request') {
            const { email } = JSON.parse(event.body || '{}');

            if (!email) {
                return {
                    statusCode: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Email is required' }),
                };
            }

            // Check if email is authorized (only admin emails can log in)
            if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email.toLowerCase())) {
                // Don't reveal if email is valid or not for security
                return {
                    statusCode: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'If this email is registered, you will receive a login link.' }),
                };
            }

            // Generate magic link
            const magicToken = createMagicLinkToken(email);
            const magicLink = `${SITE_URL}/admin/?token=${magicToken}`;

            // Send email
            await sendMagicLinkEmail(email, magicLink);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'If this email is registered, you will receive a login link.',
                    // TEMPORARY: Show magic link for testing (remove after testing!)
                    devLink: magicLink,
                }),
            };
        }

        // POST /auth/verify - Verify magic link token and return session token
        if (event.httpMethod === 'POST' && path === '/verify') {
            const { token } = JSON.parse(event.body || '{}');

            if (!token) {
                return {
                    statusCode: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Token is required' }),
                };
            }

            const result = verifyJWT(token);

            if (!result.valid || result.payload.purpose !== 'magic-link') {
                return {
                    statusCode: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Invalid or expired link' }),
                };
            }

            // Create session token (valid for 7 days)
            const sessionToken = createJWT({
                email: result.payload.email,
                role: 'admin',
            }, '7d');

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: sessionToken,
                    email: result.payload.email,
                    expiresIn: '7d',
                }),
            };
        }

        // GET /auth/me - Get current user info
        if (event.httpMethod === 'GET' && path === '/me') {
            const authHeader = event.headers.authorization || '';
            const token = authHeader.replace('Bearer ', '');

            if (!token) {
                return {
                    statusCode: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Not authenticated' }),
                };
            }

            const result = verifyJWT(token);

            if (!result.valid) {
                return {
                    statusCode: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: result.error }),
                };
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: result.payload.email,
                    role: result.payload.role,
                }),
            };
        }

        return {
            statusCode: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Not found' }),
        };

    } catch (error) {
        console.error('Auth error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

// Export for use in other functions
module.exports.verifyJWT = verifyJWT;
