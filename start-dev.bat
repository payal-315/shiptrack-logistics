@echo off
REM Logistics Shipment Tracking System - Quick Start Script
REM This script starts both backend and frontend servers

echo.
echo ========================================
echo  ShipTrack - Full Project Integration
echo ========================================
echo.

REM Start MongoDB message
echo Ensuring MongoDB is running on port 27017...
echo To start MongoDB:
echo   - Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest
echo   - Or download from: https://www.mongodb.com/try/download/community
echo.

REM Start Backend
echo Starting Backend Server...
start "Backend - ShipTrack" cmd /k "cd backend && npm run dev"

REM Wait for backend to start
timeout /t 3 /nobreak

REM Start Frontend
echo Starting Frontend Server...
start "Frontend - ShipTrack" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo  Servers Starting...
echo ========================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Customer Login:    http://localhost:5173
echo Operations Login:  http://localhost:5173/operations-login
echo.
echo No default operations account is configured.
echo.
echo Press Ctrl+C in either window to stop the servers
echo ========================================
