# 🚀 Quick Start Guide - Video Assembler Platform

Guia rápido para rodar o sistema completo em 5 minutos!

## 📋 Pré-requisitos

### Necessário:
- ✅ Node.js 18+ (para frontend)
- ✅ Python 3.10+ (para backend)
- ✅ pnpm (package manager)
- ✅ Redis (message broker)
- ✅ FFmpeg (video processing)

### Opcional:
- Git (para version control)
- Docker (para Redis, se preferir)

---

## 🔧 Instalação

### 1. Redis (escolha uma opção)

#### Opção A: Windows (Chocolatey)
```bash
choco install redis-64
redis-server
```

#### Opção B: Docker (qualquer sistema)
```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

#### Opção C: Linux/Mac
```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# macOS
brew install redis
brew services start redis
```

### 2. FFmpeg

#### Windows (Chocolatey)
```bash
choco install ffmpeg
```

#### Linux
```bash
sudo apt install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

### 3. Frontend (Next.js)

```bash
cd web

# Instalar dependências (primeira vez)
pnpm install

# Verificar .env.local
# Já está configurado com Arsenal Express
cat .env.local

# Iniciar dev server
pnpm dev
```

Frontend rodando em: **http://localhost:3000**

### 4. Backend (FastAPI + Celery)

```bash
cd backend

# Setup automático (Windows)
setup.bat

# Ou setup manual:
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
cp .env.example .env
# Editar .env com credenciais
```

**Configurar `.env`:**
```bash
SUPABASE_URL=https://neuxjrdlzhhfsojjajwy.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
RENDER_OUTPUT_DIR=C:/temp/renders
```

---

## ▶️ Iniciar Sistema

Você precisa de **3 terminais** rodando simultaneamente:

### Terminal 1: Frontend
```bash
cd web
pnpm dev
```
✅ Next.js em http://localhost:3000

### Terminal 2: Backend API
```bash
cd backend
venv\Scripts\activate
python -m app.main
```
✅ FastAPI em http://localhost:8000

### Terminal 3: Worker
```bash
cd backend
venv\Scripts\activate
celery -A app.worker:celery_app worker --loglevel=info
```
✅ Celery Worker processando renders

---

## 🧪 Testar Sistema

### 1. **Frontend Test**

Abra: http://localhost:3000

1. Login com:
   - Email: `test001@gmail.com`
   - Password: `Test123456!`

2. Criar novo projeto:
   - Name: "Meu Primeiro Vídeo"
   - Resolution: 1920x1080
   - FPS: 30

3. Upload de assets:
   - Arraste uma imagem ou vídeo
   - Aguarde upload (Supabase Storage)

4. Criar scene:
   - Selecione asset
   - Duração: 5s
   - Transition: fade

5. Render:
   - Clique "Render Video"
   - Monitore progresso real-time
   - Download quando completo

### 2. **Backend Test**

```bash
cd backend
python test_worker.py
```

Deve mostrar:
```
✅ FFmpeg Execution: PASSED
✅ Path Replacement: PASSED
✅ Progress Parsing: PASSED

Total: 3/3 tests passed
🎉 All tests passed!
```

### 3. **API Test**

Abra: http://localhost:8000/docs

Teste endpoints:
- `GET /health` → Should return `{"status": "ok"}`
- `POST /api/render` → Submit render job
- `GET /api/render/{task_id}/status` → Check status

---

## 📁 Estrutura de Diretórios

```
workspace/
├── web/                    # Frontend Next.js
│   ├── app/               # Pages (App Router)
│   ├── components/        # React components
│   ├── lib/               # Utils, hooks, API clients
│   ├── types/             # TypeScript types
│   └── .env.local         # Environment variables
│
├── backend/               # Backend FastAPI + Celery
│   ├── app/
│   │   ├── main.py       # FastAPI server
│   │   ├── worker.py     # Celery worker
│   │   ├── config.py     # Configuration
│   │   └── supabase_client.py
│   ├── requirements.txt   # Python deps
│   ├── .env              # Environment variables
│   └── test_worker.py    # Unit tests
│
├── supabase/             # Database migrations
│   └── migrations/
│       └── 001_schema_v2.sql
│
└── phase0/               # CLI Assembler (mantido separado)
    ├── assembler.py
    ├── scenes.json
    └── output/
```

---

## 🔍 Troubleshooting

### ❌ Redis connection failed
```bash
# Verificar se Redis está rodando
redis-cli ping
# Deve retornar: PONG

# Se não estiver rodando:
redis-server  # ou docker start redis
```

### ❌ FFmpeg not found
```bash
# Verificar instalação
ffmpeg -version

# Se não encontrado, instalar:
choco install ffmpeg  # Windows
# ou baixar: https://ffmpeg.org/download.html
```

### ❌ Celery worker not starting
```bash
# Verificar Redis primeiro
redis-cli ping

# Verificar .env configurado
cat backend/.env

# Ativar venv
cd backend
venv\Scripts\activate

# Reinstalar deps
pip install -r requirements.txt
```

### ❌ Frontend can't connect to backend
```bash
# Verificar se FastAPI está rodando
curl http://localhost:8000/health

# Verificar .env.local
cat web/.env.local
# Deve ter: NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### ❌ Upload failed (Supabase)
1. Verificar bucket `media` existe no Supabase
2. Verificar RLS policies permitem upload
3. Verificar ANON_KEY está correto no .env.local

### ❌ Render stuck at 0%
1. Verificar Celery worker está rodando
2. Verificar logs do worker (Terminal 3)
3. Verificar FFmpeg está instalado
4. Verificar paths no FFmpeg command estão corretos

---

## 📊 Status dos Serviços

### ✅ Tudo funcionando:

```
✅ Redis: redis-cli ping → PONG
✅ FFmpeg: ffmpeg -version → ffmpeg version X.X
✅ Frontend: http://localhost:3000 → Login page
✅ Backend: http://localhost:8000/health → {"status": "ok"}
✅ Worker: Terminal mostra "celery@hostname ready"
```

---

## 🎯 Próximos Passos

Após testar o sistema completo:

1. **Deploy** (opcional):
   - Frontend: Vercel
   - Backend: Railway / Render
   - Redis: Upstash / Redis Cloud

2. **Google Veo Integration** (Phase 6):
   - Generate AI prompts from script
   - Manual workflow (copy prompts)
   - Generate video in Google Flow
   - Re-upload to system

3. **Melhorias**:
   - WebSocket para progress real-time
   - Queue management UI
   - Render history & analytics
   - Video templates

---

## 📚 Documentação Completa

- **FASE_1_2_COMPLETO.md** - Supabase + Auth
- **FASE_3_COMPLETO.md** - Project CRUD + Timeline
- **PROJETO_COMPLETO_FINAL.md** - Overview geral
- **FASE_5_COMPLETO.md** - Backend Worker
- **backend/README.md** - Backend docs

---

## 💡 Dicas

1. **Desenvolvimento**: Use 3 terminais sempre (frontend, backend, worker)
2. **Logs**: Monitore terminal do worker para debug
3. **Assets**: Teste primeiro com arquivos pequenos (<10MB)
4. **Renders**: Começa com vídeos curtos (5-10s) para testar
5. **Redis**: Se travar, restart: `redis-cli FLUSHALL`

---

**Criado por:** Kiro AI Assistant  
**Data:** 2026-10-08  
**Versão:** 1.0
