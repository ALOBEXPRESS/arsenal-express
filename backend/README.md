# 🎬 Video Assembler Backend

Backend API e Worker para processar renders de vídeo em background.

## 📋 Stack

- **FastAPI** - API REST
- **Celery** - Task queue
- **Redis** - Message broker
- **FFmpeg** - Video processing
- **Supabase** - Database + Storage

---

## 🚀 Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Install Redis

**Windows (com WSL):**
```bash
wsl -d Ubuntu
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Docker:**
```bash
docker run -d -p 6379:6379 redis:alpine
```

### 3. Install FFmpeg

**Windows:**
```bash
# Download from https://ffmpeg.org/download.html
# Add to PATH
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

Required variables:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
REDIS_URL=redis://localhost:6379/0
```

---

## 🏃 Running

### Development

**Terminal 1 - API Server:**
```bash
cd backend
python -m app.main
```

**Terminal 2 - Celery Worker:**
```bash
cd backend
celery -A app.worker:celery_app worker --loglevel=info
```

**Terminal 3 - Celery Flower (opcional):**
```bash
celery -A app.worker:celery_app flower
# http://localhost:5555
```

### Production

```bash
# API
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Worker
celery -A app.worker:celery_app worker --loglevel=info --concurrency=2
```

---

## 📡 API Endpoints

### Health Check
```bash
GET /health
```

### Start Render
```bash
POST /api/renders/start
{
  "render_id": "uuid",
  "project_id": "uuid"
}
```

### Get Status
```bash
GET /api/renders/{render_id}/status
```

### Cancel Render
```bash
POST /api/renders/{render_id}/cancel
```

---

## 🔧 Architecture

```
┌─────────────┐         ┌─────────────┐
│  Next.js    │────────▶│   FastAPI   │
│  Frontend   │         │   API       │
└─────────────┘         └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │    Redis    │
                        │   Queue     │
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │   Celery    │
                        │   Worker    │
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │   FFmpeg    │
                        │  Processing │
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │  Supabase   │
                        │   Storage   │
                        └─────────────┘
```

---

## 📝 Worker Flow

1. **Receive Task**
   - Celery worker picks up task from Redis queue
   - Updates render status to "processing"

2. **Fetch Data**
   - Query Supabase for render + scenes + assets
   - Parse FFmpeg command and scenes JSON

3. **Download Assets**
   - Download videos/images from Supabase Storage
   - Download audios from Supabase Storage
   - Save to temp directory

4. **Execute FFmpeg**
   - Run FFmpeg command
   - Track progress with callback
   - Update Supabase with progress %

5. **Upload Output**
   - Upload final video to Supabase Storage
   - Generate public URL

6. **Complete**
   - Update render status to "completed"
   - Save output URL
   - Cleanup temp files

7. **Error Handling**
   - Catch all exceptions
   - Update status to "failed"
   - Save error message
   - Cleanup temp files

---

## 🧪 Testing

### Test API
```bash
curl http://localhost:8000/health
```

### Test Render Flow
```bash
curl -X POST http://localhost:8000/api/renders/start \
  -H "Content-Type: application/json" \
  -d '{"render_id": "test-123", "project_id": "proj-456"}'
```

### Monitor Queue
```bash
# Celery Flower
open http://localhost:5555
```

---

## 🐛 Troubleshooting

### Redis not connecting
```bash
# Check if Redis is running
redis-cli ping
# Should return "PONG"
```

### Celery worker not starting
```bash
# Check Python dependencies
pip list | grep celery

# Check broker connection
celery -A app.worker:celery_app inspect ping
```

### FFmpeg not found
```bash
# Check if FFmpeg is in PATH
ffmpeg -version

# If not, install or add to PATH
```

---

## 📊 Monitoring

### Check Queue Size
```python
from app.worker import celery_app
i = celery_app.control.inspect()
i.active()      # Currently processing
i.scheduled()   # Scheduled tasks
i.reserved()    # Reserved tasks
```

### Check Worker Status
```bash
celery -A app.worker:celery_app status
celery -A app.worker:celery_app inspect active
```

---

## 🔒 Security

- Use service role key for Supabase (not anon key)
- Enable CORS only for your frontend domain
- Validate all input data
- Rate limit API endpoints
- Use HTTPS in production
- Store secrets in environment variables

---

## 📈 Performance

**Recommended:**
- Worker concurrency: 2-4 (based on CPU cores)
- API workers: 4 (for uvicorn)
- Redis maxmemory: 256MB
- FFmpeg preset: medium (balance speed/quality)

**Scaling:**
- Add more Celery workers horizontally
- Use separate Redis instance for queue
- CDN for video delivery
- Auto-scaling based on queue size

---

## 📚 References

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Celery Docs](https://docs.celeryq.dev/)
- [FFmpeg Docs](https://ffmpeg.org/documentation.html)
- [Supabase Python Client](https://supabase.com/docs/reference/python)

---

**Status:** ✅ Ready for development  
**Version:** 1.0.0
