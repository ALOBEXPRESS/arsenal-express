"""Audio processor - normalização, silêncio, ducking"""

from pathlib import Path
from typing import Dict, List, Optional
from utils.ffmpeg_utils import FFmpegUtils


class AudioProcessor:
    """Processa áudio"""
    
    def __init__(self, config):
        self.config = config
    
    def build_audio_filter(self, edl_data: Dict, narracao_path: Optional[Path], musica_path: Optional[Path]) -> str:
        """
        Constrói filtro de áudio completo.
        Retorna string de filter_complex para áudio.
        """
        filters = []
        
        # TODO: implementar mixing de clipes + narração + música
        # Por ora: placeholder simples
        
        # Se tiver narração, normaliza
        if narracao_path:
            # loudnorm
            lufs = self.config.get('audio.narracao.loudness_lufs', -14)
            filters.append(f'[1:a]loudnorm=I={lufs}:TP=-1.5:LRA=11[a_narracao]')
        
        # Placeholder: retorna narração normalizada
        return ';'.join(filters) if filters else ''
