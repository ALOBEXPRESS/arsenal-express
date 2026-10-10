#!/usr/bin/env python3
"""
Video Assembler - Ferramenta automática de edição de vídeo
Sincroniza clipes com narração, remove pausas, adiciona textos.
"""

import sys
import argparse
from pathlib import Path

# Adiciona o diretório do script ao path para imports relativos
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from core.config import Config
from core.probe import Probe
from core.edl import EDL
from core.scene_timing import SceneTiming
from core.audio_processor import AudioProcessor
from core.video_processor import VideoProcessor
from core.renderer import Renderer
from utils.ffmpeg_utils import FFmpegUtils
from utils.file_utils import FileUtils
from utils.report import Report


def cmd_doctor(args):
    """Verifica ambiente (Python, FFmpeg, FFprobe, filtros, codecs)"""
    print("=== Verificação do Ambiente ===\n")
    
    # Python
    print(f"OK Python {sys.version.split()[0]}")
    
    # FFmpeg/FFprobe
    ffmpeg_ok, ffmpeg_version = FFmpegUtils.check_ffmpeg()
    ffprobe_ok, ffprobe_version = FFmpegUtils.check_ffprobe()
    
    if not ffmpeg_ok:
        print("X FFmpeg não encontrado. Instale: https://ffmpeg.org/download.html")
        return 1
    print(f"OK FFmpeg {ffmpeg_version}")
    
    if not ffprobe_ok:
        print("X FFprobe não encontrado.")
        return 1
    print(f"OK FFprobe {ffprobe_version}")
    
    # Filtros
    required_filters = ['silencedetect', 'loudnorm', 'sidechaincompress', 'drawtext', 'subtitles']
    filters_ok, missing = FFmpegUtils.check_filters(required_filters)
    if not filters_ok:
        print(f"X Filtros faltando: {', '.join(missing)}")
        return 1
    print(f"OK Filtros: {', '.join(required_filters)}")
    
    # Codecs
    required_codecs = ['libx264', 'aac']
    codecs_ok, missing_codecs = FFmpegUtils.check_codecs(required_codecs)
    if not codecs_ok:
        print(f"X Codecs faltando: {', '.join(missing_codecs)}")
        return 1
    print(f"OK Codecs: {', '.join(required_codecs)}")
    
    # Opcionais
    print("\n=== Recursos Opcionais ===")
    try:
        import yaml
        print("OK PyYAML (config YAML)")
    except ImportError:
        print("o PyYAML não instalado (usará JSON). Instalar: pip install pyyaml")
    
    try:
        import faster_whisper
        print("OK faster-whisper (transcrição auto)")
    except ImportError:
        print("o faster-whisper não instalado (modo 3 desabilitado). Instalar: pip install faster-whisper")
    
    print("\nOK Ambiente pronto!")
    return 0


def cmd_probe(args):
    """Analisa arquivos de vídeo e áudio"""
    config = Config.load_or_create(args.config)
    lote_path = Path(args.lote)
    
    if not lote_path.exists():
        print(f"X Pasta não existe: {lote_path}")
        return 1
    
    probe = Probe(config)
    info = probe.analyze_batch(lote_path, ordem=args.ordem, max_cenas=getattr(args, 'max_cenas', None))
    
    if not info['videos']:
        print(f"X Nenhum vídeo encontrado em {lote_path}")
        return 1
    
    probe.print_analysis(info)
    return 0


def cmd_plan(args):
    """Gera EDL e relatório sem renderizar (modo simulação)"""
    config = Config.load_or_create(args.config)
    lote_path = Path(args.lote)
    
    if not lote_path.exists():
        print(f"X Pasta não existe: {lote_path}")
        return 1
    
    # Análise
    probe = Probe(config)
    info = probe.analyze_batch(lote_path, ordem=args.ordem, max_cenas=getattr(args, 'max_cenas', None))
    
    if not info['videos']:
        print(f"X Nenhum vídeo em {lote_path}")
        return 1
    
    # Narração
    narracao_path = None
    if args.narracao:
        narracao_path = Path(args.narracao)
        if not narracao_path.exists():
            print(f"X Narração não existe: {narracao_path}")
            return 1
    
    # Timing
    scene_timing = SceneTiming(config)
    timing_result = scene_timing.calculate(
        videos=info['videos'],
        narracao_path=narracao_path,
        plano_path=Path(args.plano) if args.plano else None
    )
    
    # EDL
    edl = EDL(config)
    edl_data = edl.create(
        videos=info['videos'],
        timing=timing_result,
        formato=info['formato_detectado'],
        resolucao=info['resolucao_alvo']
    )
    
    # Salvar
    output_dir = FileUtils.create_output_dir(lote_path.name)
    edl_file = output_dir / 'edl.json'
    edl.save(edl_data, edl_file)
    
    # Relatório
    report = Report(config)
    report.generate(edl_data, output_dir)
    
    print(f"\nOK EDL: {edl_file}")
    print(f"OK Relatório: {output_dir / 'relatorio_cortes.md'}")
    print(f"OK CSV: {output_dir / 'relatorio_cortes.csv'}")
    print(f"\nRevise EDL. Depois: python assembler.py preview --lote {args.lote}")
    
    return 0


