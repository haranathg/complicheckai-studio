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

### 1.2 Store API Keys in AWS Secrets Manager (Recommended)

Store your API keys securely in AWS Secrets Manager instead of environment variables:

1. Go to **[Secrets Manager Console](https://console.aws.amazon.com/secretsmanager)**
2. Click **Store a new secret** for each API key:

   | Secret Name | Value | Required For |
   |-------------|-------|--------------|
   | `LandingAI-API-Key` | Your Landing.AI API key | Landing AI parser |
   | `Anthropic-API-Key` | Your Anthropic API key | Claude Vision parser |
   | `Google-Gemini-API-Key` | Your Google Gemini key | Gemini Vision parser |

3. For each secret:
   - **Secret type:** Other type of secret
   - **Key/value:** Use `api_key` as key, your actual key as value
   - **Secret name:** Use the exact names above
   - **Region:** Same region as your App Runner service (e.g., `ap-southeast-2`)

### 1.3 Create IAM Role for App Runner

Create an IAM role with permissions for Bedrock and Secrets Manager:

1. Go to **[IAM Console](https://console.aws.amazon.com/iam)** → Roles → Create role
2. **Trusted entity:** AWS Service → App Runner
3. **Permissions:** Create a custom policy with this JSON:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "BedrockAccess",
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel"
         ],
         "Resource": [
           "arn:aws:bedrock:*::foundation-model/anthropic.*",
           "arn:aws:bedrock:*::foundation-model/amazon.nova*"
         ]
       },
       {
         "Sid": "SecretsManagerAccess",
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue"
         ],
         "Resource": [
           "arn:aws:secretsmanager:*:*:secret:LandingAI-API-Key*",
           "arn:aws:secretsmanager:*:*:secret:Anthropic-API-Key*",
           "arn:aws:secretsmanager:*:*:secret:Google-Gemini-API-Key*"
         ]
       }
     ]
   }
   ```
4. Name the role: `AppRunnerBedrockRole`
5. **Enable models in Bedrock:**
   - Go to **[Bedrock Console](https://console.aws.amazon.com/bedrock)** → Model access
   - Request access to:
     - Anthropic Claude models (Sonnet 3.5, Opus 3)
     - Amazon Nova models (Nova Pro)

### 1.4 Create App Runner Service

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
6. **Security** (for Bedrock and Secrets Manager access):
   - Instance role: Select `AppRunnerBedrockRole` (created in step 1.3)
7. **Environment variables** (click "Add environment variable"):
   ```
   # AWS region (for Bedrock and Secrets Manager)
   AWS_REGION      = ap-southeast-2

   # CORS allowed origins (add your Amplify URL later)
   ALLOWED_ORIGINS = http://localhost:3000,http://localhost:5173
   ```
   > **Note:** API keys are retrieved from AWS Secrets Manager automatically.
   > You can optionally set them as env vars to override Secrets Manager.
8. Click **Create & deploy**
9. Wait ~5 min → Copy your URL: `https://xxxxx.us-east-1.awsapprunner.com`

### 1.5 Test Backend

```bash
curl https://xxxxx.ap-southeast-2.awsapprunner.com/health
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
| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_REGION` | Yes | AWS region for Bedrock and Secrets Manager |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS allowed origins |

**API Keys (via AWS Secrets Manager):**
| Secret Name | Required For | Description |
|-------------|--------------|-------------|
| `LandingAI-API-Key` | Landing AI parser | Your Landing.AI key |
| `Anthropic-API-Key` | Claude Vision + Chat | Your Anthropic API key |
| `Google-Gemini-API-Key` | Gemini Vision parser | Your Google Gemini key |

> **Note:** API keys are retrieved from Secrets Manager automatically. You can override by setting env vars directly.

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
| Landing AI | `LandingAI-API-Key` secret | Always enabled |
| Claude Vision | `Anthropic-API-Key` secret | `VITE_ENABLE_CLAUDE_VISION=true` |
| Gemini Vision | `Google-Gemini-API-Key` secret | `VITE_ENABLE_GEMINI_VISION=true` |
| Bedrock Claude | IAM Role + Bedrock access | `VITE_ENABLE_BEDROCK_CLAUDE=true` |

### Bedrock Model Options

When using the **Bedrock Claude** parser, the following models are available:

| Model | Model ID | Description | Cost (per 1M tokens) |
|-------|----------|-------------|----------------------|
| Claude Sonnet 3.5 | `bedrock-claude-sonnet-3.5` | Balanced speed & quality | $3 / $15 |
| Claude Opus 3 | `bedrock-claude-opus-3` | Highest quality | $15 / $75 |
| Nova Pro | `bedrock-nova-pro` | AWS native multimodal | $0.80 / $3.20 |

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
