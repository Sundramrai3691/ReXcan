# Redis Setup Guide

Redis is required for the document processing queue system. This guide will help you set up and verify Redis.

## Quick Start

### 1. Check if Redis is Already Installed

```bash
redis-cli --version
```

If Redis is installed, you'll see the version number. If not, proceed to installation.

### 2. Install Redis

#### macOS (using Homebrew)

```bash
# Install Redis
brew install redis

# Start Redis as a service (auto-starts on boot)
brew services start redis

# Or start Redis manually (one-time)
redis-server
```

#### Ubuntu/Debian

```bash
# Update package list
sudo apt-get update

# Install Redis
sudo apt-get install redis-server

# Start Redis service
sudo systemctl start redis-server

# Enable Redis to start on boot
sudo systemctl enable redis-server
```

#### Windows

1. Download Redis from: https://github.com/microsoftarchive/redis/releases
2. Or use WSL (Windows Subsystem for Linux) and follow Ubuntu instructions
3. Or use Docker: `docker run -d -p 6379:6379 redis:latest`

#### Using Docker (Any Platform)

```bash
# Run Redis in a Docker container
docker run -d -p 6379:6379 --name redis redis:latest

# Check if it's running
docker ps | grep redis
```

### 3. Verify Redis is Running

```bash
# Test Redis connection
redis-cli ping
# Expected output: PONG

# If Redis is running on a different port
redis-cli -p 6379 ping
```

### 4. Test Redis Functionality

```bash
# Open Redis CLI
redis-cli

# Test commands
> SET test "Hello Redis"
OK
> GET test
"Hello Redis"
> DEL test
(integer) 1
> exit
```

## Configuration

### Default Redis Configuration

- **Host**: `localhost`
- **Port**: `6379`
- **Password**: None (by default)

### Setting a Redis Password (Optional but Recommended for Production)

1. **Edit Redis configuration file**:
   ```bash
   # macOS (Homebrew)
   nano /usr/local/etc/redis.conf
   
   # Ubuntu/Debian
   sudo nano /etc/redis/redis.conf
   ```

2. **Find and uncomment the `requirepass` line**:
   ```
   requirepass your-strong-password-here
   ```

3. **Restart Redis**:
   ```bash
   # macOS
   brew services restart redis
   
   # Ubuntu/Debian
   sudo systemctl restart redis-server
   ```

4. **Test with password**:
   ```bash
   redis-cli -a your-strong-password-here ping
   ```

5. **Update your `.env` file**:
   ```
   REDIS_PASSWORD=your-strong-password-here
   ```

## Troubleshooting

### Redis Not Starting

1. **Check if port 6379 is already in use**:
   ```bash
   # macOS/Linux
   lsof -i :6379
   
   # Or
   netstat -an | grep 6379
   ```

2. **Check Redis logs**:
   ```bash
   # macOS (Homebrew)
   tail -f /usr/local/var/log/redis.log
   
   # Ubuntu/Debian
   sudo tail -f /var/log/redis/redis-server.log
   ```

3. **Try starting Redis manually to see errors**:
   ```bash
   redis-server
   ```

### Connection Refused Errors

If you see "Connection refused" errors:

1. **Verify Redis is running**:
   ```bash
   redis-cli ping
   ```

2. **Check Redis is listening on the correct port**:
   ```bash
   # macOS/Linux
   netstat -an | grep 6379
   ```

3. **Check firewall settings** (if connecting from remote):
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 6379
   ```

### Permission Denied Errors

```bash
# Check Redis data directory permissions
# macOS (Homebrew)
ls -la /usr/local/var/db/redis/

# Ubuntu/Debian
ls -la /var/lib/redis/
```

## Production Recommendations

1. **Use a Managed Redis Service**:
   - AWS ElastiCache
   - Redis Cloud
   - Azure Cache for Redis
   - Google Cloud Memorystore

2. **Enable Authentication**:
   - Always set a strong password in production
   - Use Redis ACLs for fine-grained access control

3. **Network Security**:
   - Don't expose Redis to the public internet
   - Use VPC/private networks
   - Enable TLS/SSL for encrypted connections

4. **Monitoring**:
   - Set up Redis monitoring and alerts
   - Monitor memory usage
   - Set up automatic backups

5. **High Availability**:
   - Use Redis Sentinel for high availability
   - Or use Redis Cluster for horizontal scaling

## Useful Redis Commands

```bash
# Check Redis info
redis-cli info

# Check memory usage
redis-cli info memory

# Check connected clients
redis-cli client list

# Monitor Redis commands in real-time
redis-cli monitor

# Flush all data (use with caution!)
redis-cli flushall

# Check Redis version
redis-cli --version
```

## Integration with ReXcan

Once Redis is running, your ReXcan application will:

1. **Queue System**: Use Redis to queue document processing jobs
2. **Worker Process**: Workers will connect to Redis to pick up jobs
3. **Job Tracking**: Track job status and retries in Redis

Make sure your `.env` file has the correct Redis configuration:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password
```

## Next Steps

After Redis is set up:

1. ✅ Verify Redis is running: `redis-cli ping`
2. ✅ Update your `.env` file with Redis configuration
3. ✅ Start the server: `npm run dev`
4. ✅ Start the worker: `npm run worker` (in a separate terminal)
5. ✅ Test file upload to verify the queue system works

