# Part 3: Create Service Account for Pub/Sub - Step by Step

You're currently on the IAM page. Follow these steps to create a service account:

## Step 1: Navigate to Service Accounts

1. In the **left sidebar** (where you see "IAM and admin / IAM"), look for **"Service accounts"**
2. Click on **"Service accounts"** (it should be in the list below "IAM")

## Step 2: Create New Service Account

1. You should see a page titled "Service accounts"
2. Click the **"+ CREATE SERVICE ACCOUNT"** button at the top
3. Fill in the details:
   - **Service account name**: `pubsub-email-processor`
   - **Service account ID**: Will auto-fill as `pubsub-email-processor` (you can keep this)
   - **Description**: `Service account for processing email invoices via Pub/Sub`
4. Click **"CREATE AND CONTINUE"**

## Step 3: Grant Permissions

1. In the **"Grant this service account access to project"** section:
   - Click the **"Select a role"** dropdown
   - Type `Pub/Sub` in the search box
   - You'll see several options - select **"Pub/Sub Admin"**
     - This role gives full access to Pub/Sub (create topics, subscriptions, publish/subscribe)
2. Click **"CONTINUE"**

## Step 4: Grant User Access (Skip This)

1. This step is optional - you can skip it
2. Click **"DONE"** to finish creating the service account

## Step 5: Create and Download JSON Key

1. You should now see your service account in the list: `pubsub-email-processor`
2. Click on the service account name (`pubsub-email-processor`)
3. You'll see several tabs at the top: **"DETAILS"**, **"PERMISSIONS"**, **"KEYS"**
4. Click on the **"KEYS"** tab
5. Click **"ADD KEY"** button
6. Select **"Create new key"**
7. A dialog will appear - select **"JSON"** as the key type
8. Click **"CREATE"**
9. **Important**: A JSON file will automatically download to your computer
   - The file will be named something like: `rexcan-477507-xxxxx.json`
   - Save this file in a secure location (e.g., `~/gcp-keys/` or `~/Documents/gcp-keys/`)
   - **DO NOT** commit this file to git - it contains sensitive credentials
   - Note the full path to this file - you'll need it next!

## Step 6: Set Environment Variable

After downloading the key file, set the environment variable:

**On macOS (which you're using):**

1. Open Terminal
2. Create a directory for your keys (if it doesn't exist):
   ```bash
   mkdir -p ~/gcp-keys
   ```
3. Move the downloaded JSON file to this directory (if needed):
   ```bash
   mv ~/Downloads/rexcan-477507-*.json ~/gcp-keys/pubsub-service-account.json
   ```
4. Set the environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/gcp-keys/pubsub-service-account.json"
   ```
5. Verify it's set:
   ```bash
   echo $GOOGLE_APPLICATION_CREDENTIALS
   ```
   Should show: `/Users/shauryaagrawal/gcp-keys/pubsub-service-account.json`

6. **Make it permanent** (so it persists after closing terminal):
   ```bash
   echo 'export GOOGLE_APPLICATION_CREDENTIALS="$HOME/gcp-keys/pubsub-service-account.json"' >> ~/.zshrc
   source ~/.zshrc
   ```

## Step 7: Update Your .env File

Update your `.env.development` file with your project ID:

```bash
# In your server directory
cd /Users/shauryaagrawal/Desktop/ReXcan/server
```

Edit `.env.development` and set:
```bash
PUBSUB_PROJECT_ID=rexcan-477507
```

## ✅ Checklist for Part 3

- [ ] Service account created: `pubsub-email-processor`
- [ ] Service account has "Pub/Sub Admin" role
- [ ] JSON key file downloaded
- [ ] JSON key file saved in secure location
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` environment variable set
- [ ] Verified environment variable is set correctly
- [ ] Updated `.env.development` with `PUBSUB_PROJECT_ID=rexcan-477507`

## Next: Part 4 - OAuth Consent Screen

Once you've completed Part 3, proceed to **Part 4: Set Up OAuth Consent Screen** in the main guide.

This is needed for Gmail API access.

---

**Need help?** If you get stuck at any step, let me know what you see on your screen!

