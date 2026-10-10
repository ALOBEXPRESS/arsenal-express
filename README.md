# Arsenal Express

**AI-Powered Video Production Platform**

Transform scripts into professional short-form videos using AI. Arsenal Express combines Google Veo video generation with intelligent editing workflows.

## 🎯 Features

- **Script-to-Prompt Mode**: Generate AI video prompts from your script
- **Upload Mode**: Assemble videos from your own media files
- **Timeline Editor**: Visual timeline for precise video editing
- **Asset Management**: Organize videos, images, and audio files
- **FFmpeg Integration**: Professional video rendering
- **Cloud Rendering**: Async job processing with Celery + Redis

## 🏗️ Architecture

### Frontend (Web)
- **Framework**: Next.js 15 + React 19
- **UI**: Tailwind CSS + shadcn/ui
- **State**: TanStack Query (React Query)
- **Auth**: Supabase Auth

### Backend (API)
- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL (Supabase)
- **Storage**: Supabase Storage
- **Jobs**: Celery + Redis
- **Video**: FFmpeg

### CLI (Phase 0)
- **Language**: Python
- **Processing**: OpenCV + FFmpeg
- **Audio**: ElevenLabs TTS

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ / pnpm
- Python 3.12+
- Docker (for Redis)
- FFmpeg

### Web Setup
```bash
cd web
pnpm install
cp .env.example .env.local
# Configure Supabase credentials
pnpm dev
```

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/Scripts/activate  # Windows
pip install -r requirements.txt
cp .env.example .env
# Configure Supabase credentials
python -m app.main
```

### Redis (Required for Backend)
```bash
docker run -d -p 6379:6379 --name redis-assembler redis:alpine
```

## 📁 Project Structure

```
arsenal-express/
├── web/              # Next.js frontend
├── backend/          # FastAPI + Celery backend
├── phase0/           # CLI assembler (original)
├── supabase/         # Database migrations
└── docs/             # Documentation
```

## 🗄️ Database Schema

- **profiles**: User profiles with API keys
- **projects**: Video projects
- **scenes**: Individual video scenes/segments
- **assets**: Media files (videos, images, audio)
- **timeline_items**: Timeline composition
- **renders**: Render jobs and outputs

## 🔐 Environment Variables

### Web (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Backend (.env)
```
SUPABASE_URL=
SUPABASE_KEY=
REDIS_URL=redis://localhost:6379
```

## 📝 Development Phases

- ✅ **Phase 0**: CLI Assembler (Functional)
- ✅ **Phase 1**: Supabase Schema
- ✅ **Phase 2**: Authentication
- ✅ **Phase 3**: Project CRUD + Timeline
- ✅ **Phase 4**: Preview + FFmpeg
- ✅ **Phase 5**: Backend Worker (Celery)
- 🚧 **Phase 6**: Script-to-Prompt Pipeline (Next)
- 🚧 **Phase 7**: Asset Processing
- 🚧 **Phase 8**: Production Deploy

## 🧪 Testing

```bash
# Frontend tests with Playwright MCP
cd web
pnpm dev

# Backend tests
cd backend
pytest
```

## 📄 License

MIT

## 👥 Team

ALOBEXPRESS

---

**Arsenal Express** - Professional AI Video Production
