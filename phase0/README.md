# Video Assembler — Fase 0 (Prova de Fluxo)

## Objetivo
Validar o pipeline ponta a ponta antes de construir a plataforma completa:
- Narração via Gemini 2.5 Flash TTS por blocos de cenas
- Regras de ajuste clipe x áudio (Spec 4.1)
- Animações de câmera (zoompan) com FFmpeg
- Transições xfade entre cenas

## Estrutura de diretórios
```
phase0/
├── assembler.py          # Script principal
├── scenes.json           # Definição das 5 cenas de teste
├── assets/
│   ├── images/           # Coloque aqui: img_01.jpg ... img_05.jpg
│   └── clips/            # Coloque aqui: clip_01.mp4 ... clip_05.mp4 (ou deixe vazio para still_image)
├── tmp/                  # Arquivos temporários (gerado automaticamente)
└── output/               # final.mp4 + assembly_report.json (gerado automaticamente)
```

## Pré-requisitos
- Python 3.10+
- FFmpeg 6+ no PATH (`ffmpeg -version`)
- Chave de API do Google AI Studio (Gemini)

### Instalar dependências
```powershell
pip install google-genai pydub tqdm
```

## Como usar

### 1. Preparar assets
Coloque os arquivos em `assets/images/` e `assets/clips/` com os nomes definidos em `scenes.json`.

Os nomes padrão são:
- Imagens: `img_01.jpg` até `img_05.jpg`
- Clipes: `clip_01.mp4` até `clip_05.mp4` (opcional — cenas sem clipe viram `still_image` automaticamente)

### 2. Executar (com TTS real)
```powershell
python assembler.py --key SUA_CHAVE_GEMINI_AQUI

# Ou via variável de ambiente:
$env:GEMINI_API_KEY = "SUA_CHAVE"
python assembler.py
```

### 3. Dry-run (testar sem APIs e sem FFmpeg)
Valida o fluxo lógico e as durações simuladas (15 chars/s):
```powershell
python assembler.py --dry-run
```

### 4. Customizar
| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `--voice` | `Charon` | Voz do Gemini TTS |
| `--style` | (vazio) | Instrução de estilo de voz |
| `--scenes` | `scenes.json` | Arquivo de cenas customizado |

**Vozes disponíveis no Gemini TTS:**
Aoede, Charon, Fenrir, Kore, Leda, Orus, Puck, Zephyr (e outras)

### 5. Resultado
- `output/final.mp4` — vídeo montado com áudio, animações e transições
- `output/assembly_report.json` — relatório com durações, ajustes e tempos de processamento

## Estrutura de scenes.json
```json
{
  "id": 1,
  "order_index": 0,          // Ordem da cena (0-based)
  "section_index": 0,        // Seção do roteiro (para transições de virada)
  "narration_text": "...",   // Texto narrado (enviado ao TTS)
  "media_type": "video_clip",// "video_clip" ou "still_image"
  "image_file": "img_01.jpg",// Nome do arquivo em assets/images/
  "clip_file": "clip_01.mp4",// Nome do arquivo em assets/clips/ (null para still_image)
  "animation_type": "zoom1", // zoom1, zoom2, double_zoom, bounce, none
  "transition_in": "dissolve"// dissolve, fadeblack, fadewhite
}
```

## Animações disponíveis
| Nome | Descrição |
|------|-----------|
| `zoom1` | Zoom suave 1.0→1.15 ease-out |
| `zoom2` | Zoom 1.0→1.25 ease-in-out, centro deslocado |
| `double_zoom` | Zoom in→out (curva em V) |
| `bounce` | Amortecimento nos primeiros ~0.4s |
| `none` | Sem animação |

## Transições disponíveis
| Nome | FFmpeg | Uso recomendado |
|------|--------|-----------------|
| `dissolve` | `xfade=dissolve` | Cortes normais entre cenas |
| `fadeblack` | `xfade=fadeblack` | Virada de seção |
| `fadewhite` | `xfade=fadewhite` | Impacto/revelação |

## Regras de ajuste clipe x áudio (Spec 4.1)
| Situação | Ação |
|----------|------|
| Áudio < clipe (até 25% menor) | Cortar o clipe |
| Áudio < clipe (muito menor) | Cortar + congelar último frame |
| Áudio > clipe (até 30%) | Desacelerar (setpts) |
| Áudio > clipe (muito maior) | Desacelerar ao máximo + freeze frame |
| Cena `still_image` | Imagem + animação pelo tempo do áudio |

## Métricas de sucesso da Fase 0
- [ ] TTS gera áudio com sincronização perceptível às cenas
- [ ] Regras 4.1 aplicadas corretamente (verificar assembly_report.json)
- [ ] Transições xfade visualmente corretas
- [ ] Render de 5 cenas em < 5 minutos (hardware médio)
- [ ] Tempo manual estimado no Flow anotado para dimensionamento
