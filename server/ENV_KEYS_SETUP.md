# Environment Variables Setup

## API Keys Configuration

The following API keys have been configured in the environment configuration system:

- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`

## Setup Instructions

### Development Environment

Create a `.env.development` file in the `server/` directory with the following content:

```env
# Development Environment Configuration

# Application
NODE_ENV=development
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/resxcan
MONGODB_URI_TEST=mongodb://localhost:27017/resxcan_test

# Authentication
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRE=7d

# CORS & Security
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=900000

# Logging
LOG_LEVEL=debug

# Redis (Queue System)
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=  # Leave empty if not required

# Storage
STORAGE_BASE_PATH=storage

# API Keys
# Replace these with your actual API keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

### Production Environment

Create a `.env.production` file in the `server/` directory with the following content:

```env
# Production Environment Configuration

# Application
NODE_ENV=production
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/resxcan
MONGODB_URI_TEST=mongodb://localhost:27017/resxcan_test

# Authentication
JWT_SECRET=production-secret-key-change-this
JWT_EXPIRE=7d

# CORS & Security
CORS_ORIGIN=https://your-production-domain.com
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# Logging
LOG_LEVEL=info

# Redis (Queue System)
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=  # Set your production Redis password

# Storage
STORAGE_BASE_PATH=storage

# API Keys
# Replace these with your actual API keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

## What Was Implemented

1. **Environment Configuration**: Updated `src/config/env.ts` to include API keys configuration
2. **Groq Service**: Created `src/services/groq.service.ts` with functions to extract invoice data from images and PDFs
3. **Document Model**: Updated to store extracted invoice data including:
   - Invoice number, vendor name, dates
   - Total amount and currency
   - Line items
   - Tax information
4. **Document Worker**: Updated to automatically extract invoice data using Groq API when documents are processed

## How It Works

When a document (image or PDF) is uploaded:

1. The document is added to the processing queue
2. The worker picks up the job and calls the Groq API
3. Groq's vision model analyzes the document and extracts invoice data
4. The extracted data is stored in the document's `extractedData` field
5. The document status is updated to "processed"

The Groq API uses the `llama-3.2-90b-vision-preview` model which supports vision capabilities for extracting structured data from images and PDFs.
