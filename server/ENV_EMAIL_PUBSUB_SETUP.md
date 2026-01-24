# Email & Pub/Sub Environment Variables Setup

This guide shows you how to configure the environment variables for email invoice extraction using Google Cloud Pub/Sub.

## Quick Setup Checklist

- [ ] Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
- [ ] Configure `PUBSUB_PROJECT_ID` in your `.env` file
- [ ] Choose email provider (Gmail API or IMAP)
- [ ] Configure email credentials based on your choice
- [ ] Test the configuration

## Environment Variables Added

The following environment variables have been added to:
- `.env.example` (template)
- `.env.development` (development environment)
- `.env.production` (production environment)

### Pub/Sub Configuration

```bash
# Google Cloud Pub/Sub Configuration
PUBSUB_PROJECT_ID=your-gcp-project-id
PUBSUB_TOPIC_NAME=email-invoices
PUBSUB_SUBSCRIPTION_NAME=email-invoices-sub
```

**Note**: You also need to set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable (not in .env file):
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

### Email Configuration

```bash
# Email Provider (choose 'gmail' or 'imap')
EMAIL_PROVIDER=gmail

# Gmail API (if using EMAIL_PROVIDER=gmail)
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-client-secret
GMAIL_REFRESH_TOKEN=your-gmail-refresh-token

# IMAP (if using EMAIL_PROVIDER=imap)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@example.com
IMAP_PASSWORD=your-app-password
IMAP_TLS=true

# Polling Interval (milliseconds)
EMAIL_POLL_INTERVAL=60000
```

## Step-by-Step Configuration

### 1. Google Cloud Pub/Sub Setup

1. **Create a Google Cloud Project** (if you don't have one):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Note your Project ID

2. **Enable Pub/Sub API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Cloud Pub/Sub API"
   - Click "Enable"

3. **Create a Service Account**:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Give it a name (e.g., "pubsub-email-processor")
   - Grant it the "Pub/Sub Admin" role
   - Click "Done"

4. **Create and Download Key**:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose "JSON" format
   - Download the key file
   - Save it securely (e.g., `~/gcp-keys/pubsub-service-account.json`)

5. **Set Environment Variable**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
   ```
   
   Or add to your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   echo 'export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"' >> ~/.zshrc
   source ~/.zshrc
   ```

6. **Update `.env` file**:
   ```bash
   PUBSUB_PROJECT_ID=your-actual-project-id
   ```

### 2. Email Provider Setup

Choose one of the following options:

#### Option A: Gmail API (Recommended)

1. **Enable Gmail API**:
   - In the same Google Cloud project
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"

2. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - If prompted, configure OAuth consent screen first:
     - User Type: External (for testing) or Internal (for Google Workspace)
     - App name: "ReXcan Email Processor"
     - Support email: your email
     - Scopes: Add `https://www.googleapis.com/auth/gmail.readonly`
     - Save and continue
   - Back to Credentials, create OAuth client ID:
     - Application type: "Desktop app"
     - Name: "ReXcan Desktop Client"
     - Click "Create"
     - Download the JSON file (or copy Client ID and Client Secret)

3. **Get Refresh Token**:
   
   **Method 1: Using OAuth 2.0 Playground**
   - Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
   - Click the gear icon (⚙️) in top right
   - Check "Use your own OAuth credentials"
   - Enter your Client ID and Client Secret
   - In left panel, find "Gmail API v1"
   - Select `https://www.googleapis.com/auth/gmail.readonly`
   - Click "Authorize APIs"
   - Sign in and grant permissions
   - Click "Exchange authorization code for tokens"
   - Copy the "Refresh token"

   **Method 2: Using a script** (see documentation/EMAIL_PUBSUB_SETUP.md)

4. **Update `.env` file**:
   ```bash
   EMAIL_PROVIDER=gmail
   GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your-client-secret
   GMAIL_REFRESH_TOKEN=your-refresh-token
   ```

#### Option B: IMAP (Simpler, but less secure)

1. **Enable 2-Factor Authentication** on your Gmail account

2. **Generate App Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Security > 2-Step Verification > App passwords
   - Select "Mail" and "Other (Custom name)"
   - Enter "ReXcan" as the name
   - Click "Generate"
   - Copy the 16-character password

3. **Update `.env` file**:
   ```bash
   EMAIL_PROVIDER=imap
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   IMAP_USER=your-email@gmail.com
   IMAP_PASSWORD=your-16-char-app-password
   IMAP_TLS=true
   ```

## Verification

After configuring, verify your setup:

1. **Check Pub/Sub**:
   ```bash
   # The app will automatically create topic and subscription on first run
   # You can verify in Google Cloud Console > Pub/Sub > Topics
   ```

2. **Check Email Service Status**:
   ```bash
   # Start your server
   npm run dev
   
   # In another terminal, test the status endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/v1/email/status
   ```

3. **Test Email Fetching**:
   ```bash
   # Manually trigger email fetch
   curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/v1/email/fetch?maxResults=5
   ```

## Troubleshooting

### Pub/Sub Not Initialized

- Verify `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Check that the service account key file exists and is readable
- Verify `PUBSUB_PROJECT_ID` matches your GCP project ID
- Ensure Pub/Sub API is enabled in your project

### Email Service Not Initialized

**For Gmail API**:
- Verify all three credentials are set (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)
- Check that Gmail API is enabled in your project
- Ensure refresh token hasn't expired (they can be revoked)

**For IMAP**:
- Verify IMAP_USER and IMAP_PASSWORD are correct
- For Gmail, ensure you're using an App Password (not your regular password)
- Check that 2FA is enabled on your Gmail account
- Try connecting manually: `telnet imap.gmail.com 993`

### Messages Not Processing

- Check that the worker is running: `npm run worker:dev`
- Verify Pub/Sub subscription exists in Google Cloud Console
- Check worker logs for errors
- Ensure documents are being created in the database

## Security Best Practices

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Rotate credentials regularly** - Especially refresh tokens and app passwords
3. **Use least privilege** - Service account should only have Pub/Sub permissions
4. **Store keys securely** - Use secret management services in production
5. **Monitor access** - Check Google Cloud audit logs regularly

## Next Steps

Once configured:
1. Start the server: `npm run dev`
2. Start the worker: `npm run worker:dev` (in another terminal)
3. Test email fetching via API
4. Check that emails are being processed

For more details, see `documentation/EMAIL_PUBSUB_SETUP.md`.

