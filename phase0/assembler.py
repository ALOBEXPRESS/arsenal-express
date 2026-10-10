"""
Video Assembler — Fase 0 (Prova de Fluxo)
==========================================
Dois modos de audio:

  MODO A — TTS via API Gemini (requer chave):
    python assembler.py --key SUA_CHAVE [--voice Charon]

  MODO B — Audio manual gerado no Google AI Studio (sem chave):
    python assembler.py --audio assets/audio/narration.wav
    O audio sera dividido proporcionalmente pelo numero de caracteres de cada cena.

  DRY-RUN (sem API nem FFmpeg, so valida o fluxo logico):
    python assembler.py --dry-run

Dependencias:
    pip install google-genai pydub tqdm
    ffmpeg no PATH
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# --------------------------------------------------------------------------- #
# Configuracoes
# --------------------------------------------------------------------------- #
BASE_DIR = Path(__file__).parent
ASSETS_IMAGES = BASE_DIR / "assets" / "images"
ASSETS_CLIPS  = BASE_DIR / "assets" / "clips"
ASSETS_AUDIO  = BASE_DIR / "assets" / "audio"
TMP_DIR       = BASE_DIR / "tmp"
OUTPUT_DIR    = BASE_DIR / "output"

SUPPORTED_AUDIO = {".wav", ".mp3", ".aac", ".m4a", ".ogg", ".flac"}
SUPPORTED_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
SUPPORTED_VIDEO = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

TARGET_FPS        = 30
TARGET_WIDTH      = 1920
TARGET_HEIGHT     = 1080
CLIP_TARGET_DUR   = 8.0          # duracao padrao de um clipe do Flow (s)
ADJUST_SLOW_LIMIT = 1.30         # ate 30% mais lento -> desacelerar
TTS_BLOCK_SIZE    = 2            # cenas por bloco de TTS (2-4)

# Mapeamento animacao -> parametros zoompan
ANIMATION_PARAMS = {
    "zoom1": {  # ease-out suave 1.0 -> 1.15
        "zoom": "min(zoom+0.0015,1.15)",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih/2-(ih/zoom/2)",
    },
    "zoom2": {  # ease-in-out 1.0 -> 1.25, centro levemente deslocado
        "zoom": "if(lte(on,1),1.0,min(zoom+0.002,1.25))",
        "x": "iw/2-(iw/zoom/2)+10",
        "y": "ih/2-(ih/zoom/2)+5",
    },
    "double_zoom": {  # V-curve: sobe e volta
        "zoom": "if(lte(on,nframes/2), min(1+on*(0.2/(nframes/2)),1.2), max(1.2-(on-nframes/2)*(0.2/(nframes/2)),1.0))",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih/2-(ih/zoom/2)",
    },
    "bounce": {  # amortecimento nos primeiros ~0.4s
        "zoom": "1+0.05*exp(-on/3)*abs(sin(on*1.2))",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih/2-(ih/zoom/2)",
    },
    "none": None,
}

# Mapeamento transicao -> xfade
TRANSITION_MAP = {
    "dissolve":  "dissolve",
    "fadeblack": "fadeblack",
    "fadewhite": "fadewhite",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("assembler")


# --------------------------------------------------------------------------- #
# Modelos de dados
# --------------------------------------------------------------------------- #
@dataclass
class Scene:
    id: int
    order_index: int
    section_index: int
    narration_text: str
    media_type: str          # 'video_clip' | 'still_image'
    image_file: Optional[str]
    clip_file: Optional[str]
    animation_type: str = "zoom1"
    transition_in: str = "dissolve"

    # Preenchidos durante o processamento
    audio_path: Optional[Path] = None
    audio_duration: float = 0.0
    segment_path: Optional[Path] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Scene":
        return cls(
            id=d["id"],
            order_index=d["order_index"],
            section_index=d.get("section_index", 0),
            narration_text=d["narration_text"],
            media_type=d.get("media_type", "video_clip"),
            image_file=d.get("image_file"),
            clip_file=d.get("clip_file"),
            animation_type=d.get("animation_type", "zoom1"),
            transition_in=d.get("transition_in", "dissolve"),
        )

    @property
    def image_path(self) -> Optional[Path]:
        if self.image_file:
            return ASSETS_IMAGES / self.image_file
        return None

    @property
    def clip_path(self) -> Optional[Path]:
        if self.clip_file:
            return ASSETS_CLIPS / self.clip_file
        return None


# --------------------------------------------------------------------------- #
# Resolucao automatica de assets
# --------------------------------------------------------------------------- #
def files_by_mtime(folder: Path, extensions: set) -> list[Path]:
    """Lista arquivos de uma pasta filtrados por extensao, ordenados por data de modificacao."""
    if not folder.exists():
        return []
    files = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions]
    files.sort(key=lambda f: f.stat().st_mtime)
    return files


def auto_detect_audio(audio_arg: Optional[str]) -> Optional[list[Path]]:
    """
    Resolve a lista de arquivos de audio a usar:
    - Se --audio foi passado: usa esse caminho (pode ser um unico arquivo).
    - Se nao: procura em assets/audio/ e retorna todos ordenados por mtime.
    - Se nao achar nada: retorna None (modo sem audio manual).
    """
    if audio_arg:
        p = Path(audio_arg)
        if not p.exists():
            log.error("Arquivo de audio nao encontrado: %s", p)
            sys.exit(1)
        return [p]

    found = files_by_mtime(ASSETS_AUDIO, SUPPORTED_AUDIO)
    if found:
        log.info("Audio auto-detectado em assets/audio/ (%d arquivo(s)):", len(found))
        for f in found:
            log.info("  %s (mtime: %s)", f.name,
                     time.strftime("%d/%m %H:%M:%S", time.localtime(f.stat().st_mtime)))
        return found
    return None


def auto_assign_assets(scenes: list) -> None:
    """
    Para cenas sem image_file ou clip_file definidos no JSON,
    atribui automaticamente os arquivos encontrados nas pastas de assets
    ordenados por data de modificacao (mtime).

    Logica:
    - Pega os arquivos das pastas que nao foram explicitamente referenciados.
    - Atribui em sequencia de order_index das cenas que precisam de asset.
    - Gera um relatorio no log para o usuario conferir o mapeamento.
    """
    # Imagens
    explicitly_used_imgs = {s.image_file for s in scenes if s.image_file}
    auto_imgs = [f for f in files_by_mtime(ASSETS_IMAGES, SUPPORTED_IMAGE)
                 if f.name not in explicitly_used_imgs]
    scenes_needing_img = [s for s in scenes if not s.image_file]

    if scenes_needing_img and auto_imgs:
        log.info("Auto-atribuindo imagens por mtime (%d cenas sem imagem, %d disponiveis):",
                 len(scenes_needing_img), len(auto_imgs))
        for s, img in zip(scenes_needing_img, auto_imgs):
            s.image_file = img.name
            log.info("  Cena %d <- %s (mtime: %s)",
                     s.order_index, img.name,
                     time.strftime("%d/%m %H:%M:%S", time.localtime(img.stat().st_mtime)))
        extra = len(scenes_needing_img) - len(auto_imgs)
        if extra > 0:
            log.warning("  %d cenas sem imagem disponivel — serao marcadas como 'sem asset'", extra)
    elif scenes_needing_img:
        log.warning("%d cenas sem imagem e nenhum arquivo em assets/images/",
                    len(scenes_needing_img))

    # Clipes (so para cenas video_clip)
    explicitly_used_clips = {s.clip_file for s in scenes if s.clip_file}
    auto_clips = [f for f in files_by_mtime(ASSETS_CLIPS, SUPPORTED_VIDEO)
                  if f.name not in explicitly_used_clips]
    scenes_needing_clip = [s for s in scenes
                           if s.media_type == "video_clip" and not s.clip_file]

    if scenes_needing_clip and auto_clips:
        log.info("Auto-atribuindo clipes por mtime (%d cenas sem clipe, %d disponiveis):",
                 len(scenes_needing_clip), len(auto_clips))
        for s, clip in zip(scenes_needing_clip, auto_clips):
            s.clip_file = clip.name
            log.info("  Cena %d <- %s (mtime: %s)",
                     s.order_index, clip.name,
                     time.strftime("%d/%m %H:%M:%S", time.localtime(clip.stat().st_mtime)))


def concat_audio_files(audio_files: list[Path], out: Path) -> None:
    """
    Concatena multiplos arquivos de audio em ordem e normaliza para WAV 44100Hz mono.
    Usado quando o usuario gera um audio por cena (ou por bloco) no AI Studio.
    """
    if len(audio_files) == 1:
        run_ffmpeg(
            ["-i", str(audio_files[0]), "-ar", "44100", "-ac", "1", str(out)],
            desc="normalize single audio"
        )
        return

    # Criar concat list
    concat_txt = out.parent / "_audio_concat.txt"
    lines = [f"file '{f.as_posix()}'" for f in audio_files]
    concat_txt.write_text("\n".join(lines), encoding="utf-8")
    log.info("Concatenando %d arquivos de audio...", len(audio_files))
    run_ffmpeg(
        ["-f", "concat", "-safe", "0", "-i", str(concat_txt),
         "-ar", "44100", "-ac", "1", str(out)],
        desc="concat audio files"
    )


@dataclass
class AssemblyReport:
    scenes: list = field(default_factory=list)
    total_audio_duration: float = 0.0
    total_video_duration: float = 0.0
    adjustments: list = field(default_factory=list)
    tts_time_seconds: float = 0.0
    render_time_seconds: float = 0.0
    output_path: Optional[str] = None


# --------------------------------------------------------------------------- #
# Utilitarios FFmpeg / ffprobe
# --------------------------------------------------------------------------- #
def run_ffmpeg(args: list, desc: str = "") -> subprocess.CompletedProcess:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + args
    log.debug("FFmpeg (%s): %s", desc, " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg falhou ({desc}):\n{result.stderr}")
    return result


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError(f"ffprobe falhou em {path}: {result.stderr}")
    return float(result.stdout.strip())


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / wf.getframerate()


# --------------------------------------------------------------------------- #
# TTS - Gemini 2.5 Flash
# --------------------------------------------------------------------------- #
def generate_tts_block(texts, api_key, voice, style_prompt, out_path):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    full_text = " ".join(t.rstrip() for t in texts)

    log.info("TTS: gerando audio para bloco de %d cenas (%.0f chars) com voz '%s'",
             len(texts), len(full_text), voice)

    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=full_text,
        config=types.GenerateContentConfig(
            system_instruction=style_prompt or "Tom de telejornal brasileiro: voz firme, ritmo moderado, entonacao clara.",
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        ),
    )

    audio_data = response.candidates[0].content.parts[0].inline_data.data
    sample_rate = 24000
    num_channels = 1
    bits_per_sample = 16
    num_samples = len(audio_data) // (bits_per_sample // 8)

    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(num_channels)
        wf.setsampwidth(bits_per_sample // 8)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_data)

    duration = num_samples / sample_rate
    log.info("TTS: audio salvo em %s (%.2f s)", out_path.name, duration)
    return duration


def split_block_audio(block_wav, scenes_in_block, tmp_dir):
    total_chars = sum(len(s.narration_text) for s in scenes_in_block)
    block_duration = wav_duration(block_wav)
    offset = 0.0
    for scene in scenes_in_block:
        ratio = len(scene.narration_text) / total_chars
        dur = round(block_duration * ratio, 4)
        out_wav = tmp_dir / f"scene_{scene.order_index:03d}_audio.wav"
        run_ffmpeg(
            ["-i", str(block_wav),
             "-ss", str(offset), "-t", str(dur),
             "-ar", "44100", "-ac", "1", str(out_wav)],
            desc=f"split audio scene {scene.order_index}"
        )
        scene.audio_path = out_wav
        scene.audio_duration = dur
        offset += dur
        log.info("  Cena %d: audio %.2f s -> %s", scene.order_index, dur, out_wav.name)


# --------------------------------------------------------------------------- #
# Regras 4.1
# --------------------------------------------------------------------------- #
@dataclass
class AdjustmentResult:
    action: str
    final_duration: float
    note: str = ""


def compute_adjustment(clip_duration, audio_duration):
    ratio = audio_duration / clip_duration if clip_duration > 0 else 999
    if ratio <= 1.0:
        diff_pct = 1.0 - ratio
        if diff_pct <= 0.25:
            return AdjustmentResult("cut_clip", audio_duration,
                f"audio {diff_pct*100:.0f}% menor -> cortar clipe em {audio_duration:.2f}s")
        else:
            return AdjustmentResult("cut_and_freeze", audio_duration,
                f"audio muito menor ({diff_pct*100:.0f}%) -> cortar")
    elif ratio <= ADJUST_SLOW_LIMIT:
        return AdjustmentResult("slow_down", audio_duration,
            f"audio {(ratio-1)*100:.0f}% maior -> desacelerar (setpts={ratio:.3f})")
    else:
        return AdjustmentResult("extend_with_freeze", audio_duration,
            f"audio muito maior ({ratio:.2f}x) -> freeze frame")


# --------------------------------------------------------------------------- #
# Renderizacao de segmentos
# --------------------------------------------------------------------------- #
def normalize_input(src, out, duration=None):
    ext = src.suffix.lower()
    is_image = ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp")
    vf = (f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
          f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={TARGET_FPS}")
    if is_image:
        run_ffmpeg(
            ["-loop", "1", "-i", str(src),
             "-t", str(duration),
             "-vf", vf, "-pix_fmt", "yuv420p",
             "-c:v", "libx264", "-preset", "fast", "-crf", "23", str(out)],
            desc=f"normalize image {src.name}"
        )
    else:
        run_ffmpeg(
            ["-i", str(src),
             "-vf", vf, "-pix_fmt", "yuv420p",
             "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-an", str(out)],
            desc=f"normalize video {src.name}"
        )


def apply_animation(normalized_path, out, animation_type, duration):
    """
    Aplica animacao de camera usando scale + crop (muito mais rapido que zoompan)
    Para cenas longas (>30s), usa apenas padding simples sem animacao
    """
    params = ANIMATION_PARAMS.get(animation_type)
    if params is None or animation_type == "none":
        run_ffmpeg(["-i", str(normalized_path), "-c", "copy", str(out)],
                   desc="no-animation copy")
        return

    # Para cenas muito longas (>40s), skip animacao (zoompan seria muito lento)
    if duration > 40:
        log.warning(f"  Cena muito longa ({duration:.0f}s) - pulando animacao para economizar tempo")
        run_ffmpeg(["-i", str(normalized_path), "-c", "copy", str(out)],
                   desc="skip animation on very long scene")
        return
    
    # Para cenas curtas/medias (<30s), usar zoompan otimizado
    nframes = int(duration * TARGET_FPS)
    
    if animation_type == "zoom1":
        # Zoom suave 1.0 -> 1.15
        zoom_expr = "'if(lte(zoom,1.15),zoom+0.0005,1.15)'"
        x_expr = "'iw/2-(iw/zoom/2)'"
        y_expr = "'ih/2-(ih/zoom/2)'"
    elif animation_type == "zoom2":
        # Zoom 1.0 -> 1.20
        zoom_expr = "'if(lte(zoom,1.20),zoom+0.0007,1.20)'"
        x_expr = "'iw/2-(iw/zoom/2)+5'"
        y_expr = "'ih/2-(ih/zoom/2)+3'"
    elif animation_type == "double_zoom":
        # V-curve: sobe e volta
        half_frames = nframes // 2
        zoom_expr = f"'if(lte(on,{half_frames}),1+on*0.15/{half_frames},1.15-(on-{half_frames})*0.15/{half_frames})'"
        x_expr = "'iw/2-(iw/zoom/2)'"
        y_expr = "'ih/2-(ih/zoom/2)'"
    elif animation_type == "bounce":
        # Bounce com amortecimento
        zoom_expr = "'1+0.04*exp(-on/8)*abs(sin(on*0.4))'"
        x_expr = "'iw/2-(iw/zoom/2)'"
        y_expr = "'ih/2-(ih/zoom/2)'"
    else:
        run_ffmpeg(["-i", str(normalized_path), "-c", "copy", str(out)],
                   desc="fallback copy")
        return

    vf = f"zoompan=z={zoom_expr}:x={x_expr}:y={y_expr}:d={nframes}:s={TARGET_WIDTH}x{TARGET_HEIGHT}:fps={TARGET_FPS}"

    # ultrafast para economizar tempo
    run_ffmpeg(
        ["-i", str(normalized_path),
         "-vf", vf, "-pix_fmt", "yuv420p",
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", str(out)],
        desc=f"zoompan {animation_type} ({duration:.0f}s)"
    )



def render_segment(scene, tmp_dir):
    prefix = tmp_dir / f"scene_{scene.order_index:03d}"
    seg_out = prefix.with_suffix(".mp4")

    if scene.media_type == "video_clip" and scene.clip_path and scene.clip_path.exists():
        video_src = scene.clip_path
        is_image_src = False
        log.info("Cena %d: clipe %s", scene.order_index, video_src.name)
    elif scene.image_path and scene.image_path.exists():
        video_src = scene.image_path
        is_image_src = True
        log.info("Cena %d: imagem %s (still)", scene.order_index, video_src.name)
    else:
        raise FileNotFoundError(
            f"Cena {scene.order_index}: nenhum asset encontrado. "
            f"clip={scene.clip_path} img={scene.image_path}"
        )

    audio_dur = scene.audio_duration
    norm_path = Path(str(prefix) + "_norm.mp4")
    normalize_input(video_src, norm_path, audio_dur if is_image_src else None)

    clip_dur = audio_dur if is_image_src else ffprobe_duration(norm_path)
    if is_image_src:
        adj = AdjustmentResult("still_image", audio_dur, "imagem animada")
    else:
        adj = compute_adjustment(clip_dur, audio_dur)
    log.info("  Ajuste: %s", adj.note)

    adjusted_path = Path(str(prefix) + "_adj.mp4")

    if adj.action in ("still_image", "cut_clip", "cut_and_freeze"):
        if adj.action == "still_image":
            adjusted_path = norm_path
        else:
            run_ffmpeg(
                ["-i", str(norm_path), "-t", str(audio_dur), "-c", "copy", str(adjusted_path)],
                desc=f"cut s{scene.order_index}"
            )
    elif adj.action == "slow_down":
        slow_factor = audio_dur / clip_dur
        run_ffmpeg(
            ["-i", str(norm_path),
             "-vf", f"setpts={slow_factor:.4f}*PTS",
             "-t", str(audio_dur),
             "-pix_fmt", "yuv420p",
             "-c:v", "libx264", "-preset", "fast", "-crf", "23", str(adjusted_path)],
            desc=f"slow s{scene.order_index}"
        )
    elif adj.action == "extend_with_freeze":
        slow_factor = ADJUST_SLOW_LIMIT
        slowed_path = Path(str(prefix) + "_slowed.mp4")
        run_ffmpeg(
            ["-i", str(norm_path),
             "-vf", f"setpts={slow_factor:.4f}*PTS",
             "-pix_fmt", "yuv420p",
             "-c:v", "libx264", "-preset", "fast", "-crf", "23", str(slowed_path)],
            desc=f"slow for freeze s{scene.order_index}"
        )
        slowed_dur = clip_dur * slow_factor
        freeze_img = Path(str(prefix) + "_freeze.png")
        run_ffmpeg(
            ["-sseof", "-0.1", "-i", str(slowed_path), "-frames:v", "1", str(freeze_img)],
            desc=f"capture freeze"
        )
        remaining = audio_dur - slowed_dur
        freeze_vid = Path(str(prefix) + "_freezevid.mp4")
        normalize_input(freeze_img, freeze_vid, remaining)
        concat_list = Path(str(prefix) + "_concat.txt")
        concat_list.write_text(f"file '{slowed_path.as_posix()}'\nfile '{freeze_vid.as_posix()}'\n")
        run_ffmpeg(
            ["-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(adjusted_path)],
            desc=f"concat freeze"
        )

    animated_path = Path(str(prefix) + "_anim.mp4")
    apply_animation(adjusted_path, animated_path, scene.animation_type, audio_dur)

    run_ffmpeg(
        ["-i", str(animated_path), "-i", str(scene.audio_path),
         "-map", "0:v:0", "-map", "1:a:0",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(seg_out)],
        desc=f"mux s{scene.order_index}"
    )

    log.info("  Segmento: %s (%.2f s)", seg_out.name, adj.final_duration)
    scene.segment_path = seg_out
    return seg_out


# --------------------------------------------------------------------------- #
# Concatenacao com transicoes xfade
# --------------------------------------------------------------------------- #
def concat_with_transitions(scenes, output_path):
    if len(scenes) == 1:
        import shutil
        shutil.copy(scenes[0].segment_path, output_path)
        return

    xfade_dur   = 0.5
    xfade_short = 0.25

    inputs = []
    for s in scenes:
        inputs += ["-i", str(s.segment_path)]

    filter_parts = []
    for i, s in enumerate(scenes):
        filter_parts.append(f"[{i}:v]setpts=PTS-STARTPTS[v{i}]")
        filter_parts.append(f"[{i}:a]asetpts=PTS-STARTPTS[a{i}]")

    accumulated_dur = scenes[0].audio_duration
    for i in range(1, len(scenes)):
        trans = TRANSITION_MAP.get(scenes[i].transition_in, "dissolve")
        t_dur = xfade_short if trans == "fadewhite" else xfade_dur
        offset = max(0.0, accumulated_dur - t_dur)

        in_v  = f"[xv{i-1}]" if i > 1 else "[v0]"
        out_v = f"[xv{i}]"
        filter_parts.append(
            f"{in_v}[v{i}]xfade=transition={trans}:duration={t_dur}:offset={offset}{out_v}"
        )
        in_a  = f"[xa{i-1}]" if i > 1 else "[a0]"
        out_a = f"[xa{i}]"
        filter_parts.append(
            f"{in_a}[a{i}]acrossfade=d={t_dur}:curve1=tri:curve2=tri{out_a}"
        )
        accumulated_dur += scenes[i].audio_duration - t_dur

    n = len(scenes) - 1
    filter_complex = ";".join(filter_parts)

    cmd = (inputs
           + ["-filter_complex", filter_complex]
           + ["-map", f"[xv{n}]", "-map", f"[xa{n}]"]
           + ["-c:v", "libx264", "-preset", "medium", "-crf", "18",
              "-pix_fmt", "yuv420p",
              "-c:a", "aac", "-b:a", "192k", str(output_path)])

    log.info("Concatenando %d segmentos com xfade...", len(scenes))
    run_ffmpeg(cmd, desc="final concat")
    log.info("Video final: %s", output_path)


# --------------------------------------------------------------------------- #
# Modo B — audio manual: split de um WAV/MP3 unico em fatias por cena
# --------------------------------------------------------------------------- #
# Modo B — audio manual: split de um WAV ja normalizado em fatias por cena
# --------------------------------------------------------------------------- #
def split_manual_audio(normalized_wav: Path, scenes: list, tmp_dir: Path) -> None:
    """
    Divide um WAV ja normalizado (44100Hz mono) proporcionalmente pelo numero
    de caracteres de narration_text de cada cena.
    Preenche scene.audio_path e scene.audio_duration.
    """
    total_dur = wav_duration(normalized_wav)
    total_chars = sum(len(s.narration_text) for s in scenes)
    chars_per_sec = total_chars / total_dur if total_dur > 0 else 0
    log.info("Split de audio: %.2f s | %d chars | %.2f chars/s",
             total_dur, total_chars, chars_per_sec)

    offset = 0.0
    for i, scene in enumerate(scenes):
        ratio = len(scene.narration_text) / total_chars
        # Ultima cena pega o restante exato para nao perder fracao de segundo
        dur = round(total_dur - offset, 4) if i == len(scenes) - 1 else round(total_dur * ratio, 4)

        out_wav = tmp_dir / f"scene_{scene.order_index:03d}_audio.wav"
        run_ffmpeg(
            ["-i", str(normalized_wav),
             "-ss", str(offset), "-t", str(dur),
             "-ar", "44100", "-ac", "1",
             str(out_wav)],
            desc=f"split audio cena {scene.order_index}"
        )
        scene.audio_path = out_wav
        scene.audio_duration = dur
        offset += dur
        log.info("  Cena %d: %.2f s (%d chars) -> %s",
                 scene.order_index, dur, len(scene.narration_text), out_wav.name)


# --------------------------------------------------------------------------- #
# Pipeline principal
# --------------------------------------------------------------------------- #
def run_pipeline(
    scenes_file,
    audio_files=None,  # Modo B: lista de Path (WAV/MP3) gerados manualmente
    api_key="",        # Modo A: chave Gemini TTS
    voice="Charon",
    style_prompt="",
    dry_run=False,
):
    report = AssemblyReport()
    t_start = time.time()

    with open(scenes_file, encoding="utf-8-sig") as f:
        raw_scenes = json.load(f)
    scenes = [Scene.from_dict(d) for d in raw_scenes]
    scenes.sort(key=lambda s: s.order_index)
    log.info("Carregadas %d cenas de %s", len(scenes), scenes_file.name)

    # Auto-atribuir imagens e clipes por mtime quando nao definidos no JSON
    auto_assign_assets(scenes)

    # Validar existencia de assets (apos auto-atribuicao)
    missing = []
    for s in scenes:
        if s.media_type == "video_clip" and s.clip_path and not s.clip_path.exists():
            if s.image_path and s.image_path.exists():
                log.warning("Cena %d: clipe nao encontrado -> fallback para imagem", s.order_index)
                s.media_type = "still_image"
            else:
                missing.append(f"Cena {s.order_index}: clipe={s.clip_path}")
        if s.image_path and not s.image_path.exists():
            missing.append(f"Cena {s.order_index}: imagem={s.image_path}")

    if missing and not dry_run:
        log.error("Assets ausentes:\n  %s", "\n  ".join(missing))
        sys.exit(1)
    elif missing:
        log.warning("[DRY] Assets ausentes (ignorados): %s", missing)

    TMP_DIR.mkdir(exist_ok=True)
    t_audio = time.time()

    # ------------------------------------------------------------------ #
    # AUDIO: Modo B (manual) ou Modo A (TTS API) ou Dry-run
    # ------------------------------------------------------------------ #
    if dry_run:
        log.info("[DRY] Simulando duracoes de audio (~15 chars/s)...")
        for s in scenes:
            s.audio_duration = len(s.narration_text) / 15.0
            s.audio_path = TMP_DIR / f"scene_{s.order_index:03d}_audio.wav"
            log.info("  Cena %d: %.2f s simulados", s.order_index, s.audio_duration)

    elif audio_files is not None:
        # Modo B: audio gerado manualmente no AI Studio
        # Concatenar multiplos arquivos (por blocos) num unico WAV normalizado
        normalized_wav = TMP_DIR / "narration_normalized.wav"
        log.info("Modo B: %d arquivo(s) de audio manual", len(audio_files))
        concat_audio_files(audio_files, normalized_wav)
        split_manual_audio(normalized_wav, scenes, TMP_DIR)

    else:
        # Modo A: TTS via API Gemini
        if not api_key:
            log.error("Modo A requer --key ou GEMINI_API_KEY. Use --audio para modo manual.")
            sys.exit(1)
        blocks = [scenes[i:i+TTS_BLOCK_SIZE] for i in range(0, len(scenes), TTS_BLOCK_SIZE)]
        for b_idx, block in enumerate(blocks):
            log.info("TTS bloco %d/%d...", b_idx+1, len(blocks))
            block_wav = TMP_DIR / f"block_{b_idx:02d}.wav"
            generate_tts_block([s.narration_text for s in block], api_key, voice, style_prompt, block_wav)
            split_block_audio(block_wav, block, TMP_DIR)

    report.tts_time_seconds = time.time() - t_audio
    report.total_audio_duration = sum(s.audio_duration for s in scenes)
    log.info("Audio pronto em %.1f s | Duracao total: %.1f s",
             report.tts_time_seconds, report.total_audio_duration)

    # ------------------------------------------------------------------ #
    # RENDER: um segmento MP4 por cena
    # ------------------------------------------------------------------ #
    t_render = time.time()
    for scene in scenes:
        log.info("--- Renderizando cena %d/%d ---", scene.order_index + 1, len(scenes))
        if dry_run:
            scene.segment_path = TMP_DIR / f"scene_{scene.order_index:03d}.mp4"
            log.info("  [DRY] Simulando %s", scene.segment_path.name)
            continue
        render_segment(scene, TMP_DIR)

    report.render_time_seconds = time.time() - t_render

    # ------------------------------------------------------------------ #
    # CONCATENACAO final com xfade
    # ------------------------------------------------------------------ #
    output_path = OUTPUT_DIR / "final.mp4"
    OUTPUT_DIR.mkdir(exist_ok=True)
    if not dry_run:
        concat_with_transitions(scenes, output_path)
        report.total_video_duration = ffprobe_duration(output_path)
    else:
        log.info("[DRY] Pulando concatenacao.")
        report.total_video_duration = report.total_audio_duration

    report.output_path = str(output_path)
    report.scenes = [
        {"order": s.order_index, "media_type": s.media_type,
         "audio_dur": round(s.audio_duration, 3),
         "animation": s.animation_type, "transition_in": s.transition_in}
        for s in scenes
    ]
    log.info("Pipeline concluido em %.1f s | Video final: %.1f s",
             time.time()-t_start, report.total_video_duration)
    return report


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser(
        description="Video Assembler - Fase 0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  # Modo B - auto-detecta audio(s) em assets/audio/:
  python assembler.py

  # Modo B - audio manual explicito:
  python assembler.py --audio assets/audio/narration.wav

  # Modo A - TTS via API Gemini:
  python assembler.py --key SUA_CHAVE [--voice Charon]

  # Dry-run (sem API nem FFmpeg):
  python assembler.py --dry-run

Assets sem nome no scenes.json sao atribuidos automaticamente
por data de modificacao (mtime) dos arquivos nas pastas.
"""
    )
    # Modo B: audio manual
    parser.add_argument(
        "--audio", default=None, metavar="ARQUIVO",
        help="Caminho para WAV/MP3 manual. Se omitido, procura em assets/audio/ automaticamente."
    )
    # Modo A: TTS via API
    parser.add_argument("--key",   default="", help="Chave API Gemini (Modo A - TTS)")
    parser.add_argument("--voice", default="Charon", help="Voz Gemini TTS (padrao: Charon)")
    parser.add_argument("--style", default="", help="Direcao de voz para TTS")
    # Comuns
    parser.add_argument("--scenes",  default=str(BASE_DIR / "scenes.json"),
                        help="Arquivo de cenas JSON (padrao: scenes.json)")
    parser.add_argument("--output",  default=None,
                        help="Nome do arquivo de saida (padrao: output/final.mp4)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simular fluxo sem chamar APIs nem FFmpeg")
    args = parser.parse_args()

    # Resolver audio: explicito > auto-detectado > nenhum
    audio_files = auto_detect_audio(args.audio)
    api_key = args.key or os.getenv("GEMINI_API_KEY", "")

    if audio_files is None and not api_key and not args.dry_run:
        parser.error(
            "Nenhum audio encontrado. Escolha um modo:\n"
            "  1) Coloque arquivo(s) WAV/MP3 em assets/audio/ (auto-detectado)\n"
            "  2) --audio caminho/para/arquivo.wav\n"
            "  3) --key SUA_CHAVE (TTS via API)\n"
            "  4) --dry-run (simulacao)"
        )

    audio_mode = "manual_audio" if audio_files else ("dry_run" if args.dry_run else "tts_api")
    log.info("Modo: %s", audio_mode)

    report = run_pipeline(
        scenes_file=Path(args.scenes),
        audio_files=audio_files,
        api_key=api_key,
        voice=args.voice,
        style_prompt=args.style,
        dry_run=args.dry_run,
    )

    report_path = OUTPUT_DIR / "assembly_report.json"
    OUTPUT_DIR.mkdir(exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "mode": audio_mode,
            "audio_source": [str(f) for f in audio_files] if audio_files else "simulated",
            "scenes": report.scenes,
            "total_audio_duration_s": round(report.total_audio_duration, 2),
            "total_video_duration_s": round(report.total_video_duration, 2),
            "audio_time_s": round(report.tts_time_seconds, 2),
            "render_time_s": round(report.render_time_seconds, 2),
            "output": report.output_path,
        }, f, indent=2, ensure_ascii=False)
    log.info("Relatorio salvo: %s", report_path)
    if not args.dry_run:
        log.info("Video final:    %s", report.output_path)


if __name__ == "__main__":
    main()
