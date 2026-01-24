# Environment Configuration Setup

This project uses environment-specific configuration files for different deployment environments.

## Environment Files

1. **`.env.example`** - Template file showing all required environment variables (committed to git)
2. **`.env.development`** - Development environment configuration (not committed, use localhost MongoDB)
3. **`.env.production`** - Production environment configuration (not committed, use production MongoDB)

## Prerequisites

Before setting up the environment, ensure you have the following services running:

### MongoDB Setup

1. **Install MongoDB** (if not already installed):
   ```bash
   # macOS (using Homebrew)
   brew tap mongodb/brew
   brew install mongodb-community
   
   # Ubuntu/Debian
   sudo apt-get install mongodb
   
   # Or download from: https://www.mongodb.com/try/download/community
   ```

2. **Start MongoDB**:
   ```bash
   # macOS (using Homebrew)
   brew services start mongodb-community
   
   # Or start MongoDB manually
   mongod
   
   # Ubuntu/Debian
   sudo systemctl start mongod
   ```

3. **Verify MongoDB is running**:
   ```bash
   mongosh
   # Or older versions: mongo
   # If connection succeeds, MongoDB is running
   ```

### Redis Setup

Redis is required for the queue system (document processing).

1. **Install Redis** (if not already installed):
   ```bash
   # macOS (using Homebrew)
   brew install redis
   
   # Ubuntu/Debian
   sudo apt-get install redis-server
   
   # Or download from: https://redis.io/download
   ```

2. **Start Redis**:
   ```bash
   # macOS (using Homebrew)
   brew services start redis
   
   # Or start Redis manually
   redis-server
   
   # Ubuntu/Debian
   sudo systemctl start redis-server
   ```

3. **Verify Redis is running**:
   ```bash
   redis-cli ping
   # Should return: PONG
   
   # Check Redis status
   redis-cli info server
   ```

4. **Test Redis connection** (optional):
   ```bash
   redis-cli
   > SET test "Hello Redis"
   > GET test
   # Should return: "Hello Redis"
   > exit
   ```

## Setup Instructions

### Development

1. Copy the development environment file:
   ```bash
   cp .env.development .env
   ```
   
   Or simply use `.env.development` directly (the app will auto-load it in development mode).

2. Ensure MongoDB is running locally (see MongoDB Setup above).

3. Ensure Redis is running locally (see Redis Setup above).

4. The development config uses:
   - MongoDB: `mongodb://localhost:27017/resxcan`
   - Redis: `localhost:6379` (no password)
   - CORS: `http://localhost:5173` (Vite dev server)
   - Log Level: `debug` (more verbose)
   - Rate Limit: 1000 requests per 15 minutes (more lenient)

### Production

1. Copy the production environment file:
   ```bash
   cp .env.production .env
   ```

2. **IMPORTANT**: Update the following values:
   - `MONGODB_URI` - Your production MongoDB connection string
   - `JWT_SECRET` - Generate a strong random secret (use `openssl rand -base64 32`)
   - `CORS_ORIGIN` - Your production frontend URL
   - `PORT` - Production port (usually 3000 or set by your hosting provider)
   - `REDIS_HOST` - Your production Redis host
   - `REDIS_PORT` - Your production Redis port
   - `REDIS_PASSWORD` - Your production Redis password (if required)

3. **Set up Production Redis**:
   - Use a managed Redis service (AWS ElastiCache, Redis Cloud, etc.) for production
   - Or set up Redis with authentication and proper security
   - Ensure Redis is accessible from your application servers

4. The production config uses:
   - Stricter rate limiting (100 requests per 15 minutes)
   - Less verbose logging (`info` level)
   - Production security settings

## How It Works

The application automatically loads the appropriate environment file based on `NODE_ENV`:

- `NODE_ENV=development` → loads `.env.development`
- `NODE_ENV=production` → loads `.env.production`
- If `.env` exists, it takes precedence (useful for local overrides)

## Environment Variables

All environment variables are documented in `.env.example`. Key variables:

### Application
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port

### Database
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_URI_TEST` - MongoDB connection string for tests

### Authentication
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_EXPIRE` - JWT token expiration time

### CORS & Security
- `CORS_ORIGIN` - Allowed CORS origin
- `RATE_LIMIT_MAX_REQUESTS` - Maximum requests per window
- `RATE_LIMIT_WINDOW_MS` - Rate limit window in milliseconds

### Logging
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

### Queue System (Redis)
- `REDIS_HOST` - Redis server host
- `REDIS_PORT` - Redis server port
- `REDIS_PASSWORD` - Redis password (optional, leave empty if not required)

### Storage
- `STORAGE_BASE_PATH` - Base path for file storage (default: `storage`)

## Running the Application

### Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Or using tsx directly
npm run dev:tsx
```

### Start the Worker (in a separate terminal)

The worker processes documents from the queue. Run it separately:

```bash
# Production mode
npm run worker

# Development mode (with auto-reload)
npm run worker:dev
```

**Note**: You need both the server and worker running for the complete system to work:
- Server handles API requests and file uploads
- Worker processes uploaded documents from the queue

## Troubleshooting

### Redis Connection Issues

If you see Redis connection errors:

1. **Check if Redis is running**:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. **Check Redis port**:
   ```bash
   redis-cli -p 6379 ping
   ```

3. **Check Redis logs** (if running as service):
   ```bash
   # macOS
   brew services list
   tail -f /usr/local/var/log/redis.log
   ```

4. **Restart Redis**:
   ```bash
   # macOS
   brew services restart redis
   
   # Ubuntu/Debian
   sudo systemctl restart redis-server
   ```

### MongoDB Connection Issues

1. **Check if MongoDB is running**:
   ```bash
   mongosh
   # Or: mongo
   ```

2. **Check MongoDB port** (default: 27017)

3. **Check MongoDB logs** for errors

### Storage Directory Issues

The application automatically creates storage directories on startup. If you see permission errors:

```bash
# Ensure the storage directory is writable
chmod -R 755 storage/
```

## Security Notes

- Never commit `.env`, `.env.development`, or `.env.production` files
- Always use strong, random secrets in production
- Rotate secrets regularly
- Use environment variables provided by your hosting platform when possible
- In production, use managed Redis services with proper authentication
- Ensure Redis is not exposed to the public internet without authentication

