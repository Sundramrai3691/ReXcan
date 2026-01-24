# 🚀 Quick Start Commands

## Start All Services (4 Terminals)

### Terminal 1: Python FastAPI Backend
```bash
cd python
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 2: Node.js Express Backend
```bash
cd server
npm run dev
```

### Terminal 3: Document Processing Workers
```bash
cd server
npm run worker:dev
```

### Terminal 4: React Frontend
```bash
cd client
npm run dev
```

---

## Or Use the Start Script

```bash
# Make executable (first time only)
chmod +x start-all.sh

# Run all services
./start-all.sh
```

---

## Service URLs

- **Python API**: http://localhost:8000
- **Node.js API**: http://localhost:3000  
- **Frontend**: http://localhost:5173

---

## Prerequisites

Make sure these are running:
- **MongoDB**: `brew services start mongodb-community` (or your method)
- **Redis**: `brew services start redis` (or your method)

---

## Stop All Services

Press `Ctrl+C` in each terminal, or:

```bash
# Kill all Node.js processes
pkill -f "npm run dev"
pkill -f "npm run worker"

# Kill Python process
pkill -f "uvicorn"
```
