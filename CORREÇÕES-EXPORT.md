# Correções do Sistema de Exportação

## ✅ Problemas Corrigidos

### 1. **Exportar Áudio (.wav)** - IMPLEMENTADO
- ✅ Agora mixa narração + clips de áudio
- ✅ Usa OfflineAudioContext para mixing
- ✅ Exporta como .wav (PCM 16-bit)
- ✅ Download automático
- ✅ Feedback visual no console

**Como funciona**:
1. Carrega todos os segmentos de narração
2. Mixa em um AudioContext offline
3. Converte AudioBuffer → WAV
4. Download automático

### 2. **Renderizar MP4 - Detecção de Formato** - CORRIGIDO
- ✅ Detecta orientação dos clipes (vertical/horizontal)
- ✅ Mostra formato detectado na UI
- ✅ Recomenda preset correto automaticamente
- ✅ **Auto-troca width/height** quando preset não combina com source
- ✅ Indicador visual de incompatibilidade

**Exemplo**:
- Clipes são 1080×1920 (vertical)
- Você escolhe "1080p" (1920×1080 horizontal)
- Sistema detecta e **renderiza em 1080×1920** (adapta automaticamente)

### 3. **Problema do Áudio no MP4** - EM INVESTIGAÇÃO
O áudio não está sendo incluído no MP4 renderizado. Possíveis causas:
- `mixAndAddAudio()` pode não estar sincronizando corretamente
- AudioBufferSource pode precisar de ajustes no timing
- Mediabunny pode estar finalizando antes do áudio terminar

**TODO**: Depurar a mixagem de áudio no renderizador MP4.

## 🚧 Pendências

### Ferramenta de Corte na Timeline
Ainda **não implementada**. Para adicionar:

1. **UI Necessária**:
   - Botão "Cortar" no inspector de cada cena
   - Modal/Sheet com preview do vídeo
   - Controles de in/out point (slider ou números)
   - Preview em tempo real do corte

2. **Backend**:
   - Salvar `in_point` no banco (campo já existe)
   - Update mutation para scenes

3. **Integração**:
   - Preview já respeita `trim`
   - CapCut draft já respeita `trim`
   - Apenas falta a UI para definir

## Próximos Passos

1. **Depurar áudio no MP4**
   - Verificar timing do audioSource.add()
   - Confirmar se AudioBuffer tem conteúdo
   - Testar com áudio curto primeiro

2. **Implementar ferramenta de corte**
   - Criar CutToolSheet component
   - Integrar com video preview
   - Salvar in_point no banco

3. **Melhorias visuais**
   - Progress bar mais informativa (tempo restante)
   - Preview do frame atual durante render
   - Cancelar renderização

## Commits

- `[novo]`: fix(web): render + audio export improvements
- `a022e4e`: docs: add export menu testing guide
- `e43ee8b`: fix(web): proper radix-ui dropdown menu implementation

## Como Testar no Vercel

1. **Exportar Áudio**:
   - Clique em Exportar → Exportar Áudio
   - Arquivo .wav deve baixar automaticamente
   - Verifique se tem som (abra no player)

2. **Renderizar MP4**:
   - Veja o "Formato detectado" (deve mostrar seus clipes)
   - Escolha o preset recomendado
   - Clique em "Renderizar e Baixar"
   - Aguarde progress bar (pode demorar)
   - Vídeo deve baixar automaticamente
   - **Verifique proporção** (deve estar correta agora)
   - **Verifique áudio** (TODO: pode estar mudo ainda)
