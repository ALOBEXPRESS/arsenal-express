"""Probe - analisa vídeos/áudio, detecta formato"""

import hashlib
import tempfile
from pathlib import Path
from typing import Dict, List, Optional
from utils.ffmpeg_utils import FFmpegUtils
from utils.file_utils import FileUtils


class Probe:
    """Análise de arquivos"""
    
    def __init__(self, config):
        self.config = config
    
    def _get_video_fingerprint(self, video_path: Path) -> Optional[str]:
        """
        Extrai fingerprint visual do video (frame @ 1s ou mid-point).
        Usa dhash (difference hash) simples pra detecção de duplicatas.
        """
        try:
            info = FFmpegUtils.probe_file(video_path)
            if not info:
                return None
            
            # Pega frame @ 1s ou metade
            timestamp = min(1.0, info['duration'] / 2)
            
            # Extrai frame 9x8 px (dhash precisa)
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                tmp_path = Path(tmp.name)
            
            cmd = [
                'ffmpeg', '-i', str(video_path),
                '-ss', str(timestamp),
                '-vframes', '1',
                '-vf', 'scale=9:8,format=gray',
                '-y', str(tmp_path)
            ]
            
            code, _, _ = FFmpegUtils.run_command(cmd, check=False, timeout=10)
            
            if code == 0 and tmp_path.exists():
                # dhash: compara pixels adjacentes
                try:
                    from PIL import Image
                    img = Image.open(tmp_path).convert('L')
                    pixels = list(img.getdata())
                    
                    # 9x8 → 72 pixels → 8x8=64 comparações
                    diff = []
                    for row in range(8):
                        for col in range(8):
                            idx = row * 9 + col
                            left = pixels[idx]
                            right = pixels[idx + 1]
                            diff.append(left > right)
                    
                    # Converte bool list → hex string
                    hash_int = 0
                    for i, b in enumerate(diff):
                        if b:
                            hash_int |= (1 << i)
                    
                    dhash = f"{hash_int:016x}"
                    tmp_path.unlink()
                    return dhash
                    
                except ImportError:
                    # Fallback: MD5 com threshold maior
                    with open(tmp_path, 'rb') as f:
                        frame_hash = hashlib.md5(f.read()).hexdigest()
                    tmp_path.unlink()
                    return frame_hash
            
            if tmp_path.exists():
                tmp_path.unlink()
            return None
            
        except Exception:
            return None
    
    def _is_duplicate(self, fingerprint: str, used: List[str], threshold: int = 10) -> bool:
        """
        Checa se fingerprint é duplicata (hamming distance < threshold).
        dhash: threshold=10 → até 10 bits diferentes (de 64) = ~85% similar
        MD5 fallback: threshold=10 → até 10 chars diferentes (muito permissivo, evita false positives)
        """
        for existing in used:
            if len(fingerprint) == 16 and len(existing) == 16:
                # dhash: hamming em bits
                try:
                    bits1 = int(fingerprint, 16)
                    bits2 = int(existing, 16)
                    hamming = bin(bits1 ^ bits2).count('1')
                    if hamming <= threshold:
                        return True
                except ValueError:
                    pass
            else:
                # MD5 fallback: char diff
                diff_count = sum(c1 != c2 for c1, c2 in zip(fingerprint, existing))
                if diff_count <= threshold:
                    return True
        return False
    
    def analyze_batch(self, lote_path: Path, ordem: Optional[str] = None, max_cenas: Optional[int] = None) -> Dict:
        """
        Analisa lote de vídeos.
        Retorna: {
            'videos': [{path, info, cena_num}],
            'formato_detectado': '9:16' | '16:9',
            'resolucao_alvo': [w, h],
            'fps_predominante': 30,
            'avisos': []
        }
        """
        videos = FileUtils.list_videos(lote_path)
        if not videos:
            return {'videos': [], 'avisos': ['Nenhum vídeo encontrado']}
        
        # Ordena
        if ordem == 'numero':
            videos, criterio = FileUtils.sort_videos_by_scene_number(videos)
        elif ordem == 'data-criacao':
            videos = FileUtils.sort_videos_by_date(videos, use_ctime=True)
            criterio = 'data_criacao'
        elif ordem == 'data-modificacao':
            videos = FileUtils.sort_videos_by_date(videos, use_ctime=False)
            criterio = 'data_modificacao'
        elif ordem == 'nome':
            videos = sorted(videos, key=lambda p: p.name)
            criterio = 'nome_alfabetico'
        else:
            # Auto: tenta número, senão data criação
            videos, criterio = FileUtils.sort_videos_by_scene_number(videos)
            if criterio == 'nome_original':
                videos = FileUtils.sort_videos_by_date(videos, use_ctime=True)
                criterio = 'data_criacao'
        
        # Analisa cada
        video_data = []
        avisos = []
        usado_fingerprints = []  # Track fingerprints para evitar duplicatas visuais
        
        # Limitar se max_cenas especificado
        videos_to_process = videos[:max_cenas] if max_cenas else videos
        if max_cenas and len(videos) > max_cenas:
            avisos.append(f'Limitado a primeiros {max_cenas} vídeos (total: {len(videos)})')
        
        for i, v in enumerate(videos_to_process, 1):
            info = FFmpegUtils.probe_file(v)
            if not info:
                avisos.append(f'Falha ao analisar: {v.name}')
                continue
            
            # Extrai fingerprint visual (frame mid-point) pra detectar duplicatas
            fingerprint = self._get_video_fingerprint(v)
            
            # Checa se já usamos cena similar
            if fingerprint and self._is_duplicate(fingerprint, usado_fingerprints):
                avisos.append(f'Duplicata visual ignorada: {v.name}')
                continue
            
            if fingerprint:
                usado_fingerprints.append(fingerprint)
            
            video_data.append({
                'path': v,
                'info': info,
                'cena_num': len(video_data) + 1  # Renumera após dedup
            })
        
        if not video_data:
            return {'videos': [], 'avisos': avisos + ['Nenhum vídeo analisável']}
        
        # Detecta formato predominante
        orientacoes = [v['info']['orientacao'] for v in video_data]
        vertical_count = orientacoes.count('vertical')
        horizontal_count = orientacoes.count('horizontal')
        
        if vertical_count > horizontal_count:
            formato = '9:16'
            resolucao = self.config.get('formato.resolucao_vertical', [1080, 1920])
        else:
            formato = '16:9'
            resolucao = self.config.get('formato.resolucao_horizontal', [1920, 1080])
        
        # FPS predominante
        fps_list = [v['info']['fps'] for v in video_data if v['info']['fps'] > 0]
        fps_predominante = max(set(fps_list), key=fps_list.count) if fps_list else 30
        
        # Avisos de inconsistência
        if vertical_count > 0 and horizontal_count > 0:
            avisos.append(f'Mix de orientações: {vertical_count} vertical, {horizontal_count} horizontal')
        
        fps_unicos = set(fps_list)
        if len(fps_unicos) > 1:
            avisos.append(f'FPS variável detectado: {fps_unicos}')
        
        return {
            'videos': video_data,
            'formato_detectado': formato,
            'resolucao_alvo': resolucao,
            'fps_predominante': fps_predominante,
            'criterio_ordem': criterio,
            'avisos': avisos
        }
    
    def print_analysis(self, info: Dict):
        """Imprime análise formatada"""
        print(f"\n=== Análise do Lote ===\n")
        print(f"Vídeos encontrados: {len(info['videos'])}")
        print(f"Ordenação: {info.get('criterio_ordem', 'auto')}")
        print(f"Formato detectado: {info['formato_detectado']}")
        print(f"Resolução alvo: {info['resolucao_alvo'][0]}x{info['resolucao_alvo'][1]}")
        print(f"FPS predominante: {info['fps_predominante']}")
        
        if info.get('avisos'):
            print(f"\nAvisos:")
            for aviso in info['avisos']:
                print(f"  - {aviso}")
        
        print(f"\n{'Cena':<6} {'Arquivo':<40} {'Duração':<10} {'Resolução':<12} {'FPS':<6} {'Áudio'}")
        print("-" * 90)
        
        for v in info['videos']:
            nome = v['path'].name[:37] + '...' if len(v['path'].name) > 40 else v['path'].name
            dur = f"{v['info']['duration']:.2f}s"
            res = f"{v['info']['width']}x{v['info']['height']}"
            fps = f"{v['info']['fps']:.1f}"
            audio = 'OK' if v['info']['has_audio'] else 'X'
            
            print(f"{v['cena_num']:<6} {nome:<40} {dur:<10} {res:<12} {fps:<6} {audio}")
        
        print()
