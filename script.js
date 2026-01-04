// Dwayne's Fitness Blog - JavaScript
// Handles navigation, animations, and interactivity

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all functionality
    initNavbar();
    initScrollAnimations();
    initMobileMenu();
    initWorkoutTabs();
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
// Dwayne's Motivational Quotes
// ============================================
const quotes = [
    "Stop when you're done, not when you're tired.",
    "Your mind is the only limit.",
    "I can do all things through Christ who strengthens me.",
    "You need discipline, not motivation."
];

function rotateQuote() {
    const quoteElement = document.querySelector('.quote p');
    if (quoteElement) {
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

// Initialize quote rotation
rotateQuote();
