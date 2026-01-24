#!/bin/bash

echo "🚀 Starting InvoiceAce Services..."
echo ""

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null 2>&1; then
    echo "⚠️  MongoDB not running. Please start it first:"
    echo "   brew services start mongodb-community"
    echo ""
fi

# Check if Redis is running
if ! pgrep -x "redis-server" > /dev/null 2>&1; then
    echo "⚠️  Redis not running. Please start it first:"
    echo "   brew services start redis"
    echo ""
fi

# Start Python API
echo "📦 Starting Python FastAPI (port 8000)..."
cd python
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > ../logs/python-api.log 2>&1 &
PYTHON_PID=$!
cd ..
echo "   Python API PID: $PYTHON_PID"

# Start Node.js API
echo "📦 Starting Node.js API (port 3000)..."
cd server
npm run dev > ../logs/node-api.log 2>&1 &
NODE_PID=$!
cd ..
echo "   Node.js API PID: $NODE_PID"

# Start Workers
echo "👷 Starting Document Processing Workers..."
cd server
npm run worker:dev > ../logs/worker.log 2>&1 &
WORKER_PID=$!
cd ..
echo "   Worker PID: $WORKER_PID"

# Wait a bit for services to start
sleep 3

# Start Frontend
echo "🎨 Starting React Frontend (port 5173)..."
cd client
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo "   Frontend PID: $FRONTEND_PID"

# Create logs directory if it doesn't exist
mkdir -p logs

echo ""
echo "✅ All services started!"
echo ""
echo "Service URLs:"
echo "  Python API:    http://localhost:8000"
echo "  Node.js API:   http://localhost:3000"
echo "  Frontend:      http://localhost:5173"
echo ""
echo "Logs are in the 'logs' directory"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    kill $PYTHON_PID $NODE_PID $WORKER_PID $FRONTEND_PID 2>/dev/null
    echo "✅ All services stopped"
    exit
}

# Trap Ctrl+C
trap cleanup INT

# Wait for all processes
wait
