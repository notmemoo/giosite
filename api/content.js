const crypto = require('crypto');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'owner/repo';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_API = 'https://api.github.com';

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Helper: Verify JWT (Inlined to avoid module resolution issues)
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

// Authenticate request
function authenticateRequest(req) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
        return { authenticated: false, error: 'No token provided' };
    }

    const result = verifyJWT(token);

    if (!result.valid) {
        return { authenticated: false, error: result.error };
    }

    return { authenticated: true, user: result.payload };
}

// GitHub API helpers
async function githubRequest(path, options = {}) {
    const url = `${GITHUB_API}/repos/${GITHUB_REPO}${path}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response.json();
}

async function getFileContent(filePath) {
    try {
        const data = await githubRequest(`/contents/${filePath}?ref=${GITHUB_BRANCH}`);
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { content, sha: data.sha };
    } catch (error) {
        if (error.message.includes('404')) {
            return null;
        }
        throw error;
    }
}

async function updateFileContent(filePath, content, message, sha = null) {
    const body = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: GITHUB_BRANCH,
    };

    if (sha) {
        body.sha = sha;
    }

    return githubRequest(`/contents/${filePath}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

async function listDirectory(dirPath) {
    try {
        return await githubRequest(`/contents/${dirPath}?ref=${GITHUB_BRANCH}`);
    } catch (error) {
        if (error.message.includes('404')) {
            return [];
        }
        throw error;
    }
}

// Simple YAML parser
function parseYAML(text) {
    const lines = text.split('\n');
    const result = {};
    let currentKey = null;
    let currentList = null;
    let currentListItem = null;
    let inMultilineString = false;
    let multilineKey = null;
    let multilineContent = '';
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            if (inMultilineString && trimmed === '') {
                multilineContent += '\n';
            }
            continue;
        }

        if (inMultilineString) {
            const currentIndent = line.search(/\S/);
            if (currentIndent > indentLevel) {
                multilineContent += (multilineContent ? '\n' : '') + trimmed;
                continue;
            } else {
                result[multilineKey] = multilineContent.trim();
                inMultilineString = false;
            }
        }

        if (trimmed.endsWith('|')) {
            multilineKey = trimmed.slice(0, -1).replace(':', '').trim();
            multilineContent = '';
            inMultilineString = true;
            indentLevel = line.search(/\S/);
            continue;
        }

        if (trimmed.startsWith('- ')) {
            const content = trimmed.slice(2);
            if (content.includes(':')) {
                const [key, ...valueParts] = content.split(':');
                const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                if (!currentList) currentList = [];
                if (!currentListItem) currentListItem = {};
                currentListItem[key.trim()] = value;
            } else {
                if (!currentList) currentList = [];
                if (currentListItem && Object.keys(currentListItem).length > 0) {
                    currentList.push(currentListItem);
                    currentListItem = {};
                }
                currentList.push({ text: content.replace(/^["']|["']$/g, '') });
            }
            continue;
        }

        const leadingSpaces = line.search(/\S/);
        if (leadingSpaces >= 4 && currentListItem) {
            if (trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':');
                const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                currentListItem[key.trim()] = value;
            }
            continue;
        }

        if (currentList && leadingSpaces === 0 && trimmed.includes(':')) {
            if (currentListItem && Object.keys(currentListItem).length > 0) {
                currentList.push(currentListItem);
                currentListItem = null;
            }
            if (currentKey) {
                result[currentKey] = currentList;
            }
            currentList = null;
        }

        if (trimmed.includes(':') && !trimmed.startsWith('-')) {
            const colonIndex = trimmed.indexOf(':');
            const key = trimmed.slice(0, colonIndex).trim();
            const value = trimmed.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');

            if (value === '' && !trimmed.endsWith('|')) {
                currentKey = key;
            } else {
                result[key] = value;
            }
        }
    }

    if (currentList) {
        if (currentListItem && Object.keys(currentListItem).length > 0) {
            currentList.push(currentListItem);
        }
        if (currentKey) {
            result[currentKey] = currentList;
        }
    }

    return result;
}

function toYAML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;

        if (Array.isArray(value)) {
            yaml += `${spaces}${key}:\n`;
            for (const item of value) {
                if (typeof item === 'object') {
                    const entries = Object.entries(item);
                    if (entries.length > 0) {
                        yaml += `${spaces}  - ${entries[0][0]}: "${entries[0][1]}"\n`;
                        for (let i = 1; i < entries.length; i++) {
                            yaml += `${spaces}    ${entries[i][0]}: "${entries[i][1]}"\n`;
                        }
                    }
                } else {
                    yaml += `${spaces}  - "${item}"\n`;
                }
            }
        } else if (typeof value === 'object') {
            yaml += `${spaces}${key}:\n${toYAML(value, indent + 1)}`;
        } else if (typeof value === 'string' && value.includes('\n')) {
            yaml += `${spaces}${key}: |\n`;
            for (const line of value.split('\n')) {
                yaml += `${spaces}  ${line}\n`;
            }
        } else {
            yaml += `${spaces}${key}: "${value}"\n`;
        }
    }

    return yaml;
}

function parseFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { data: {}, content: text };

    return {
        data: parseYAML(match[1]),
        content: match[2].trim(),
    };
}

function toMarkdown(data, content) {
    let md = '---\n';
    md += toYAML(data);
    md += '---\n\n';
    md += content;
    return md;
}

const contentPaths = {
    about: 'content/about.yml',
    quotes: 'content/quotes.yml',
    workouts: 'content/workouts.yml',
    site: 'content/site.yml',
};

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
        return res.status(204).end();
    }

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

    // Authenticate
    const auth = authenticateRequest(req);
    if (!auth.authenticated) {
        return res.status(401).json({ error: auth.error });
    }

    // Parse path
    const { path } = req.query;
    const segments = Array.isArray(path) ? path : [path];
    const contentType = segments[0];
    const slug = segments[1];

    try {
        // GET /api/content - List all content types
        if (req.method === 'GET' && !contentType) {
            return res.status(200).json({
                types: ['about', 'quotes', 'workouts', 'site', 'blog'],
            });
        }

        // Handle blog posts
        if (contentType === 'blog') {
            return handleBlog(req, res, slug);
        }

        // Check valid content type
        if (!contentPaths[contentType]) {
            return res.status(404).json({ error: 'Content type not found' });
        }

        const filePath = contentPaths[contentType];

        // GET content
        if (req.method === 'GET') {
            const file = await getFileContent(filePath);
            if (!file) {
                return res.status(404).json({ error: 'Content not found' });
            }
            const data = parseYAML(file.content);
            return res.status(200).json({ data, sha: file.sha });
        }

        // PUT content
        if (req.method === 'PUT') {
            const { data, sha } = req.body || {};
            if (!data) {
                return res.status(400).json({ error: 'Data is required' });
            }
            const yamlContent = toYAML(data);
            const message = `Update ${contentType} via admin panel`;
            await updateFileContent(filePath, yamlContent, message, sha);
            return res.status(200).json({ success: true, message: 'Content updated' });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Content error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

async function handleBlog(req, res, slug) {
    const blogDir = 'content/blog';

    if (req.method === 'GET' && !slug) {
        const files = await listDirectory(blogDir);
        const posts = [];

        for (const file of files) {
            if (file.name.endsWith('.md')) {
                const fileData = await getFileContent(file.path);
                if (fileData) {
                    const { data } = parseFrontmatter(fileData.content);
                    posts.push({
                        slug: file.name.replace('.md', ''),
                        sha: fileData.sha,
                        ...data,
                    });
                }
            }
        }

        posts.sort((a, b) => new Date(b.date) - new Date(a.date));
        return res.status(200).json({ posts });
    }

    if (req.method === 'GET' && slug) {
        const filePath = `${blogDir}/${slug}.md`;
        const file = await getFileContent(filePath);
        if (!file) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const { data, content } = parseFrontmatter(file.content);
        return res.status(200).json({ slug, sha: file.sha, data, content });
    }

    if (req.method === 'POST') {
        const { data, content } = req.body || {};
        if (!data || !data.title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        const newSlug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const filePath = `${blogDir}/${newSlug}.md`;
        const markdown = toMarkdown(data, content || '');
        const message = `Add new blog post: ${data.title}`;
        await updateFileContent(filePath, markdown, message);
        return res.status(201).json({ success: true, slug: newSlug });
    }

    if (req.method === 'PUT' && slug) {
        const { data, content, sha } = req.body || {};
        if (!data) {
            return res.status(400).json({ error: 'Data is required' });
        }
        const filePath = `${blogDir}/${slug}.md`;
        const markdown = toMarkdown(data, content || '');
        const message = `Update blog post: ${data.title || slug}`;
        await updateFileContent(filePath, markdown, message, sha);
        return res.status(200).json({ success: true, slug });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
