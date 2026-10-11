 # 🎬 Guia de Teste - Auto Assemble

## ✅ Implementações Concluídas

### Funcionalidade Auto Assemble
- ✅ Hook `useAutoAssemble()` criado em `web/lib/hooks/useScenes.ts`
- ✅ Botão "Auto Assemble" adicionado no Timeline
- ✅ Organização automática por data de modificação (created_at)
- ✅ Sincronização automática vídeo + áudio
- ✅ Tipos TypeScript atualizados com schema correto
- ✅ Logs de debug para troubleshooting

### Correções de Schema
- ✅ Campo `narration_text` (obrigatório) agora é preenchido
- ✅ Campo `media_type` definido como 'video_clip'
- ✅ Campo `audio_duration` usado corretamente
- ✅ Campo `order_index` ao invés de `order`
- ✅ Metadata armazenado em JSONB

## 🧪 Passo a Passo do Teste

### 1. Preparação
- ✅ Servidor rodando em http://localhost:3000
- ✅ Projeto aberto: d3544f25-f125-4d48-a62b-36cc588f49eb
- ✅ 22 vídeos disponíveis em `projeto1/videos/`
- ✅ 2 áudios disponíveis em `projeto1/audios/`

### 2. Upload de Vídeos (Escolha 5-6 para teste)

**Vídeos recomendados (já ordenados por data):**
1. `Fingers_tuning_radio_dial_20261009101121.mp4` (10:11:21)
2. `Camera_approaching_microphone_in…_20261009101126.mp4` (10:11:26)
3. `Câmera_move-se_perto_de_microfones_20261009101131.mp4` (10:11:31)
4. `Hands_adjusting_audio_mixer_cont…_20261009101135.mp4` (10:11:35)
5. `Slow_camera_movement_on_avenue_20261009101143.mp4` (10:11:43)

**Como fazer:**
1. Clique em "Upload Video" (botão azul)
2. Selecione cada vídeo individualmente
3. Aguarde o upload completar (thumbnail aparece)
4. Repita para todos os vídeos

### 3. Upload de Áudios

**Áudios disponíveis:**
1. `audio1.wav`
2. `audio2.wav`

**Como fazer:**
1. Clique em "Upload Audio" (botão verde)
2. Selecione cada áudio individualmente
3. Aguarde o upload completar

### 4. Executar Auto Assemble

1. Role até a seção **Timeline** (parte inferior da página)
2. Clique no botão **⚡ Auto Assemble** (ao lado de "Add Scene")
3. Aguarde o processamento (botão muda para "Assembling...")
4. Um alert aparecerá com sucesso ou erro

### 5. Verificar Resultado

**✅ O que deve acontecer:**
- Cenas aparecem na timeline em ordem horizontal
- Cada cena mostra:
  - Número sequencial (1, 2, 3...)
  - Ícone 🎬 (vídeo)
  - Ícone 🎵 (se tem áudio)
  - Duração do vídeo
  - Botões Edit e Delete
- Total de cenas = número de vídeos enviados
- Primeiras 2 cenas têm áudio sincronizado
- Demais cenas só têm vídeo

**🎯 Ordem esperada:**
1. Scene 1 → Fingers_tuning_radio_dial + audio1.wav
2. Scene 2 → Camera_approaching_microphone + audio2.wav
3. Scene 3 → Câmera_move-se_perto_de_microfones (sem áudio)
4. Scene 4 → Hands_adjusting_audio_mixer (sem áudio)
5. Scene 5 → Slow_camera_movement_on_avenue (sem áudio)

### 6. Verificar no Console do Navegador (F12)

**Logs esperados:**
```
[Auto Assemble] Starting for project: d3544f25-...
[Auto Assemble] Video assets: Array(5) [...]
[Auto Assemble] Audio assets: Array(2) [...]
[Auto Assemble] New scenes to create: Array(5) [...]
[Auto Assemble] Success! Created scenes: Array(5) [...]
```

## 🔍 Validação dos Dados

### No Supabase (Opcional)

Acesse: https://supabase.com/dashboard/project/neuxjrdlzhhfsojjajwy

**Tabela `scenes`:**
```sql
SELECT 
  order_index,
  narration_text,
  media_type,
  audio_duration,
  video_asset_id,
  audio_asset_id,
  metadata
FROM scenes
WHERE project_id = 'd3544f25-f125-4d48-a62b-36cc588f49eb'
ORDER BY order_index;
```

**Resultado esperado:**
- 5 linhas (uma para cada cena)
- `order_index`: 0, 1, 2, 3, 4
- `narration_text`: "Scene 1", "Scene 2", etc.
- `media_type`: "video_clip"
- `audio_duration`: duração em segundos
- `video_asset_id`: UUID do vídeo
- `audio_asset_id`: UUID do áudio (primeiras 2), NULL (demais)

## 🐛 Troubleshooting

### ❌ Erro: "Failed to auto-assemble scenes"

**Verificar:**
1. Console do navegador (F12) → ver log de erro específico
2. Há vídeos na Asset Library? (pelo menos 1 necessário)
3. O servidor está rodando sem erros?

**Possíveis causas:**
- RLS policy bloqueando delete/insert
- Campo obrigatório faltando no insert
- Tipo de dado incompatível

### ❌ Cenas não aparecem após sucesso

**Solução:**
1. Recarregar a página (F5)
2. Verificar se `queryClient` está invalidando cache
3. Verificar no Supabase se scenes foram criadas

### ❌ Upload de vídeo falha

**Solução:**
1. Verificar RLS policies da tabela `assets`
2. Verificar storage bucket `media` está acessível
3. Tentar arquivo menor (< 50MB)

## 📊 Métricas de Sucesso

- ✅ Upload de 5+ vídeos sem erro
- ✅ Upload de 2 áudios sem erro  
- ✅ Auto Assemble executa sem erro
- ✅ 5 cenas criadas na timeline
- ✅ Ordem correta (por data)
- ✅ Áudios sincronizados nas primeiras 2 cenas
- ✅ Duração correta exibida
- ✅ Drag & drop funciona para reordenar

## 🎯 Próximos Passos

Após validação:
1. Adicionar opção de escolher transições
2. Implementar preview de cena individual
3. Criar função de render (FFmpeg)
4. Adicionar opção de "Auto Assemble com narração"
5. Sincronizar duração de vídeo com duração de áudio

---

**Status:** ✅ Pronto para teste
**Última atualização:** 2026-10-10
