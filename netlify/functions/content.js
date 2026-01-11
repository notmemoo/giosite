/**
 * Content Management API for Dwayne's Fitness Blog Admin
 * Handles CRUD operations for all content types via GitHub API
 */

const { verifyJWT } = require('./auth');

// Environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'owner/repo'; // e.g., 'dwayne/fitness-blog'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// GitHub API base URL
const GITHUB_API = 'https://api.github.com';

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Authenticate request
function authenticateRequest(event) {
    const authHeader = event.headers.authorization || '';
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

    console.log('GitHub API Request:', { url, method: options.method || 'GET' });

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
        console.error('GitHub API Error:', { status: response.status, error, path });
        throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response.json();
}

// Get file content from GitHub
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

// Update file content on GitHub
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

// Delete file on GitHub
async function deleteFile(filePath, message, sha) {
    return githubRequest(`/contents/${filePath}`, {
        method: 'DELETE',
        body: JSON.stringify({
            message,
            sha,
            branch: GITHUB_BRANCH,
        }),
    });
}

// List files in a directory
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

// Simple YAML parser (for reading content)
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

// Convert object to YAML string
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

// Parse markdown frontmatter
function parseFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { data: {}, content: text };

    return {
        data: parseYAML(match[1]),
        content: match[2].trim(),
    };
}

// Convert frontmatter + content to markdown
function toMarkdown(data, content) {
    let md = '---\n';
    md += toYAML(data);
    md += '---\n\n';
    md += content;
    return md;
}

// Content type to file path mapping
const contentPaths = {
    about: 'content/about.yml',
    quotes: 'content/quotes.yml',
    workouts: 'content/workouts.yml',
    site: 'content/site.yml',
};

exports.handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    // Authenticate all requests
    const auth = authenticateRequest(event);
    if (!auth.authenticated) {
        return {
            statusCode: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: auth.error }),
        };
    }

    // Parse path
    const basePath = event.path
        .replace('/.netlify/functions/content', '')
        .replace('/api/content', '');
    const segments = basePath.split('/').filter(Boolean);
    const contentType = segments[0];
    const slug = segments[1];

    try {
        // GET /content - List all content types
        if (event.httpMethod === 'GET' && !contentType) {
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    types: ['about', 'quotes', 'workouts', 'site', 'blog'],
                }),
            };
        }

        // Handle blog posts separately
        if (contentType === 'blog') {
            return handleBlog(event, slug);
        }

        // Check if content type is valid
        if (!contentPaths[contentType]) {
            return {
                statusCode: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Content type not found' }),
            };
        }

        const filePath = contentPaths[contentType];

        // GET /content/:type - Get content
        if (event.httpMethod === 'GET') {
            const file = await getFileContent(filePath);

            if (!file) {
                return {
                    statusCode: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Content not found' }),
                };
            }

            const data = parseYAML(file.content);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, sha: file.sha }),
            };
        }

        // PUT /content/:type - Update content
        if (event.httpMethod === 'PUT') {
            const { data, sha } = JSON.parse(event.body || '{}');

            if (!data) {
                return {
                    statusCode: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Data is required' }),
                };
            }

            const yamlContent = toYAML(data);
            const message = `Update ${contentType} via admin panel`;

            await updateFileContent(filePath, yamlContent, message, sha);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: 'Content updated' }),
            };
        }

        return {
            statusCode: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' }),
        };

    } catch (error) {
        console.error('Content error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};

// Handle blog post operations
async function handleBlog(event, slug) {
    const blogDir = 'content/blog';

    // GET /content/blog - List all blog posts
    if (event.httpMethod === 'GET' && !slug) {
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

        // Sort by date descending
        posts.sort((a, b) => new Date(b.date) - new Date(a.date));

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ posts }),
        };
    }

    // GET /content/blog/:slug - Get single blog post
    if (event.httpMethod === 'GET' && slug) {
        const filePath = `${blogDir}/${slug}.md`;
        const file = await getFileContent(filePath);

        if (!file) {
            return {
                statusCode: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Post not found' }),
            };
        }

        const { data, content } = parseFrontmatter(file.content);

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, sha: file.sha, data, content }),
        };
    }

    // POST /content/blog - Create new blog post
    if (event.httpMethod === 'POST') {
        const { data, content } = JSON.parse(event.body || '{}');

        if (!data || !data.title) {
            return {
                statusCode: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Title is required' }),
            };
        }

        // Generate slug from title
        const newSlug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const filePath = `${blogDir}/${newSlug}.md`;
        const markdown = toMarkdown(data, content || '');
        const message = `Add new blog post: ${data.title}`;

        await updateFileContent(filePath, markdown, message);

        return {
            statusCode: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, slug: newSlug }),
        };
    }

    // PUT /content/blog/:slug - Update blog post
    if (event.httpMethod === 'PUT' && slug) {
        const { data, content, sha } = JSON.parse(event.body || '{}');

        if (!data) {
            return {
                statusCode: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Data is required' }),
            };
        }

        const filePath = `${blogDir}/${slug}.md`;
        const markdown = toMarkdown(data, content || '');
        const message = `Update blog post: ${data.title || slug}`;

        await updateFileContent(filePath, markdown, message, sha);

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, slug }),
        };
    }

    // DELETE /content/blog/:slug - Delete blog post
    if (event.httpMethod === 'DELETE' && slug) {
        const filePath = `${blogDir}/${slug}.md`;
        const file = await getFileContent(filePath);

        if (!file) {
            return {
                statusCode: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Post not found' }),
            };
        }

        await deleteFile(filePath, `Delete blog post: ${slug}`, file.sha);

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true }),
        };
    }

    return {
        statusCode: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
    };
}
