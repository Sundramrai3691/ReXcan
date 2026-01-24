# InvoiceAce - Startup Commands Guide

## 🚀 Quick Start (All Services)

### Prerequisites
- Python 3.10+ installed
- Node.js 18+ installed
- MongoDB running
- Redis running
- All dependencies installed

---

## 📋 Startup Commands

### Option 1: Manual Start (Separate Terminals)

Open **4 separate terminal windows/tabs**:

#### Terminal 1: Python FastAPI Backend
```bash
cd python
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Terminal 2: Node.js Express Backend
```bash
cd server
npm run dev
```
**Runs on:** `http://localhost:3000` (or port in `.env`)

#### Terminal 3: Document Processing Workers
```bash
cd server
npm run worker:dev
```

#### Terminal 4: React Frontend
```bash
cd client
npm run dev
```
**Runs on:** `http://localhost:5173` (Vite default)

---

### Option 2: Using a Process Manager (Recommended for Production)

#### Using `concurrently` (Install first: `npm install -g concurrently`)

Create a `start-all.sh` script:

```bash
#!/bin/bash

# Start all services concurrently
concurrently \
  --names "PYTHON,API,WORKER,FRONTEND" \
  --prefix-colors "blue,green,yellow,cyan" \
  "cd python && source venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" \
  "cd server && npm run dev" \
  "cd server && npm run worker:dev" \
  "cd client && npm run dev"
```

Make it executable:
```bash
chmod +x start-all.sh
./start-all.sh
```

---

### Option 3: Using PM2 (Production)

Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'python-api',
      script: 'uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8000',
      cwd: './python',
      interpreter: 'python3',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'node-api',
      script: 'npm',
      args: 'run dev',
      cwd: './server',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'worker',
      script: 'npm',
      args: 'run worker:dev',
      cwd: './server',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'frontend',
      script: 'npm',
      args: 'run dev',
      cwd: './client',
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
};
```

Start all:
```bash
pm2 start ecosystem.config.js
pm2 logs
```

Stop all:
```bash
pm2 stop all
pm2 delete all
```

---

## 🔧 Individual Service Commands

### Python FastAPI Backend

**Development:**
```bash
cd python
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Production:**
```bash
cd python
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**With custom host/port:**
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

### Node.js Express Backend

**Development (with auto-reload):**
```bash
cd server
npm run dev
```

**Production:**
```bash
cd server
npm run build
npm start
```

**Custom port (set in `.env`):**
```bash
PORT=3000 npm run dev
```

---

### Document Processing Workers

**Development (with auto-reload):**
```bash
cd server
npm run worker:dev
```

**Production:**
```bash
cd server
npm run worker
```

**Multiple workers:**
```bash
# Run multiple instances for parallel processing
npm run worker:dev &
npm run worker:dev &
npm run worker:dev &
```

---

### React Frontend

**Development:**
```bash
cd client
npm run dev
```

**Production build:**
```bash
cd client
npm run build
npm run preview
```

**Custom port:**
```bash
PORT=3001 npm run dev
```

---

## 🗄️ Required Services

### MongoDB
```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Redis
```bash
# macOS (Homebrew)
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 --name redis redis:latest
```

---

## ✅ Health Checks

After starting all services, verify they're running:

### Python API
```bash
curl http://localhost:8000/health
```

### Node.js API
```bash
curl http://localhost:3000/health
```

### Frontend
Open browser: `http://localhost:5173`

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :8000  # Python
lsof -i :3000  # Node.js
lsof -i :5173  # Frontend

# Kill process
kill -9 <PID>
```

### Python Virtual Environment
```bash
cd python
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Node.js Dependencies
```bash
# Backend
cd server
npm install

# Frontend
cd client
npm install
```

### Environment Variables
Ensure `.env` files are configured:
- `server/.env` - Node.js backend config
- `python/.env` - Python API config
- `client/.env` - Frontend config (if needed)

---

## 📝 Service URLs

| Service | URL | Port |
|---------|-----|------|
| Python FastAPI | http://localhost:8000 | 8000 |
| Node.js API | http://localhost:3000 | 3000 |
| React Frontend | http://localhost:5173 | 5173 |
| MongoDB | mongodb://localhost:27017 | 27017 |
| Redis | redis://localhost:6379 | 6379 |

---

## 🎯 Quick Start Script

Create `start.sh`:

```bash
#!/bin/bash

echo "🚀 Starting InvoiceAce Services..."

# Check if services are running
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB not running. Please start it first."
    exit 1
fi

if ! pgrep -x "redis-server" > /dev/null; then
    echo "⚠️  Redis not running. Please start it first."
    exit 1
fi

# Start Python API
echo "📦 Starting Python FastAPI..."
cd python
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!
cd ..

# Start Node.js API
echo "📦 Starting Node.js API..."
cd server
npm run dev &
NODE_PID=$!
cd ..

# Start Workers
echo "👷 Starting Workers..."
cd server
npm run worker:dev &
WORKER_PID=$!
cd ..

# Start Frontend
echo "🎨 Starting Frontend..."
cd client
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ All services started!"
echo "Python API PID: $PYTHON_PID"
echo "Node.js API PID: $NODE_PID"
echo "Worker PID: $WORKER_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $PYTHON_PID $NODE_PID $WORKER_PID $FRONTEND_PID; exit" INT
wait
```

Make executable:
```bash
chmod +x start.sh
./start.sh
```

---

## 📚 Additional Notes

- **Development**: Use `--reload` flags for auto-reload on file changes
- **Production**: Remove `--reload` and use process managers (PM2, systemd, etc.)
- **Workers**: Can run multiple instances for parallel processing
- **Logs**: Check console output for each service
- **Environment**: Ensure all `.env` files are properly configured

