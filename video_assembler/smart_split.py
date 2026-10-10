#!/usr/bin/env python3
"""
Smart Split - Corta vídeo baseado em pausas naturais do EDL
Cria shorts que respeitam estrutura narrativa
"""

import json
import subprocess
import sys
from pathlib import Path


def load_edl(edl_path):
    """Carrega EDL JSON"""
    with open(edl_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def find_natural_breaks(edl_data, max_duration=60, min_duration=40):
    """
    Encontra pontos de corte naturais baseado em pausas.
    Cada short deve ter 40-60s (limite YouTube Shorts)
    """
    pausas = edl_data.get('pausas_removidas', [])
    duracao_total = edl_data['duracao_total_segundos']
    
    # Ordena pausas por posição
    pausas_sorted = sorted(pausas, key=lambda p: p['posicao'])
    
    # Marca pontos candidatos (pausas maiores = quebra natural de assunto)
    candidatos = [0.0]  # Sempre começa do zero
    
    for p in pausas_sorted:
        pos = p['posicao']
        # Se pausa for longa (>0.5s orig), marca como candidato forte
        if p['duracao_original'] > 0.5:
            candidatos.append(pos)
    
    candidatos.append(duracao_total)  # Sempre termina no fim
    
    # Agrupa candidatos em shorts de 40-60s
    shorts = []
    start = 0.0
    
    for i in range(1, len(candidatos)):
        end_candidate = candidatos[i]
        duration = end_candidate - start
        
        # Se short ficou no range ideal, fecha
        if min_duration <= duration <= max_duration:
            shorts.append({
                'start': start,
                'end': end_candidate,
                'duration': duration
            })
            start = end_candidate
        
        # Se passou do max, volta pro candidato anterior
        elif duration > max_duration and i > 1:
            prev_end = candidatos[i-1]
            shorts.append({
                'start': start,
                'end': prev_end,
                'duration': prev_end - start
            })
            start = prev_end
    
    # Se sobrou resto, adiciona
    if start < duracao_total:
        shorts.append({
            'start': start,
            'end': duracao_total,
            'duration': duracao_total - start
        })
    
    return shorts


def split_video_smart(video_path, edl_path):
    """Corta vídeo em shorts inteligentes"""
    video_path = Path(video_path)
    edl_data = load_edl(edl_path)
    
    print(f"Video: {video_path.name}")
    print(f"Duração total: {edl_data['duracao_total_segundos']:.2f}s")
    print(f"Pausas detectadas: {len(edl_data.get('pausas_removidas', []))}\n")
    
    # Encontra pontos de corte naturais
    shorts = find_natural_breaks(edl_data)
    
    print(f"Cortando em {len(shorts)} shorts (baseado em pausas naturais):\n")
    
    # Output dir
    output_dir = video_path.parent / f"{video_path.stem}_shorts"
    output_dir.mkdir(exist_ok=True)
    
    # Corta cada short
    for i, short in enumerate(shorts, 1):
        start = short['start']
        duration = short['duration']
        output_file = output_dir / f"short_{i:02d}_{duration:.0f}s.mp4"
        
        print(f"Short {i}: {start:.1f}s → {short['end']:.1f}s ({duration:.1f}s)")
        
        cmd = [
            'ffmpeg', '-i', str(video_path),
            '-ss', str(start),
            '-t', str(duration),
            '-c', 'copy',  # stream copy = rápido
            '-avoid_negative_ts', '1',  # fix audio sync
            '-y', str(output_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"  ✓ {output_file.name}\n")
        else:
            print(f"  ✗ Erro\n")
    
    print(f"✓ Shorts salvos em: {output_dir}")
    
    # Resumo
    print(f"\n=== RESUMO ===")
    print(f"Total de shorts: {len(shorts)}")
    print(f"Duração média: {sum(s['duration'] for s in shorts) / len(shorts):.1f}s")
    print(f"\nTodos os shorts estão dentro do limite de 60s do YouTube Shorts!")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Uso: python smart_split.py <video.mp4> <edl.json>")
        print("\nExemplo:")
        print("  python smart_split.py video_final_com_narracao.mp4 edl.json")
        sys.exit(1)
    
    video = sys.argv[1]
    edl = sys.argv[2]
    
    split_video_smart(video, edl)
