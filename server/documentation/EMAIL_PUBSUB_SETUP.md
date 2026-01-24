# Email Invoice Extraction with Pub/Sub Setup

This document describes how to set up email invoice extraction using Google Cloud Pub/Sub.

## Overview

The system can extract invoices from emails and process them through the document processing pipeline using Google Cloud Pub/Sub for message queuing.

## Architecture

1. **Email Service**: Fetches emails (Gmail API or IMAP) and extracts invoice attachments
2. **Pub/Sub Publisher**: Publishes email messages with attachments to Google Cloud Pub/Sub
3. **Pub/Sub Subscriber Worker**: Subscribes to Pub/Sub messages and processes email attachments
4. **Document Processing**: Email attachments are processed through the existing document processing queue

## Setup

### 1. Google Cloud Pub/Sub Setup

1. Create a Google Cloud Project (if you don't have one)
2. Enable the Pub/Sub API
3. Create a service account with Pub/Sub permissions
4. Download the service account JSON key file
5. Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of the key file

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

### 2. Environment Variables

Add the following to your `.env` file:

```bash
# Pub/Sub Configuration
PUBSUB_PROJECT_ID=your-gcp-project-id
PUBSUB_TOPIC_NAME=email-invoices
PUBSUB_SUBSCRIPTION_NAME=email-invoices-sub

# Email Configuration
EMAIL_PROVIDER=gmail  # or 'imap'

# Gmail API Configuration (if using Gmail)
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-client-secret
GMAIL_REFRESH_TOKEN=your-gmail-refresh-token

# IMAP Configuration (if using IMAP)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@example.com
IMAP_PASSWORD=your-app-password
IMAP_TLS=true

# Email Polling Interval (in milliseconds)
EMAIL_POLL_INTERVAL=60000  # Default: 1 minute
```

### 3. Gmail API Setup (if using Gmail)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop app" as the application type
   - Download the credentials JSON
5. Get a refresh token:
   - Use the OAuth 2.0 Playground or a script to get a refresh token
   - The refresh token allows the app to access Gmail without user interaction

### 4. IMAP Setup (if using IMAP)

For Gmail with IMAP:
1. Enable 2-factor authentication
2. Generate an App Password:
   - Go to Google Account settings
   - Security > 2-Step Verification > App passwords
   - Generate a password for "Mail"
3. Use the app password in `IMAP_PASSWORD`

## Usage

### Manual Email Fetching

You can manually trigger email fetching via the API:

```bash
POST /api/v1/email/fetch?maxResults=10
Authorization: Bearer <token>
```

This will:
1. Fetch emails with invoice attachments
2. Publish them to Pub/Sub
3. The Pub/Sub worker will process them automatically

### Automatic Email Polling

The email polling service can be started to automatically poll emails at configured intervals. This can be integrated into your worker process or run as a separate service.

### Check Email Service Status

```bash
GET /api/v1/email/status
Authorization: Bearer <token>
```

## How It Works

1. **Email Fetching**: The email service fetches emails with attachments (PDFs or images)
2. **Message Publishing**: Each email with invoice attachments is published to Pub/Sub as a message
3. **Message Processing**: The Pub/Sub subscriber worker receives messages and:
   - Extracts attachments from the message
   - Saves attachments to storage
   - Creates document records
   - Adds documents to the processing queue
4. **Document Processing**: Documents are processed through the existing pipeline (OCR, extraction, etc.)

## Message Format

Pub/Sub messages contain:

```json
{
  "emailId": "unique-email-id",
  "messageId": "email-message-id",
  "from": "sender@example.com",
  "subject": "Invoice #12345",
  "receivedAt": "2024-01-01T00:00:00Z",
  "attachments": [
    {
      "filename": "invoice.pdf",
      "contentType": "application/pdf",
      "size": 12345,
      "data": "base64-encoded-file-data"
    }
  ],
  "userId": "optional-user-id"
}
```

## Troubleshooting

### Pub/Sub Not Initialized

- Check that `PUBSUB_PROJECT_ID` is set
- Verify `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account key
- Ensure the service account has Pub/Sub permissions

### Email Service Not Initialized

- For Gmail: Verify `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` are set
- For IMAP: Verify `IMAP_USER` and `IMAP_PASSWORD` are set
- Check that `EMAIL_PROVIDER` is set to either 'gmail' or 'imap'

### Messages Not Being Processed

- Check that the Pub/Sub subscriber worker is running
- Verify the subscription exists in Google Cloud Console
- Check worker logs for errors

## Security Considerations

1. **Credentials**: Store service account keys and OAuth tokens securely
2. **Permissions**: Use least-privilege access for service accounts
3. **Email Access**: Only grant necessary email access permissions
4. **Data**: Email attachments are stored in base64 in Pub/Sub messages - consider encryption for sensitive data

## Future Enhancements

- Webhook support for real-time email notifications (Gmail push notifications)
- Email filtering rules (sender whitelist, subject patterns)
- Automatic email labeling/folder organization
- Support for multiple email accounts
- Email deduplication

