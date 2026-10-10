# 🎬 Fase 3: Project CRUD + Timeline Editor

**Status:** 🚧 Em Desenvolvimento
**Pré-requisitos:** ✅ Fase 1 (Supabase) + ✅ Fase 2 (Auth/Dashboard)

---

## 🎯 Objetivos da Fase 3

1. **Project Management (CRUD)**
   - Criar novo projeto (2 modos: upload / script-to-prompt)
   - Listar projetos do usuário
   - Editar projeto (título, descrição, settings)
   - Deletar projeto (soft delete)
   - Ver detalhes do projeto

2. **Timeline Editor (Core)**
   - Visualização de cenas em linha do tempo
   - Drag & drop para reordenar cenas
   - Preview de mídia (vídeo/áudio/imagem)
   - Ajuste de duração de cenas
   - Configuração de transições

3. **Asset Management**
   - Upload de vídeos (Supabase Storage)
   - Upload de áudios
   - Upload de imagens
   - Preview de assets
   - Gerenciar assets por projeto

---

## 📋 Componentes a Implementar

### 1. Project List (`/dashboard`)
**Arquivo:** `web/app/(dashboard)/dashboard/page.tsx` (já existe, expandir)

**Features:**
- Grid/lista de projetos
- Card com: thumbnail, título, status, data de atualização
- Botão "New Project" (modal)
- Busca e filtros (status, modo, data)
- Paginação
- Loading states
- Empty state

**UI:**
```
┌─────────────────────────────────────────┐
│  Dashboard                    [+ New]   │
├─────────────────────────────────────────┤
│  Search: [____]  Filter: [All ▼]        │
├─────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐             │
│  │ 📹  │  │ 📹  │  │ 📹  │             │
│  │Title│  │Title│  │Title│             │
│  │Draft│  │Ready│  │Done │             │
│  └─────┘  └─────┘  └─────┘             │
└─────────────────────────────────────────┘
```

---

### 2. New Project Modal
**Arquivo:** `web/components/projects/NewProjectModal.tsx`

**Features:**
- Escolher modo: "Upload Videos" ou "Script to Prompt"
- Título do projeto (obrigatório)
- Descrição (opcional)
- Settings iniciais:
  - Formato de saída (16:9, 9:16, 1:1)
  - Duração alvo
  - Modo de transição padrão
- Criar projeto → redirect para /project/[id]

**Form:**
```typescript
{
  title: string (required, 3-100 chars)
  description?: string (max 500 chars)
  mode: 'upload' | 'script-to-prompt'
  settings: {
    output_format: '16:9' | '9:16' | '1:1'
    target_duration?: number
    default_transition: 'cut' | 'dissolve' | 'fade'
  }
}
```

---

### 3. Project Editor (`/project/[id]`)
**Arquivo:** `web/app/(dashboard)/project/[id]/page.tsx`

**Layout:**
```
┌───────────────────────────────────────────────────┐
│  ← Back    Project Title              [Save] [▶]  │
├───────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌───────────────────────┐  │
│  │  Asset Library  │  │   Preview             │  │
│  │  📁 Videos      │  │   ┌─────────────────┐ │  │
│  │  🎵 Audios      │  │   │                 │ │  │
│  │  🖼️  Images      │  │   │   [ VIDEO ]     │ │  │
│  │                 │  │   │                 │ │  │
│  │  [+ Upload]     │  │   └─────────────────┘ │  │
│  └─────────────────┘  └───────────────────────┘  │
├───────────────────────────────────────────────────┤
│  Timeline                                         │
│  ┌───┬───┬───┬───┬───┬───┬───┬───┐              │
│  │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │              │
│  └───┴───┴───┴───┴───┴───┴───┴───┘              │
│  [+ Add Scene]                                    │
└───────────────────────────────────────────────────┘
```

**Features:**
- Asset library (lateral esquerda)
- Preview area (centro superior)
- Timeline (inferior)
- Toolbar (superior)

---

### 4. Timeline Component
**Arquivo:** `web/components/timeline/Timeline.tsx`

**Features:**
- Drag & drop (react-beautiful-dnd ou @dnd-kit)
- Scene cards com:
  - Thumbnail
  - Duração
  - Transição
  - Assets (vídeo/áudio/imagem)
