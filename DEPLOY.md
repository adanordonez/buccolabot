# BuccolaBot — Deploy to GitHub + Vercel

## Prerequisites

- [GitHub account](https://github.com)
- [Vercel account](https://vercel.com) (sign up with GitHub)
- Git installed (`git --version` to check)

---

## Step 1: Create the GitHub Repo

1. Go to https://github.com/new
2. Name it `BuccolaBot` (or whatever you want)
3. Set to **Private**
4. Do NOT initialize with README or .gitignore (we already have them)
5. Click **Create repository**

---

## Step 2: Push Your Code

Open terminal in the project folder and run these commands one at a time:

```bash
cd ~/Desktop/BuccolaBot

git init

git add .

git commit -m "initial commit"

git branch -M main

git remote add origin https://github.com/YOUR_GITHUB_USERNAME/BuccolaBot.git

git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

---

## Step 3: Deploy on Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select **BuccolaBot** from the list
4. Framework Preset will auto-detect **Next.js** — leave it
5. Open **Environment Variables** and add these four:

| Name | Value |
|------|-------|
| `OPENAI_API_KEY` | your OpenAI key (starts with `sk-`) |
| `LLAMA_CLOUD_API_KEY` | your LlamaParse key (starts with `llx-`) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | your Mapbox token (starts with `pk.`) |
| `HUGEICONS_API_KEY` | your HugeIcons key |

6. Click **Deploy**

Vercel will build and give you a live URL (something like `buccolabot.vercel.app`).

---

## Step 4: After Deploy

Every time you push to `main`, Vercel auto-deploys:

```bash
git add .
git commit -m "description of changes"
git push
```

---

## Troubleshooting

**Build fails on Vercel?**
- Check the build logs in Vercel dashboard
- Most common: missing environment variable — double-check all 4 are set

**API routes returning 500?**
- Verify `OPENAI_API_KEY` is set in Vercel env vars (not just local `.env`)
- Same for `LLAMA_CLOUD_API_KEY`

**"Module not found" errors?**
- Run `npm install` locally, commit the updated `package-lock.json`, and push again

---

## Your Environment Variables

You can find your keys in your local `.env` file. Never commit that file — it's already in `.gitignore`.
