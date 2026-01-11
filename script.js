// Dwayne's Fitness Blog - JavaScript
// Handles navigation, animations, content loading, and interactivity

// ============================================
// Content Loading from YAML Files
// ============================================

// Simple YAML parser for our structured content
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

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            if (inMultilineString && trimmed === '') {
                multilineContent += '\n';
            }
            continue;
        }

        // Handle multiline strings
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

        // Check for multiline indicator
        if (trimmed.endsWith('|')) {
            multilineKey = trimmed.slice(0, -1).replace(':', '').trim();
            multilineContent = '';
            inMultilineString = true;
            indentLevel = line.search(/\S/);
            continue;
        }

        // Handle list items
        if (trimmed.startsWith('- ')) {
            const content = trimmed.slice(2);
            if (content.includes(':')) {
                // Object in list
                const [key, ...valueParts] = content.split(':');
                const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                if (!currentList) currentList = [];
                if (!currentListItem) currentListItem = {};
                currentListItem[key.trim()] = value;
            } else {
                // Simple list item
                if (!currentList) currentList = [];
                if (currentListItem && Object.keys(currentListItem).length > 0) {
                    currentList.push(currentListItem);
                    currentListItem = {};
                }
                currentList.push({ text: content.replace(/^["']|["']$/g, '') });
            }
            continue;
        }

        // Handle object properties inside list items
        const leadingSpaces = line.search(/\S/);
        if (leadingSpaces >= 4 && currentListItem) {
            if (trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':');
                const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                currentListItem[key.trim()] = value;
            }
            continue;
        }

        // Save current list if we're moving to a new key
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

        // Handle regular key-value pairs
        if (trimmed.includes(':') && !trimmed.startsWith('-')) {
            const colonIndex = trimmed.indexOf(':');
            const key = trimmed.slice(0, colonIndex).trim();
            const value = trimmed.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');

            if (value === '' && !trimmed.endsWith('|')) {
                // This is a key for a list or nested object
                currentKey = key;
            } else {
                result[key] = value;
            }
        }
    }

    // Save any remaining list
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

// Parse markdown frontmatter
function parseFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { data: {}, content: text };

    const frontmatter = parseYAML(match[1]);
    return {
        data: frontmatter,
        content: match[2].trim()
    };
}

// Fetch and parse YAML file
async function loadContent(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}`);
        const text = await response.text();
        return parseYAML(text);
    } catch (error) {
        console.warn(`Could not load ${path}:`, error);
        return null;
    }
}

// Fetch and parse Markdown file
async function loadMarkdown(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}`);
        const text = await response.text();
        return parseFrontmatter(text);
    } catch (error) {
        console.warn(`Could not load ${path}:`, error);
        return null;
    }
}

// ============================================
// Dynamic Content Rendering
// ============================================

async function loadQuotes() {
    const data = await loadContent('/content/quotes.yml');
    if (data && Array.isArray(data.quotes)) {
        // Replace the quotes array
        window.dynamicQuotes = data.quotes.map(q => q.text || q);
        console.log('Loaded quotes:', window.dynamicQuotes);
    }
}

async function loadAbout() {
    const data = await loadContent('/content/about.yml');
    if (data) {
        // Update title
        const titleEl = document.getElementById('about-title');
        if (titleEl && data.title) {
            titleEl.textContent = data.title;
        }

        // Update bio - convert newlines to paragraphs
        const bioEl = document.getElementById('about-bio');
        if (bioEl && data.bio) {
            const paragraphs = data.bio.split('\n\n').filter(p => p.trim());
            bioEl.innerHTML = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
        }

        // Update stats
        const statsEl = document.getElementById('about-stats');
        if (statsEl && data.stats && Array.isArray(data.stats)) {
            statsEl.innerHTML = data.stats.map(stat => `
                <div class="stat">
                    <span class="stat-number">${stat.number || ''}</span>
                    <span class="stat-label">${stat.label || ''}</span>
                </div>
            `).join('');
        }

        console.log('Loaded about content');
    }
}