- Controles por cena:
  - Editar
  - Duplicar
  - Deletar
- Zoom in/out da timeline
- Playback preview

**Technologies:**
- **@dnd-kit/core** (drag & drop)
- **@dnd-kit/sortable** (reordering)
- **react-player** (preview de vídeo)
- **wavesurfer.js** (waveform de áudio)

---

### 5. Scene Editor Modal
**Arquivo:** `web/components/timeline/SceneEditor.tsx`

**Features:**
- Editar duração (segundos)
- Selecionar vídeo/imagem
- Selecionar áudio
- Configurar transição (entrada/saída)
- Configurar animação (se vídeo/imagem)
- Preview em tempo real

**Form:**
```typescript
{
  duration: number (1-120s)
  video_asset_id?: string
  audio_asset_id?: string
  image_asset_id?: string
  transition_in: 'cut' | 'dissolve' | 'fade' | 'wipe'
  transition_out: 'cut' | 'dissolve' | 'fade' | 'wipe'
  animation?: 'none' | 'zoom' | 'pan' | 'ken-burns'
  order: number (position na timeline)
}
```

---

### 6. Asset Upload Component
**Arquivo:** `web/components/assets/AssetUpload.tsx`

**Features:**
- Drag & drop de arquivos
- Multiple file upload
- Progress bar
- Validação:
  - Vídeo: mp4, webm, mov (max 500MB)
  - Áudio: mp3, wav, m4a (max 100MB)
  - Imagem: jpg, png, webp (max 10MB)
- Upload para Supabase Storage
- Criar registro na tabela `assets`

**Flow:**
```
1. User seleciona arquivo
2. Validar tipo e tamanho
3. Upload para storage bucket "media"
4. Criar registro em `assets` table
5. Atualizar asset library
6. Exibir toast de sucesso
```

---

## 🗄️ Estrutura de Arquivos

```
web/
├── app/
│   └── (dashboard)/
│       ├── dashboard/
│       │   └── page.tsx (✅ exists, expand)
│       └── project/
│           └── [id]/
│               └── page.tsx (NEW)
├── components/
│   ├── projects/
│   │   ├── NewProjectModal.tsx (NEW)
│   │   ├── ProjectCard.tsx (NEW)
│   │   ├── ProjectList.tsx (NEW)
│   │   └── ProjectFilters.tsx (NEW)
│   ├── timeline/
│   │   ├── Timeline.tsx (NEW)
│   │   ├── SceneCard.tsx (NEW)
│   │   ├── SceneEditor.tsx (NEW)
│   │   └── TimelineControls.tsx (NEW)
│   ├── assets/
│   │   ├── AssetUpload.tsx (NEW)
│   │   ├── AssetLibrary.tsx (NEW)
│   │   ├── AssetCard.tsx (NEW)
│   │   └── AssetPreview.tsx (NEW)
│   └── ui/
│       ├── modal.tsx (NEW - shadcn)
│       ├── dialog.tsx (NEW - shadcn)
│       ├── toast.tsx (NEW - shadcn)
│       └── progress.tsx (NEW - shadcn)
├── lib/
│   ├── hooks/
│   │   ├── useProjects.ts (NEW)
│   │   ├── useScenes.ts (NEW)
│   │   └── useAssets.ts (NEW)
│   └── stores/
│       ├── projectStore.ts (NEW - Zustand)
│       └── timelineStore.ts (NEW - Zustand)
└── types/
    └── project.ts (NEW)
```

---

## 🔧 Dependências Adicionais

```json
{
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "react-player": "^2.16.0",
  "wavesurfer.js": "^7.7.0",
  "react-dropzone": "^14.2.10",
  "sonner": "^1.4.41"
}
```

---

## 📝 Types/Interfaces

**Arquivo:** `web/types/project.ts`

