#!/usr/bin/env python3
"""
Split Video - Corta vídeo em N partes iguais
Uso: python split_video.py <video.mp4> [num_partes]
"""

import sys
import subprocess
from pathlib import Path


def get_duration(video_path):
    """Pega duração do vídeo em segundos"""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        str(video_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return float(result.stdout.strip())


def split_video(video_path, num_parts=3):
    """Corta vídeo em N partes iguais"""
    video_path = Path(video_path)
    
    if not video_path.exists():
        print(f"Erro: Video não existe: {video_path}")
        return
    
    # Duração total
    duration = get_duration(video_path)
    part_duration = duration / num_parts
    
    print(f"Video: {video_path.name}")
    print(f"Duração total: {duration:.2f}s")
    print(f"Cortando em {num_parts} partes de {part_duration:.2f}s cada\n")
    
    # Output dir
    output_dir = video_path.parent / f"{video_path.stem}_partes"
    output_dir.mkdir(exist_ok=True)
    
    # Corta cada parte
    for i in range(num_parts):
        start_time = i * part_duration
        output_file = output_dir / f"parte_{i+1:02d}.mp4"
        
        print(f"Cortando parte {i+1}/{num_parts} ({start_time:.2f}s - {start_time + part_duration:.2f}s)...")
        
        cmd = [
            'ffmpeg', '-i', str(video_path),
            '-ss', str(start_time),
            '-t', str(part_duration),
            '-c', 'copy',  # stream copy = rápido, sem re-encode
            '-y', str(output_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"  ✓ {output_file.name}")
        else:
            print(f"  ✗ Erro: {result.stderr[-200:]}")
    
    print(f"\n✓ Partes salvas em: {output_dir}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python split_video.py <video.mp4> [num_partes]")
        print("\nExemplo:")
        print("  python split_video.py video_final.mp4       # corta em 3 partes")
        print("  python split_video.py video_final.mp4 5     # corta em 5 partes")
        sys.exit(1)
    
    video = sys.argv[1]
    parts = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    
    split_video(video, parts)
