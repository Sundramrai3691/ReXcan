# Google Cloud Setup Guide - Step by Step

This guide walks you through setting up Google Cloud Pub/Sub and Gmail API for email invoice extraction.

## Prerequisites

- A Google account
- Access to Google Cloud Console (free tier is sufficient)

---

## Part 1: Create Google Cloud Project

### Step 1: Go to Google Cloud Console

1. Open your browser and go to: https://console.cloud.google.com/
2. Sign in with your Google account

### Step 2: Create a New Project

1. Click on the **project dropdown** at the top of the page (next to "Google Cloud")
2. Click **"New Project"** button
3. Fill in the project details:
   - **Project name**: `rexcan-email-processor` (or any name you prefer)
   - **Organization**: Leave as default (or select if you have one)
   - **Location**: Leave as default
4. Click **"Create"**
5. Wait for the project to be created (usually takes a few seconds)
6. **Important**: Note down your **Project ID** (it will be shown, e.g., `rexcan-email-processor-123456`)

### Step 3: Select Your Project

1. Click the project dropdown again
2. Select the project you just created
3. You should see your project name at the top

---

## Part 2: Enable Required APIs

### Step 1: Enable Pub/Sub API

1. In the left sidebar, click **"APIs & Services"** > **"Library"**
2. In the search bar at the top, type: `Cloud Pub/Sub API`
3. Click on **"Cloud Pub/Sub API"** from the results
4. Click the **"Enable"** button
5. Wait for it to enable (may take 30-60 seconds)
6. You should see a green checkmark and "API enabled" message

### Step 2: Enable Gmail API

1. Still in **"APIs & Services"** > **"Library"**
2. In the search bar, type: `Gmail API`
3. Click on **"Gmail API"** from the results
4. Click the **"Enable"** button
5. Wait for it to enable
6. You should see "API enabled" message

---

## Part 3: Create Service Account for Pub/Sub

### Step 1: Navigate to Service Accounts

1. In the left sidebar, click **"IAM & Admin"** > **"Service Accounts"**
2. You should see a list of service accounts (may be empty if this is a new project)

### Step 2: Create New Service Account

1. Click the **"+ CREATE SERVICE ACCOUNT"** button at the top
2. Fill in the details:
   - **Service account name**: `pubsub-email-processor`
   - **Service account ID**: Will auto-fill (e.g., `pubsub-email-processor`)
   - **Description**: `Service account for processing email invoices via Pub/Sub`
3. Click **"CREATE AND CONTINUE"**

### Step 3: Grant Permissions

1. In the **"Grant this service account access to project"** section:
   - Click the **"Select a role"** dropdown
   - Type `Pub/Sub` in the search box
   - Select **"Pub/Sub Admin"** (this gives full Pub/Sub access)
2. Click **"CONTINUE"**

### Step 4: Grant User Access (Optional)

1. You can skip this step for now (click **"DONE"**)
2. Or if you want to grant access to specific users, you can add them here

### Step 5: Create and Download Key

1. You should now see your service account in the list
2. Click on the service account name (`pubsub-email-processor`)
3. Click on the **"KEYS"** tab at the top
4. Click **"ADD KEY"** > **"Create new key"**
5. Select **"JSON"** as the key type
6. Click **"CREATE"**
7. A JSON file will automatically download to your computer
8. **Important**: 
   - Save this file in a secure location (e.g., `~/gcp-keys/pubsub-service-account.json`)
   - **DO NOT** commit this file to git (it contains sensitive credentials)
   - Note the file path - you'll need it for the `GOOGLE_APPLICATION_CREDENTIALS` environment variable

---

## Part 4: Set Up OAuth Consent Screen (for Gmail API)

**Updated: October 2025** - Google has updated the OAuth consent screen interface to use the new "Google Auth platform" structure.

### Step 1: Navigate to OAuth Consent Screen

1. In Google Cloud Console, navigate to **"Menu"** (☰) > **"Google Auth platform"** > **"Branding"**
   - Alternative path: **"APIs & Services"** > **"OAuth consent screen"** (may redirect to new interface)
   - Direct URL: https://console.cloud.google.com/apis/credentials/consent
2. If this is your first time, you may see a **"Get Started"** button - click it

### Step 2: Configure OAuth Consent Screen (Latest Process - October 2025)

The new interface uses a step-by-step wizard with separate sections:

#### Step 2.1: Branding (App Information)

