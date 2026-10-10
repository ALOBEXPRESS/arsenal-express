#!/bin/bash

# Backend Setup Script
# Configures Python environment and installs dependencies

set -e  # Exit on error

echo "================================"
echo "Backend Setup Script"
echo "================================"

# Check Python version
echo ""
echo "Checking Python version..."
python --version || python3 --version

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo ""
    echo "Creating virtual environment..."
    python -m venv venv || python3 -m venv venv
else
    echo ""
    echo "Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate || source venv/Scripts/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your credentials!"
else
    echo ""
    echo ".env file already exists"
fi

# Check Redis connection
echo ""
echo "Checking Redis connection..."
python -c "import redis; r = redis.Redis(host='localhost', port=6379); r.ping(); print('✅ Redis is running!')" 2>/dev/null || echo "⚠️  Redis is not running! Please start Redis before running the worker."

# Check FFmpeg installation
echo ""
echo "Checking FFmpeg installation..."
ffmpeg -version > /dev/null 2>&1 && echo "✅ FFmpeg is installed!" || echo "⚠️  FFmpeg is not installed! Please install FFmpeg."

echo ""
echo "================================"
echo "✅ Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Supabase credentials"
echo "2. Start Redis: redis-server (or docker run -d -p 6379:6379 redis)"
echo "3. Start FastAPI: python -m app.main"
echo "4. Start Celery Worker: celery -A app.worker:celery_app worker --loglevel=info"
echo ""