def cmd_preview(args):
    """Renderiza prévia leve"""
    config = Config.load_or_create(args.config)
    lote_path = Path(args.lote)
    
    # Achar EDL mais recente
    edl_file = FileUtils.find_latest_edl(lote_path.name)
    if not edl_file:
        print(f"X EDL não existe. Rode: python assembler.py plan --lote {args.lote}")
        return 1
    
    edl = EDL(config)
    edl_data = edl.load(edl_file)
    
    output_dir = edl_file.parent
    preview_dir = output_dir / 'previa'
    preview_dir.mkdir(exist_ok=True)
    
    renderer = Renderer(config)
    preview_file = renderer.render_preview(
        edl_data=edl_data,
        output_dir=preview_dir,
        timecode=args.timecode
    )
    
    if preview_file:
        print(f"\nOK Prévia: {preview_file}")
        print(f"Aprovou? Rode: python assembler.py render --lote {args.lote}")
        return 0
    else:
        print("\nX Falha na prévia. Veja logs.")
        return 1


def cmd_render(args):
    """Renderiza vídeo final"""
    config = Config.load_or_create(args.config)
    lote_path = Path(args.lote)
    
    # EDL
    edl_file = FileUtils.find_latest_edl(lote_path.name)
    if not edl_file:
        print(f"X EDL não existe. Rode: python assembler.py plan --lote {args.lote}")
        return 1
    
    edl = EDL(config)
    edl_data = edl.load(edl_file)
    
    output_dir = edl_file.parent
    
    # Confirma se EDL mudou desde última prévia
    preview_dir = output_dir / 'previa'
    if not args.yes and preview_dir.exists():
        edl_mtime = edl_file.stat().st_mtime
        preview_files = list(preview_dir.glob('*.mp4'))
        if preview_files:
            preview_mtime = max(f.stat().st_mtime for f in preview_files)
            if edl_mtime > preview_mtime:
                print("⚠ EDL mudou desde última prévia.")
                resp = input("Continuar? (s/N): ")
                if resp.lower() != 's':
                    print("Cancelado. Rode preview primeiro.")
                    return 0
    
    final_dir = output_dir / 'final'
    final_dir.mkdir(exist_ok=True)
    
    renderer = Renderer(config)
    final_file = renderer.render_final(
        edl_data=edl_data,
        output_dir=final_dir
    )
    
    if final_file:
        print(f"\nOK Vídeo final: {final_file}")
        return 0
    else:
        print("\nX Falha no render. Veja logs.")
        return 1


def cmd_package(args):
    """Organiza pasta de saída"""
    lote_path = Path(args.lote)
    output_dir = FileUtils.find_latest_output_dir(lote_path.name)
    
    if not output_dir:
        print(f"X Nenhuma saída encontrada para {lote_path.name}")
        return 1
    
    # Criar para_capcut/
    capcut_dir = output_dir / 'para_capcut'
    capcut_dir.mkdir(exist_ok=True)
    
    # Copiar final
    final_dir = output_dir / 'final'
    if final_dir.exists():
        for mp4 in final_dir.glob('*.mp4'):
            FileUtils.copy_file(mp4, capcut_dir / mp4.name)
    
    # Copiar narração tratada (se existir)
    # Copiar SRT (se existir)
    srt_file = output_dir / 'legendas.srt'
    if srt_file.exists():
        FileUtils.copy_file(srt_file, capcut_dir / 'legendas.srt')
    
    print(f"OK Pacote CapCut: {capcut_dir}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description='Video Assembler - Edição automática de vídeo',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python assembler.py doctor
  python assembler.py probe --lote projeto1
  python assembler.py plan --lote projeto1 --narracao audios/audio1.wav
  python assembler.py preview --lote projeto1
  python assembler.py render --lote projeto1
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Comando')
    
    # doctor
    subparsers.add_parser('doctor', help='Verifica ambiente')
    
    # probe
    probe_parser = subparsers.add_parser('probe', help='Analisa arquivos')
    probe_parser.add_argument('--lote', required=True, help='Pasta com vídeos (ex: projeto1)')
    probe_parser.add_argument('--config', default='config.yaml', help='Arquivo de config')
    probe_parser.add_argument('--ordem', choices=['numero', 'data-criacao', 'data-modificacao', 'nome'],
                             help='Critério de ordenação')
    probe_parser.add_argument('--max-cenas', type=int, help='Limita a N primeiros vídeos')
    
    # plan
    plan_parser = subparsers.add_parser('plan', help='Gera EDL (simulação)')
    plan_parser.add_argument('--lote', required=True, help='Pasta com vídeos')
    plan_parser.add_argument('--narracao', help='Arquivo de narração (WAV/MP3)')
    plan_parser.add_argument('--plano', help='Arquivo de plano de cenas (MD/JSON)')
    plan_parser.add_argument('--config', default='config.yaml', help='Arquivo de config')
    plan_parser.add_argument('--ordem', choices=['numero', 'data-criacao', 'data-modificacao', 'nome'],
                             help='Critério de ordenação')
    plan_parser.add_argument('--max-cenas', type=int, help='Limita a N primeiros vídeos')
    
    # preview
    preview_parser = subparsers.add_parser('preview', help='Renderiza prévia')
    preview_parser.add_argument('--lote', required=True, help='Pasta com vídeos')
    preview_parser.add_argument('--config', default='config.yaml', help='Arquivo de config')
    preview_parser.add_argument('--timecode', action='store_true', help='Mostrar timecode')
    
    # render
    render_parser = subparsers.add_parser('render', help='Renderiza final')
    render_parser.add_argument('--lote', required=True, help='Pasta com vídeos')
    render_parser.add_argument('--config', default='config.yaml', help='Arquivo de config')
    render_parser.add_argument('--yes', action='store_true', help='Não pedir confirmação')
    
    # package
    package_parser = subparsers.add_parser('package', help='Organiza saída')
    package_parser.add_argument('--lote', required=True, help='Pasta com vídeos')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    commands = {
        'doctor': cmd_doctor,
        'probe': cmd_probe,
        'plan': cmd_plan,
        'preview': cmd_preview,
        'render': cmd_render,
        'package': cmd_package
    }
    
    return commands[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