1. **App name**: Enter `ReXcan Email Processor`
2. **User support email**: Select your email from the dropdown
3. **App logo**: (Optional) You can skip this for now
4. Click **"Next"**

#### Step 2.2: Audience (User Type)

1. Choose the **User Type**:
   - **Internal**: Only available to users within your organization (requires Google Workspace)
   - **External**: Available to any test user with a Google Account (recommended for personal/testing)
2. Select **"External"** (unless you have Google Workspace)
3. Click **"Next"**

#### Step 2.3: Contact Information

1. **Developer contact email**: Enter your email address (for Google to notify you about project changes)
2. Click **"Next"**

#### Step 2.4: Review and Agree to Policies

1. Review the **Google API Services User Data Policy**
2. Check the box to agree to the policy
3. Click **"Continue"** or **"Create"**

#### Step 2.5: Configure Scopes (Data Access)

1. Navigate to **"Google Auth platform"** > **"Data access"** (or use the left sidebar)
2. Click **"Add or Remove Scopes"** button
3. In the filter/search box, type: `gmail.readonly`
4. Find and check the box next to:
   - `https://www.googleapis.com/auth/gmail.readonly` (Gmail API - Read-only access to your email)
5. **Important Note (October 2025)**: Google has implemented **granular OAuth consent**, meaning users can grant or deny individual scopes. Ensure your application can handle scenarios where users may grant only partial permissions.
6. Click **"Save"**

#### Step 2.6: Add Test Users (Required for External Apps)

