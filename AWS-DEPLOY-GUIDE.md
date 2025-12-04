# AWS Deployment Guide: App Runner + Amplify

## Overview

| Component | AWS Service | Deploy Method |
|-----------|-------------|---------------|
| Backend (FastAPI) | App Runner | Git-based |
| Frontend (React) | Amplify | Git-based |

The config files (`apprunner.yaml` and `amplify.yml`) are already in the repo.

---

## Step 1: Store API Keys in AWS Secrets Manager

Store your API keys securely in AWS Secrets Manager:

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

---

## Step 2: Create IAM Role for App Runner

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

---

## Step 3: Deploy Backend to App Runner

1. Go to **[AWS App Runner Console](https://console.aws.amazon.com/apprunner)**
2. Click **Create service**
3. **Source and deployment:**
   - Repository type: **Source code repository**
   - Click **Add new** → Connect your GitHub account
   - Select your repo and set **Source directory** to `/backend`
   - Branch: `main`
4. **Build settings:**
   - Configuration file: **Use configuration file** ✓
   - (It will auto-detect `backend/apprunner.yaml`)
5. **Service settings:**
   - Service name: `landing-pdf-backend`
   - CPU: 1 vCPU
   - Memory: 2 GB
6. **Security:**
   - Instance role: Select `AppRunnerBedrockRole` (created in Step 2)
7. **Environment variables:**
   - The `apprunner.yaml` already has default values for `AWS_REGION` and `ALLOWED_ORIGINS`
   - You can override these in the console if needed (console values take precedence)
   - API keys are retrieved from AWS Secrets Manager automatically

8. Click **Create & deploy**
9. Wait ~5 min → Copy your URL: `https://xxxxx.ap-southeast-2.awsapprunner.com`

### Test Backend

```bash
curl https://xxxxx.ap-southeast-2.awsapprunner.com/health
# Should return: {"status":"healthy"}
```

---

## Step 4: Deploy Frontend to Amplify

1. Go to **[AWS Amplify Console](https://console.aws.amazon.com/amplify)**
2. Click **Create new app**
3. **Source:** Select **GitHub**
4. Authorize AWS Amplify to access your GitHub
5. Select your repo and branch
6. **App settings:**
   - App name: `landing-pdf-frontend`
   - **Monorepo:** Check this box and set **Root directory** to `frontend`
7. **Build settings:**
   - Amplify will auto-detect `frontend/amplify.yml`
8. **Environment variables** (expand "Advanced settings" or set after creation):

   | Variable | Value |
   |----------|-------|
   | `VITE_API_URL` | `https://xxxxx.ap-southeast-2.awsapprunner.com` (your App Runner URL) |
   | `VITE_ENABLE_CLAUDE_VISION` | `true` |
   | `VITE_ENABLE_GEMINI_VISION` | `true` |
   | `VITE_ENABLE_BEDROCK_CLAUDE` | `true` |

9. Click **Save and deploy**
10. Wait ~3 min → Your app is live at: `https://main.xxxxxxx.amplifyapp.com`

### Setting Environment Variables in Amplify

If you didn't set them during creation:

1. Go to your Amplify app → **Hosting** → **Environment variables**
2. Click **Manage variables**
3. Add the variables from the table above
4. Click **Save**
5. Go to **Deployments** → Click **Redeploy this version** (env vars are injected at build time)

---

## Step 5: Update CORS (Final Step)

Once you have your Amplify URL, update the `ALLOWED_ORIGINS` in App Runner:

1. Go to **App Runner Console** → Select your service
2. Click **Configuration** → **Edit**
3. Update the `ALLOWED_ORIGINS` environment variable:
   ```
   http://localhost:3000,http://localhost:5173,https://main.xxxxxxx.amplifyapp.com
   ```
4. Save → App Runner will redeploy automatically

---

## Quick Reference

### App Runner Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_REGION` | Yes | AWS region for Bedrock and Secrets Manager |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS allowed origins |

### Secrets Manager Secrets

| Secret Name | Required For | Description |
|-------------|--------------|-------------|
| `LandingAI-API-Key` | Landing AI parser | Your Landing.AI key |
| `Anthropic-API-Key` | Claude Vision + Chat | Your Anthropic API key |
| `Google-Gemini-API-Key` | Gemini Vision parser | Your Google Gemini key |

> **Note:** API keys are retrieved from Secrets Manager automatically. You can override by setting env vars directly in App Runner.

### Amplify Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your App Runner backend URL |
| `VITE_ENABLE_CLAUDE_VISION` | Show Claude Vision in dropdown (`true`/`false`) |
| `VITE_ENABLE_GEMINI_VISION` | Show Gemini Vision in dropdown (`true`/`false`) |
| `VITE_ENABLE_BEDROCK_CLAUDE` | Show Bedrock Claude in dropdown (`true`/`false`) |

> **Important:** Amplify injects these at build time. After changing env vars, you must redeploy for changes to take effect.

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
- Verify the source directory is set to `/backend`
- Check that `requirements.txt` has all dependencies

### Frontend can't reach backend?
- Check CORS settings include your Amplify domain
- Verify `VITE_API_URL` doesn't have a trailing slash
- Check browser console for errors

### Environment variables not working in Amplify?
- Env vars are injected at **build time**, not runtime
- After changing env vars, you must redeploy
- Check the build logs to confirm vars are being set

### Bedrock Claude not working?
- Verify IAM role is attached to App Runner service
- Check Bedrock model access is enabled in your region
- Ensure the role has `bedrock:InvokeModel` permission

### Secrets Manager not working?
- Verify secrets exist with exact names listed above
- Check IAM role has `secretsmanager:GetSecretValue` permission
- Ensure secrets are in the same region as App Runner

### Parser not showing in dropdown?
- Check the `VITE_ENABLE_*` environment variable is set to `true`
- Redeploy the Amplify app after changing env vars

---

## Optional: Custom Domain

Both services support custom domains:

**App Runner:**
Settings → Custom domains → Add domain

**Amplify:**
App settings → Domain management → Add domain

Both provide free SSL certificates.