```typescript
export type ProjectMode = 'upload' | 'script-to-prompt'
export type ProjectStatus = 'draft' | 'in_progress' | 'ready' | 'completed'
export type OutputFormat = '16:9' | '9:16' | '1:1'
export type TransitionType = 'cut' | 'dissolve' | 'fade' | 'wipe' | 'slide'
export type AnimationType = 'none' | 'zoom' | 'pan' | 'ken-burns'

export interface Project {
  id: string
  user_id: string
  title: string
  description?: string
  mode: ProjectMode
  status: ProjectStatus
  settings: ProjectSettings
  created_at: string
  updated_at: string
}

export interface ProjectSettings {
  output_format: OutputFormat
  target_duration?: number
  default_transition: TransitionType
  fps?: number
  audio_bitrate?: string
  video_codec?: string
}

export interface Asset {
  id: string
  project_id: string
  type: 'video' | 'audio' | 'image'
  filename: string
  storage_path: string
  url: string
  duration?: number
  metadata?: Record<string, any>
  created_at: string
}

export interface Scene {
  id: string
  project_id: string
  order: number
  duration: number
  video_asset_id?: string
  audio_asset_id?: string
  image_asset_id?: string
  transition_in: TransitionType
  transition_out: TransitionType
  animation?: AnimationType
  veo_prompt?: string
  created_at: string
  updated_at: string
}
```

---

## 🎨 UI/UX Guidelines

### Colors (Dark Theme)
```css
--background: 0 0% 3.9%
--foreground: 0 0% 98%
--primary: 240 5.9% 10%
--secondary: 240 3.7% 15.9%
--accent: 240 4.8% 95.9%
--destructive: 0 62.8% 30.6%
```

### Component Patterns
- **Modal:** shadcn Dialog component
- **Toast:** sonner (Toaster component)
- **Loading:** Skeleton components
- **Empty State:** Icon + text + CTA button
- **Drag & Drop:** Visual feedback (opacity, shadow)

---

## 🚀 Implementação por Etapas

### Etapa 3.1: Project CRUD
1. ✅ Types/interfaces
2. ✅ Zustand store (projectStore)
3. ✅ React Query hooks (useProjects)
4. ✅ NewProjectModal component
5. ✅ ProjectCard component
6. ✅ ProjectList component
7. ✅ Atualizar dashboard page

### Etapa 3.2: Project Editor Base
1. ✅ Criar rota /project/[id]
2. ✅ Layout do editor (3 áreas)
3. ✅ AssetLibrary component
4. ✅ Preview area (placeholder)
5. ✅ Timeline area (placeholder)

### Etapa 3.3: Asset Upload
1. ✅ AssetUpload component (react-dropzone)
2. ✅ Integração com Supabase Storage
3. ✅ Validação de arquivos
4. ✅ Progress tracking
5. ✅ AssetCard component

### Etapa 3.4: Timeline Editor
1. ✅ Timeline component base
2. ✅ SceneCard component
3. ✅ @dnd-kit integration
4. ✅ Reorder scenes (drag & drop)
5. ✅ Add/remove scenes

### Etapa 3.5: Scene Editor
1. ✅ SceneEditor modal
2. ✅ Asset selection (dropdowns)
3. ✅ Duration input
4. ✅ Transition selectors
5. ✅ Animation selector
6. ✅ Preview integration

### Etapa 3.6: Preview & Playback
1. ✅ react-player integration
2. ✅ Wavesurfer.js integration
3. ✅ Timeline scrubbing
4. ✅ Play/pause controls
5. ✅ Sync preview com timeline

---

## ✅ Critérios de Sucesso

- [ ] Criar projeto funciona (ambos os modos)
- [ ] Listar projetos com RLS correto
- [ ] Upload de assets para Supabase Storage
- [ ] Drag & drop de cenas funcionando
- [ ] Editar cena salva no banco
- [ ] Preview de vídeo funciona
- [ ] Waveform de áudio renderiza
- [ ] Performance aceitável (< 3s para carregar editor)
- [ ] Responsivo (desktop + tablet)
- [ ] Sem erros no console

---

## 📊 Estimativa de Tempo

| Etapa | Tempo | Complexidade |
|-------|-------|--------------|
| 3.1 - Project CRUD | ~2h | 🟢 Baixa |
| 3.2 - Editor Base | ~1h | 🟢 Baixa |
| 3.3 - Asset Upload | ~2h | 🟡 Média |
| 3.4 - Timeline | ~3h | 🔴 Alta |
| 3.5 - Scene Editor | ~2h | 🟡 Média |
| 3.6 - Preview | ~2h | 🟡 Média |
| **Total** | **~12h** | - |

---

**Pronto para começar a Etapa 3.1!** 🚀
