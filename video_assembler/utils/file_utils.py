"""File/folder utils - paths seguros, output dirs, backups"""

import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List
import re


class FileUtils:
    """Utils para arquivos"""
    
    @staticmethod
    def create_output_dir(lote_name: str, base_dir: Optional[Path] = None) -> Path:
        """
        Cria pasta de saída: saida_[lote]_YYYYMMDD_HHMMSS
        Se já existe, adiciona _2, _3...
        """
        if base_dir is None:
            base_dir = Path.cwd()
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        dir_name = f'saida_{lote_name}_{timestamp}'
        output_dir = base_dir / dir_name
        
        counter = 2
        while output_dir.exists():
            output_dir = base_dir / f'{dir_name}_{counter}'
            counter += 1
        
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir
    
    @staticmethod
    def find_latest_output_dir(lote_name: str, base_dir: Optional[Path] = None) -> Optional[Path]:
        """Acha pasta de saída mais recente para um lote"""
        if base_dir is None:
            base_dir = Path.cwd()
        
        pattern = f'saida_{lote_name}_*'
        dirs = sorted(base_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        return dirs[0] if dirs else None
    
    @staticmethod
    def find_latest_edl(lote_name: str, base_dir: Optional[Path] = None) -> Optional[Path]:
        """Acha EDL mais recente"""
        output_dir = FileUtils.find_latest_output_dir(lote_name, base_dir)
        if not output_dir:
            return None
        
        edl_file = output_dir / 'edl.json'
        return edl_file if edl_file.exists() else None
    
    @staticmethod
    def list_videos(folder: Path, extensions: List[str] = None) -> List[Path]:
        """Lista vídeos em pasta"""
        if extensions is None:
            extensions = ['.mp4', '.mov', '.avi', '.mkv']
        
        videos = []
        for ext in extensions:
            videos.extend(folder.glob(f'*{ext}'))
            videos.extend(folder.glob(f'*{ext.upper()}'))
        
        return videos
    
    @staticmethod
    def extract_scene_number(filename: str) -> Optional[int]:
        """
        Extrai número de cena de nome tipo Cena_01, cena_1, Cena01, etc.
        Case-insensitive. Retorna None se não achar padrão.
        """
        # Padrão: cena seguido de número (com ou sem underscore/hífen)
        patterns = [
            r'cena[_-]?(\d+)',
            r'scene[_-]?(\d+)',
        ]
        
        filename_lower = filename.lower()
        for pattern in patterns:
            match = re.search(pattern, filename_lower)
            if match:
                return int(match.group(1))
        
        return None
    
    @staticmethod
    def sort_videos_by_scene_number(videos: List[Path]) -> tuple[List[Path], str]:
        """
        Ordena vídeos por número de cena se todos tiverem.
        Retorna (lista_ordenada, critério_usado)
        """
        numbered = []
        for v in videos:
            num = FileUtils.extract_scene_number(v.stem)
            if num is not None:
                numbered.append((num, v))
            else:
                # Se algum não tiver número, não ordena por número
                return videos, 'nome_original'
        
        # Se todos tiverem número
        if len(numbered) == len(videos):
            sorted_videos = [v for _, v in sorted(numbered, key=lambda x: x[0])]
            return sorted_videos, 'numero_cena'
        else:
            return videos, 'nome_original'
    
    @staticmethod
    def sort_videos_by_date(videos: List[Path], use_ctime=True) -> List[Path]:
        """Ordena por data de criação (ctime) ou modificação (mtime)"""
        if use_ctime:
            return sorted(videos, key=lambda p: p.stat().st_ctime)
        else:
            return sorted(videos, key=lambda p: p.stat().st_mtime)
    
    @staticmethod
    def copy_file(src: Path, dst: Path):
        """Copia arquivo"""
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    
    @staticmethod
    def safe_filename(name: str) -> str:
        """Remove caracteres problemáticos de filename"""
        # Remove/substitui caracteres que podem dar problema
        name = re.sub(r'[<>:"/\\|?*]', '_', name)
        return name
