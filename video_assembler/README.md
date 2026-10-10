# Video Assembler

Ferramenta automática de edição de vídeo. Sincroniza clipes com narração, remove pausas, adiciona textos.

## Instalação

```bash
# Requer Python 3.10+ e FFmpeg
python assembler.py doctor  # Verifica ambiente
```

## Uso Rápido

```bash
# 1. Analisar vídeos
python assembler.py probe --lote projeto1

# 2. Gerar EDL (simulação - não renderiza)
python assembler.py plan --lote projeto1 --narracao audios/audio1.wav

# 3. Revisar edl.json e relatorio_cortes.md

# 4. Prévia
python assembler.py preview --lote projeto1

# 5. Render final
python assembler.py render --lote projeto1 --yes

# 6. (Opcional) Preparar para CapCut
python assembler.py package --lote projeto1
```

## Comandos

- `doctor` - Verifica ambiente (Python, FFmpeg, filtros, codecs)
- `probe` - Analisa vídeos (resolução, FPS, duração, orientação)
- `plan` - Gera EDL e relatório (modo simulação)
- `preview` - Renderiza prévia leve (540p)
- `render` - Renderiza vídeo final
- `package` - Organiza pasta de saída

## Configuração

Arquivo `config.yaml` (criado automaticamente na primeira execução):

```yaml
formato:
  saida: auto  # auto, 16:9, 9:16
  fps_saida: 30

cenas:
  modo_timing: 1  # 1=duracao, 2=marcacoes, 3=transcricao
  duracao_padrao: 6.6  # segundos
  excecoes:
    3: 8.5  # Cena 3 dura 8.5s
    15: 5.2

audio:
  silencio:
    duracao_min: 0.45  # detecta pausas >= 0.45s
    nivel_db: -35
    pausa_alvo: 0.25  # encurta para 0.25s
    margem_seguranca: 0.10

  narracao:
    loudness_lufs: -14
    compressao: false

  clipes:
    modo: baixo  # silenciar, baixo, manter
    volume_db: -18

  musica:
    ativa: false
    volume_db: -20
    ducking: true

render:
  crf: 18
  preset: medium
  audio_bitrate: 192k
```

## Ordem dos Clipes

Por padrão:
1. Se **todos** os arquivos seguem padrão `Cena_NN`, ordena por número
2. Senão, ordena por **data de criação** (ou modificação se criação não disponível)

Forçar critério:
```bash
python assembler.py plan --lote projeto1 --ordem numero
python assembler.py plan --lote projeto1 --ordem data-criacao
python assembler.py plan --lote projeto1 --ordem nome
```

## EDL (Edit Decision List)

Arquivo `edl.json` criado pelo comando `plan`. Você pode editá-lo manualmente:

```json
{
  "version": "1.0",
  "projeto": "projeto1",
  "formato_saida": "9:16",
  "resolucao_saida": [1080, 1920],
  "fps_saida": 30,
  "timeline": [
    {
      "cena": 1,
      "arquivo_origem": "Cena_01.mp4",
      "tempo_inicio_clipe": 0.0,
      "tempo_fim_clipe": 6.8,
      "posicao_timeline": 0.0,
      "duracao_final": 6.8,
      "ajuste_aplicado": "cortado_fim",
      "motivo": "Clipe 8s, narração 6.8s — cortou 1.2s do fim",
      "textos_tela": []
    }
  ],
  "avisos": []
}
```

## Estrutura de Saída

```
saida_projeto1_YYYYMMDD_HHMMSS/
├── final/
│   └── video_final_1080x1920.mp4
├── previa/
│   └── previa_540x960.mp4
├── para_capcut/
│   ├── video_final_1080x1920.mp4
│   └── legendas.srt
├── edl.json
├── config_usada.yaml
├── relatorio_cortes.md
├── relatorio_cortes.csv
└── logs/
```

## Limitações Atuais (v0.1)

- Modo 1 (duração por cena) implementado. Modos 2 e 3 TODO.
- Renderer usa concat simples. Filter_complex completo TODO.
- Textos na tela lidos de plano TODO.
- Mixing de áudio (clipes + narração + música) TODO.
- Transcrição automática (modo 3) requer faster-whisper.

## Próximos Passos

1. Testar com seus arquivos reais (`projeto1`)
2. Implementar filter_complex completo no renderer
3. Adicionar textos na tela (drawtext)
4. Mixing de áudio completo
5. Modos 2 e 3 de timing
