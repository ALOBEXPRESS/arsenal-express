"""Video processor - normalização, cortes, ajustes"""

from typing import Dict, List


class VideoProcessor:
    """Processa vídeo"""
    
    def __init__(self, config):
        self.config = config
    
    def build_video_filter(self, edl_data: Dict) -> str:
        """
        Constrói filtro de vídeo completo.
        Normaliza FPS, scale, trim, concat.
        """
        # TODO: implementar filter_complex completo
        # Por ora: placeholder
        
        fps = edl_data['fps_saida']
        w, h = edl_data['resolucao_saida']
        
        # Placeholder: scale + fps
        filters = []
        for i, item in enumerate(edl_data['timeline']):
            filters.append(f'[{i}:v]fps={fps},scale={w}:{h}:flags=lanczos,setsar=1[v{i}]')
        
        return ';'.join(filters)
