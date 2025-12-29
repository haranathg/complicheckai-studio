# CompliCheckAI Studio - Development Notes

## AWS Profiles

- **coguser**: Use this profile for AWS CLI commands (App Runner, Amplify, S3)
  - Region: `ap-southeast-2` (Sydney)
  - Usage: `AWS_PROFILE=coguser aws <command> --region ap-southeast-2`

## AWS Resources

### Frontend (Amplify)
- App: complicheckai-studio
- Branch: main
- URL: https://ccai.cognaify.com.au

### Backend (App Runner)
- Service: complicheckai-api
- ARN: `arn:aws:apprunner:ap-southeast-2:158291236521:service/complicheckai-api/f1fa8ad9179c4a3aa2067d847bdc5408`
- Source: GitHub repo `/backend` directory, `main` branch

### Authentication (Cognito)
- User Pool ID: `ap-southeast-2_XfDKRBdA5`
- Client ID: `1gsmn2keidpo2uqh88is5176rg`
- Region: `ap-southeast-2`

## Environment Variables

### Frontend (Vite)
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_COGNITO_REGION`
- `VITE_AUTH_DISABLED` (set to 'true' for local dev without auth)

### Backend
- `AUTH_DISABLED` (set to 'false' in production)
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_REGION`

## Build Notes

- pymupdf requires pre-built wheels; pin to version with wheels for Python 3.11 on Linux
