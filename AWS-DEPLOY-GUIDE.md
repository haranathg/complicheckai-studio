# AWS Deployment Guide: App Runner + Amplify

## Overview

| Component | AWS Service | Deploy Method |
|-----------|-------------|---------------|
| Backend (FastAPI) | App Runner | Git-based |
| Frontend (React) | Amplify | Git-based |

---

## Step 1: Deploy Backend to App Runner

### 1.1 Add config to your backend repo

Copy `apprunner.yaml` to your backend folder root:
```
backend/
├── apprunner.yaml   <-- add this
├── main.py
├── requirements.txt
└── routers/
```

### 1.2 Create IAM Role for Bedrock Access (Optional)

If you want to use **Bedrock Claude** parser:

1. Go to **[IAM Console](https://console.aws.amazon.com/iam)** → Roles → Create role
2. **Trusted entity:** AWS Service → App Runner
3. **Permissions:** Create a custom policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel"
         ],
         "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.*"
       }
     ]
   }
   ```
4. Name the role: `AppRunnerBedrockRole`
5. **Enable Claude models in Bedrock:**
   - Go to **[Bedrock Console](https://console.aws.amazon.com/bedrock)** → Model access
   - Request access to Anthropic Claude models

### 1.3 Create App Runner Service

1. Go to **[AWS App Runner Console](https://console.aws.amazon.com/apprunner)**
2. Click **Create service**
3. **Source and deployment:**
   - Repository type: **Source code repository**
   - Click **Add new** → Connect your GitHub account
   - Select your backend repo
   - Branch: `main` (or your default branch)
4. **Build settings:**
   - Configuration file: **Use configuration file** ✓
   - (It will auto-detect `apprunner.yaml`)
5. **Service settings:**
   - Service name: `landing-pdf-backend`
   - CPU: 1 vCPU (can start small)
   - Memory: 2 GB
6. **Security** (for Bedrock access):
   - Instance role: Select `AppRunnerBedrockRole` (created in step 1.2)
7. **Environment variables** (click "Add environment variable"):
   ```
   # Required for Landing AI parser
   VISION_AGENT_API_KEY  = your-landing-ai-key

   # Required for Claude Vision parser (Anthropic API)
   ANTHROPIC_API_KEY     = sk-ant-xxxxx

   # Required for Gemini Vision parser
   GOOGLE_GEMINI_API_KEY = your-gemini-key

   # For Bedrock Claude parser (uses IAM role, no key needed)
   AWS_REGION            = us-east-1
   ```
8. Click **Create & deploy**
9. Wait ~5 min → Copy your URL: `https://xxxxx.us-east-1.awsapprunner.com`

### 1.4 Test Backend

```bash
curl https://xxxxx.us-east-1.awsapprunner.com/health
# Should return: {"status":"healthy"}
```

---

## Step 2: Deploy Frontend to Amplify

### 2.1 Add config to your frontend repo

Copy `amplify.yml` to your frontend folder root:
```
frontend/
├── amplify.yml   <-- add this
├── package.json
├── src/
└── vite.config.ts
```

### 2.2 Create Amplify App

1. Go to **[AWS Amplify Console](https://console.aws.amazon.com/amplify)**
2. Click **Create new app**
3. **Source:** Select **GitHub**
4. Authorize AWS Amplify to access your GitHub
5. Select your frontend repo and branch
6. **Build settings:**
   - Amplify will auto-detect `amplify.yml`
   - Framework: should auto-detect Vite
7. **Environment variables** (expand "Advanced settings"):
   ```
   # Backend API URL (from App Runner)
   VITE_API_URL = https://xxxxx.us-east-1.awsapprunner.com

   # Parser options - set to 'true' to enable each parser
   VITE_ENABLE_CLAUDE_VISION   = true
   VITE_ENABLE_GEMINI_VISION   = true
   VITE_ENABLE_BEDROCK_CLAUDE  = true
   ```
   (Use the App Runner URL from Step 1)
8. Click **Save and deploy**
9. Wait ~3 min → Your app is live at: `https://main.xxxxxxx.amplifyapp.com`

---

## Step 3: Update CORS (Final Step)

Once you have your Amplify URL, update your backend's CORS in `main.py`:

```python
allowed_origins = os.getenv("ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,https://main.xxxxxxx.amplifyapp.com"
).split(",")
```

Or set via environment variable in App Runner:
```
ALLOWED_ORIGINS = http://localhost:3000,http://localhost:5173,https://main.xxxxxxx.amplifyapp.com
```

Push the change → App Runner auto-deploys.

---

## Quick Reference

### Env Variables Summary

**App Runner (Backend):**
| Variable | Required For | Description |
|----------|--------------|-------------|
| `VISION_AGENT_API_KEY` | Landing AI parser | Your Landing.AI key |
| `ANTHROPIC_API_KEY` | Claude Vision parser + Chat | Your Anthropic API key |
| `GOOGLE_GEMINI_API_KEY` | Gemini Vision parser | Your Google Gemini key |
| `AWS_REGION` | Bedrock Claude parser | AWS region (default: us-east-1) |
| `ALLOWED_ORIGINS` | CORS | Comma-separated allowed origins |

> **Note:** Bedrock Claude doesn't need an API key - it uses the IAM role attached to App Runner.

**Amplify (Frontend):**
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your App Runner backend URL |
| `VITE_ENABLE_CLAUDE_VISION` | Show Claude Vision in dropdown (true/false) |
| `VITE_ENABLE_GEMINI_VISION` | Show Gemini Vision in dropdown (true/false) |
| `VITE_ENABLE_BEDROCK_CLAUDE` | Show Bedrock Claude in dropdown (true/false) |

### Parser Options

| Parser | Backend Requirement | Frontend Flag |
|--------|---------------------|---------------|
| Landing AI | `VISION_AGENT_API_KEY` | Always enabled |
| Claude Vision | `ANTHROPIC_API_KEY` | `VITE_ENABLE_CLAUDE_VISION=true` |
| Gemini Vision | `GOOGLE_GEMINI_API_KEY` | `VITE_ENABLE_GEMINI_VISION=true` |
| Bedrock Claude | IAM Role + Bedrock access | `VITE_ENABLE_BEDROCK_CLAUDE=true` |

### Auto-Deploy

Both services auto-deploy when you push to your connected branch. No manual redeploy needed!

### Estimated Costs

| Service | Cost |
|---------|------|
| App Runner | ~$5-15/mo (pauses when idle) |
| Amplify Hosting | Free tier covers most dev usage |
| Bedrock Claude | Pay per token (~$3/M input, $15/M output for Sonnet) |

---

## Troubleshooting

### Backend not starting?
- Check App Runner logs in the console
- Verify `requirements.txt` has all dependencies
- Make sure `main:app` matches your FastAPI app location

### Frontend can't reach backend?
- Check CORS settings include your Amplify domain
- Verify `VITE_API_URL` doesn't have a trailing slash
- Check browser console for errors

### Bedrock Claude not working?
- Verify IAM role is attached to App Runner service
- Check Bedrock model access is enabled in your region
- Ensure the role has `bedrock:InvokeModel` permission

### Parser not showing in dropdown?
- Check the `VITE_ENABLE_*` environment variable is set to `true`
- Rebuild the Amplify app after changing env vars

### Build failing?
- App Runner: Check build logs for Python errors
- Amplify: Check build logs for npm/node errors

---

## Optional: Custom Domain

Both services support custom domains:

**App Runner:**
Settings → Custom domains → Add domain

**Amplify:**
App settings → Domain management → Add domain

Both provide free SSL certificates.
