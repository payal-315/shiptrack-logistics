#!/bin/bash

# Logistics Shipment Tracking System - Quick Start Script
# This script starts both backend and frontend servers

echo ""
echo "========================================"
echo "  ShipTrack - Full Project Integration"
echo "========================================"
echo ""

# Check if MongoDB is running
echo "Ensuring MongoDB is running on port 27017..."
echo "To start MongoDB:"
echo "  - Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest"
echo "  - Or download from: https://www.mongodb.com/try/download/community"
echo ""

# Start Backend
echo "Starting Backend Server..."
cd backend
npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start Frontend
echo "Starting Frontend Server..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  Servers Starting..."
echo "========================================"
echo ""
echo "Backend:  http://localhost:5000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Customer Login:    http://localhost:5173"
echo "Operations Login:  http://localhost:5173/operations-login"
echo ""
echo "No default operations account is configured."
echo ""
echo "Press Ctrl+C to stop the servers"
echo "========================================"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
