# PSX Alpha — Region Block Solutions

## Current Status (HK server)

| Provider | Status | Reason |
|---|---|---|
| **Cohere** | ✅ Working | Command A model, real AI analysis |
| **GLM-4 (z-ai)** | ✅ Working | Sandbox, no key needed |
| **OpenRouter** | ⚠️ Rate-limited | 50/day free tier (resets midnight UTC) |
| Gemini | ❌ HK blocked | "User location is not supported" |
| Groq | ❌ HK blocked | Cloudflare 403 Forbidden |
| OpenAI | ❌ HK blocked | Cloudflare 403 Forbidden |
| Anthropic | ❌ HK blocked | Cloudflare 403 Forbidden |
| Cerebras | ❌ HK blocked | Cloudflare 403 Forbidden |

## Solutions

### Solution 1: Use Globally-Accessible Providers (NO proxy needed)

Get a free API key from ANY of these — they all work from HK:

| Provider | URL | Free Tier | Notes |
|---|---|---|---|
| **Together AI** | https://api.together.xyz/settings/api-keys | Free Llama 3.3 70B Turbo | Globally accessible |
| **Mistral AI** | https://console.mistral.ai/api-keys | Free tier (mistral-small) | Globally accessible |
| **DeepInfra** | https://deepinfra.com/dash/api_keys | Free tier (GLM-4.7, Llama, etc.) | Globally accessible |
| **Replicate** | https://replicate.com/account/api-tokens | Free trial | Globally accessible |
| **Cohere** ✅ | https://dashboard.cohere.com/api-keys | 1000/month free | Already configured |

**Just send me the API key** (starts with different prefixes) and I'll add it to `.env`.

### Solution 2: Deploy a Cloudflare Worker Proxy (Bypass region block)

Use this to make Groq/Gemini/OpenAI work from HK by routing through Cloudflare's edge network (US/EU/JP).

**Steps:**
1. Go to https://dash.cloudflare.com → Sign up (free)
2. Workers & Pages → Create Application → Create Worker
3. Name it "psx-alpha-proxy"
4. Delete the default code, paste the contents of `scripts/cloudflare-worker/worker.js` (in this project)
5. Click "Save and Deploy"
6. Copy the worker URL (looks like `https://psx-alpha-proxy.yourname.workers.dev`)
7. **Send me the worker URL** — I'll update the app to route Groq/Gemini/OpenAI through it

**Free tier:** 100,000 requests/day (plenty for our use case)

### Solution 3: Self-Host a Proxy on a Non-HK VPS

Get a small VPS ($5/month) in US/EU/JP and run a simple proxy:
- DigitalOcean, Vultr, Linode — many regions
- Run a small Node.js script that forwards API requests
- Update app to use the VPS URL for Groq/Gemini

### Solution 4: Use OpenRouter Paid Plan

- Add $10 to OpenRouter account
- Unlocks 1000+ free model requests per day
- Globally accessible (works from HK)
- URL: https://openrouter.ai/credits

## Recommendation

**Easiest:** Get a Together AI or DeepInfra key (Solution 1) — no proxy needed, free, works globally.

**Best for AI power-user:** Deploy Cloudflare Worker proxy (Solution 2) — bypasses ALL region blocks for Groq/Gemini/OpenAI/Claude/DeepSeek.

## Currently Working Providers (verified)

✅ **Cohere** — Real AI analysis with indicator-specific reasoning
✅ **GLM-4** — Sandbox fallback, supports Cohere for multi-provider consensus

These two together give us working AI analysis. Adding any of Solution 1's providers would give us 3+ providers for stronger consensus voting.
