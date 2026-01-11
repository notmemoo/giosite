# 🔐 Dwayne's Fitness Blog - Admin Guide

## Quick Start

Your admin panel is now mobile-first and works perfectly on your phone! 📱

### How to Access

1. **Open the admin panel**: Go to `yoursite.com/admin/`
2. **Enter your email**: The one you set up as `ADMIN_EMAIL`
3. **Check your email**: Click the magic link to log in
4. **You're in!** The session lasts 7 days

---

## What You Can Edit

| Section | What it controls |
|---------|------------------|
| **About Me** | Your bio, profile, and stats on the homepage |
| **Quotes** | The rotating motivational quotes |
| **Workouts** | Your PPL split and exercise lists |
| **Settings** | Site title, hero text, SEO description |
| **Blog Posts** | Create and manage your articles |

---

## Setting Up (First Time Only)

### 1. Environment Variables

In your Netlify dashboard, go to **Site Settings > Environment Variables** and add:

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Random secret for tokens | Generate at [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) |
| `ADMIN_EMAIL` | Your email for login | `dwayne@example.com` |
| `RESEND_API_KEY` | For sending magic links | Get free at [resend.com](https://resend.com) |
| `GITHUB_REPO` | Your repo in owner/repo format | `dwayne/fitness-blog` |
| `GITHUB_TOKEN` | GitHub token with repo access | Create at [github.com/settings/tokens](https://github.com/settings/tokens/new) |
| `GITHUB_BRANCH` | Branch to save changes | `main` |

### 2. Create GitHub Token

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. Give it a name like "Fitness Blog Admin"
3. Select **repo** (Full control of private repositories)
4. Click "Generate token"
5. Copy the token and add it to Netlify

### 3. Get Resend API Key

1. Sign up at [resend.com](https://resend.com) (free tier works!)
2. Go to API Keys
3. Create a new key
4. Add it to Netlify as `RESEND_API_KEY`

---

## Tips

- 📱 **Add to Home Screen**: On your phone, tap Share > Add to Home Screen for quick access
- 🔄 **Changes go live automatically**: After saving, Netlify rebuilds your site (takes ~1 min)
- 📝 **Blog posts**: Tap the + button to create a new post
- 💾 **Don't forget to save**: Tap the Save button after making changes!

---

## Troubleshooting

### "Magic link not received"
- Check your spam folder
- Make sure `RESEND_API_KEY` is set correctly
- Verify `ADMIN_EMAIL` matches what you're entering

### "Failed to save content"
- Check that `GITHUB_TOKEN` has the `repo` permission
- Verify `GITHUB_REPO` is in the correct format: `owner/repo`

### "Token expired"
- Just request a new magic link - tokens last 7 days

---

## Tech Stack

For the nerds 🤓

- **Frontend**: Vanilla HTML/CSS/JS (no frameworks = fast!)
- **Backend**: Netlify Functions (serverless)
- **Auth**: Magic Link + JWT
- **Storage**: GitHub API (your content lives in your repo)
- **Email**: Resend

---

Built with 💪 by your dev team
