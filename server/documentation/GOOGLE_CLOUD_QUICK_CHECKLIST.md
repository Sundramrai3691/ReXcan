# Google Cloud Setup - Quick Checklist

Use this checklist to track your progress through the Google Cloud setup.

## 📋 Pre-Setup

- [ ] Have a Google account ready
- [ ] Have access to Google Cloud Console
- [ ] Decide on a project name (e.g., `rexcan-email-processor`)

---

## Part 1: Project Setup

- [ ] Go to https://console.cloud.google.com/
- [ ] Create new project
- [ ] Note your **Project ID** (e.g., `rexcan-email-processor-123456`)
- [ ] Select the project

**Your Project ID**: `_________________________`

---

## Part 2: Enable APIs

- [ ] Enable **Cloud Pub/Sub API**
  - Go to: APIs & Services > Library
  - Search: "Cloud Pub/Sub API"
  - Click "Enable"
  
- [ ] Enable **Gmail API**
  - Go to: APIs & Services > Library
  - Search: "Gmail API"
  - Click "Enable"

---

## Part 3: Service Account (for Pub/Sub)

- [ ] Go to: IAM & Admin > Service Accounts
- [ ] Create service account:
  - Name: `pubsub-email-processor`
  - Role: **Pub/Sub Admin**
- [ ] Create JSON key:
  - Click on service account > Keys tab
  - Add Key > Create new key > JSON
  - **Download the file**
- [ ] Save key file location: `_________________________`
- [ ] Set environment variable:
  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
  ```

---

## Part 4: OAuth Consent Screen (for Gmail)

- [ ] Go to: APIs & Services > OAuth consent screen
- [ ] Configure:
  - User Type: **External**
  - App name: `ReXcan Email Processor`
  - Support email: Your email
  - Scopes: Add `gmail.readonly`
  - Test users: Add your email
- [ ] Save and continue through all steps

---

## Part 5: OAuth Credentials (for Gmail)

- [ ] Go to: APIs & Services > Credentials
- [ ] Create OAuth Client ID:
  - Type: **Desktop app**
  - Name: `ReXcan Desktop Client`
- [ ] **Copy and save**:
  - Client ID: `_________________________`
  - Client Secret: `_________________________`

---

## Part 6: Get Refresh Token

- [ ] Go to: https://developers.google.com/oauthplayground/
- [ ] Click gear icon (⚙️) > Use your own OAuth credentials
- [ ] Enter Client ID and Client Secret
- [ ] Select scope: `gmail.readonly`
- [ ] Click "Authorize APIs"
- [ ] Sign in and allow permissions
- [ ] Click "Exchange authorization code for tokens"
- [ ] **Copy Refresh Token**: `_________________________`

---

## Part 7: Configure Application

- [ ] Update `.env.development` or `.env.production`:
  ```bash
  PUBSUB_PROJECT_ID=your-project-id-here
  GMAIL_CLIENT_ID=your-client-id-here
  GMAIL_CLIENT_SECRET=your-client-secret-here
  GMAIL_REFRESH_TOKEN=your-refresh-token-here
  ```

- [ ] Verify `GOOGLE_APPLICATION_CREDENTIALS` is set:
  ```bash
  echo $GOOGLE_APPLICATION_CREDENTIALS
  ```

---

## Part 8: Test

- [ ] Start server: `npm run dev`
- [ ] Check logs for:
  - ✅ "Pub/Sub client initialized"
  - ✅ "Gmail service initialized"
- [ ] Test status endpoint:
  ```bash
  curl -H "Authorization: Bearer TOKEN" \
    http://localhost:3000/api/v1/email/status
  ```

---

## 🎉 Done!

If all checkboxes are checked, your Google Cloud setup is complete!

**Need help?** See the detailed guide: `GOOGLE_CLOUD_SETUP_GUIDE.md`