1. Navigate to **"Google Auth platform"** > **"Audience"** (or use the left sidebar)
2. Scroll down to **"Test users"** section
3. Click **"Add users"** button
4. Enter your email address (the one you'll be accessing Gmail for)
5. Click **"Add"**
6. Click **"Save"**

### Step 3: Verify Setup

1. Go back to **"Google Auth platform"** > **"Overview"**
2. Your OAuth consent screen should show:
   - **Status**: "In testing" (for External apps) or "Published"
   - **Publishing status**: Shows current state
3. **Note**: Apps in "Testing" mode have limitations:
   - Only specified test users can access the app
   - Refresh tokens expire after 7 days
   - To move to "Production", you'll need to submit for verification (if using sensitive scopes)

---

## Part 5: Create OAuth 2.0 Credentials (for Gmail API)

### Step 1: Navigate to Credentials

1. In the left sidebar, click **"APIs & Services"** > **"Credentials"**

### Step 2: Create OAuth Client ID

1. Click **"+ CREATE CREDENTIALS"** at the top
2. Select **"OAuth client ID"** from the dropdown

3. **Application type**: Select **"Desktop app"**
4. **Name**: `ReXcan Desktop Client` (or any name you prefer)
5. Click **"CREATE"**

6. **Important**: A popup will appear with your credentials:
   - **Client ID**: Copy this (looks like: `123456789-abcdefg.apps.googleusercontent.com`)
   - **Client Secret**: Copy this (looks like: `GOCSPX-abcdefghijklmnop`)
   - Click **"OK"**

7. **Save these credentials** - you'll need them for your `.env` file:
   - `GMAIL_CLIENT_ID` = The Client ID you just copied
   - `GMAIL_CLIENT_SECRET` = The Client Secret you just copied

---

## Part 6: Get Refresh Token

You need to get a refresh token to allow the application to access Gmail without user interaction.

### Method 1: Using OAuth 2.0 Playground (Easiest)

1. Go to: https://developers.google.com/oauthplayground/

2. **Configure OAuth Playground**:
   - Click the **gear icon (⚙️)** in the top right corner
   - Check the box: **"Use your own OAuth credentials"**
   - **OAuth Client ID**: Paste your Client ID from Step 5
   - **OAuth Client secret**: Paste your Client Secret from Step 5
   - Click **"Close"**

3. **Authorize**:
   - In the left panel, scroll down to find **"Gmail API v1"**
   - Expand it and check: **`https://www.googleapis.com/auth/gmail.readonly`**
   - Click **"Authorize APIs"** button
   - You'll be redirected to Google sign-in
   - Sign in with the email you added as a test user
   - Click **"Allow"** to grant permissions
   - You'll be redirected back to OAuth Playground

4. **Exchange for tokens**:
   - Click **"Exchange authorization code for tokens"** button
   - You'll see tokens appear on the right side

5. **Copy Refresh Token**:
   - Look for **"Refresh token"** in the response
   - Copy this token (it's a long string)
   - **Save this** - you'll need it for `GMAIL_REFRESH_TOKEN` in your `.env` file

### Method 2: Using a Script (Alternative)

If the playground method doesn't work, you can use a Node.js script:

1. Create a file `get-refresh-token.js`:
```javascript
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('Refresh Token:', token.refresh_token);
  });
});
```

2. Run it:
```bash
npm install googleapis
node get-refresh-token.js
```

3. Follow the instructions to get your refresh token

---

## Part 7: Verify Pub/Sub Setup

### Step 1: Check Pub/Sub in Console

1. In Google Cloud Console, go to **"Pub/Sub"** in the left sidebar
2. Click **"Topics"**
3. You should see an empty list (topics will be created automatically when you first use the service)

### Step 2: Verify Service Account

1. Go to **"IAM & Admin"** > **"Service Accounts"**
2. Verify your service account exists: `pubsub-email-processor`
3. Verify it has the **"Pub/Sub Admin"** role

---

## Part 8: Configure Your Application

### Step 1: Set Environment Variable

Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to point to your service account key:

**On macOS/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/pubsub-service-account.json"
```

**To make it permanent**, add to your `~/.zshrc` or `~/.bashrc`:
```bash
echo 'export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/pubsub-service-account.json"' >> ~/.zshrc
source ~/.zshrc
```

**On Windows (PowerShell):**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\pubsub-service-account.json"
```

### Step 2: Update Your .env File

Edit your `.env.development` or `.env.production` file:

```bash
# Pub/Sub Configuration
PUBSUB_PROJECT_ID=rexcan-email-processor-123456  # Your actual project ID
PUBSUB_TOPIC_NAME=email-invoices
PUBSUB_SUBSCRIPTION_NAME=email-invoices-sub

# Email Configuration
EMAIL_PROVIDER=gmail

# Gmail API Credentials (from Part 5 and Part 6)
GMAIL_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-abcdefghijklmnop
GMAIL_REFRESH_TOKEN=your-refresh-token-from-oauth-playground

# Email Polling
EMAIL_POLL_INTERVAL=60000
```

### Step 3: Verify Configuration

1. Start your server:
   ```bash
   cd server
   npm run dev
   ```

2. Check the logs - you should see:
   - "Pub/Sub client initialized"
   - "Gmail service initialized"

3. Test the status endpoint:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/v1/email/status
   ```

---

## Troubleshooting

### Issue: "Pub/Sub client not initialized"

**Solution:**
- Verify `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Check that the service account key file exists and is readable
- Verify `PUBSUB_PROJECT_ID` matches your actual project ID

### Issue: "Gmail service not initialized"

**Solution:**
- Verify all three Gmail credentials are set (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)
- Check that Gmail API is enabled in your project
- Ensure you're using the email that was added as a test user

### Issue: "Permission denied" errors

**Solution:**
- Verify the service account has "Pub/Sub Admin" role
- Check that OAuth consent screen is configured correctly
- Ensure you added yourself as a test user (if using External app type)

### Issue: "Refresh token expired"

**Solution:**
- Refresh tokens can be revoked if you change your password or revoke access
- Re-generate the refresh token using OAuth Playground (Part 6)

---

## Security Checklist

- [ ] Service account key file is stored securely (not in git)
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- [ ] `.env` files are not committed to git
- [ ] OAuth credentials are kept secure
- [ ] Only necessary permissions are granted (Pub/Sub Admin, Gmail Read-only)
- [ ] Test users are limited to necessary accounts

---

## Next Steps

Once everything is configured:

1. **Test the setup**:
   ```bash
   # Start server
   npm run dev
   
   # Start worker (in another terminal)
   npm run worker:dev
   ```

2. **Test email fetching**:
   ```bash
   # Get auth token first, then:
   curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/v1/email/fetch?maxResults=5
   ```

3. **Monitor in Google Cloud Console**:
   - Check Pub/Sub > Topics to see messages
   - Check Pub/Sub > Subscriptions to see message processing
   - Check Logs to see any errors

---

## Summary

You've now set up:
- ✅ Google Cloud Project
- ✅ Pub/Sub API enabled
- ✅ Gmail API enabled
- ✅ Service account with Pub/Sub permissions
- ✅ OAuth 2.0 credentials for Gmail
- ✅ Refresh token for Gmail access
- ✅ Application configured with credentials

Your email invoice extraction system is ready to use! 🎉