async function loadSiteContent() {
    // Load all dynamic content
    await Promise.all([
        loadQuotes(),
        loadAbout()
    ]);

    // Initialize quote rotation with dynamic quotes
    if (window.dynamicQuotes && window.dynamicQuotes.length > 0) {
        rotateQuote(window.dynamicQuotes);
    } else {
        rotateQuote(defaultQuotes);
    }
}

// ============================================
// Main Initialization
// ============================================

const defaultQuotes = [
    "Stop when you're done, not when you're tired.",
    "Your mind is the only limit.",
    "I can do all things through Christ who strengthens me.",
    "You need discipline, not motivation."
];

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all functionality
    initNavbar();
    initScrollAnimations();
    initMobileMenu();
    initWorkoutTabs();

    // Load dynamic content
    loadSiteContent();
});

// ============================================
// Navbar Scroll Effect
// ============================================
function initNavbar() {
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        // Add shadow on scroll
        if (currentScroll > 50) {
            navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.boxShadow = 'none';
        }

        // Hide/show navbar on scroll (optional enhancement)
        if (currentScroll > lastScroll && currentScroll > 400) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
        }

        lastScroll = currentScroll;
    });
}

// ============================================
// Mobile Menu Toggle
// ============================================
function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('mobile-open');
            menuBtn.classList.toggle('active');

            // Animate hamburger to X
            const spans = menuBtn.querySelectorAll('span');
            if (isOpen) {
                spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('mobile-open');
                menuBtn.classList.remove('active');
                const spans = menuBtn.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }
}

// ============================================
// Workout Tabs
// ============================================
function initWorkoutTabs() {
    const tabs = document.querySelectorAll('.workout-tab');
    const workoutCards = document.querySelectorAll('.workout-card');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active to clicked tab
            tab.classList.add('active');

            // Hide all workout cards
            workoutCards.forEach(card => {
                card.classList.add('hidden');
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
            });

            // Show selected workout card
            const targetId = tab.getAttribute('data-workout');
            const targetCard = document.getElementById(targetId);
            if (targetCard) {
                targetCard.classList.remove('hidden');
                // Animate in
                setTimeout(() => {
                    targetCard.style.opacity = '1';
                    targetCard.style.transform = 'translateY(0)';
                }, 50);
            }
        });
    });

    // Initialize first card styles
    const firstCard = document.getElementById('push1');
    if (firstCard) {
        firstCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }
    workoutCards.forEach(card => {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });
}

// ============================================
// Scroll Animations (Intersection Observer)
// ============================================
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.section-header, .about-content, .workout-card:not(.hidden), .blog-card, .quote, .pr-goals'
    );

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add CSS for animated-in state
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
        
        /* Mobile menu styles */
        @media (max-width: 768px) {
            .nav-links {
                position: fixed;
                top: 70px;
                left: 0;
                right: 0;
                background: rgba(10, 10, 10, 0.98);
                flex-direction: column;
                padding: 40px 24px;
                gap: 24px;
                transform: translateY(-100%);
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
            }
            
            .nav-links.mobile-open {
                display: flex;
                transform: translateY(0);
                opacity: 1;
                pointer-events: all;
            }
            
            .nav-links a {
                font-size: 1.1rem;
            }
            
            .btn-nav {
                width: 100%;
                text-align: center;
            }
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// Smooth Scroll for Anchor Links
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');

        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            const navbarHeight = document.querySelector('.navbar').offsetHeight;
            const targetPosition = targetElement.offsetTop - navbarHeight - 20;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ============================================
// Quote Rotation
// ============================================
function rotateQuote(quotes) {
    const quoteElement = document.querySelector('.quote p');
    if (quoteElement && quotes && quotes.length > 0) {
        let currentIndex = 0;

        setInterval(() => {
            quoteElement.style.opacity = '0';
            quoteElement.style.transform = 'translateY(10px)';

            setTimeout(() => {
                currentIndex = (currentIndex + 1) % quotes.length;
                quoteElement.textContent = quotes[currentIndex];
                quoteElement.style.opacity = '1';
                quoteElement.style.transform = 'translateY(0)';
            }, 500);
        }, 8000);

        // Add transition styles
        quoteElement.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    }
}
