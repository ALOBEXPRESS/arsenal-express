"""Config - carrega/cria YAML ou JSON com defaults"""

import json
from pathlib import Path
from typing import Any, Dict


# Config padrão
DEFAULT_CONFIG = {
    'formato': {
        'saida': 'auto',  # auto, 16:9, 9:16
        'resolucao_horizontal': [1920, 1080],
        'resolucao_vertical': [1080, 1920],
        'fps_saida': 30
    },
    'cenas': {
        'modo_timing': 1,  # 1=duracao, 2=marcacoes, 3=transcricao
        'duracao_padrao': 6.6,  # segundos por cena
        'excecoes': {}  # {cena_num: duracao}
    },
    'audio': {
        'silencio': {
            'duracao_min': 0.45,  # segundos
            'nivel_db': -35,
            'pausa_alvo': 0.25,  # encurtar pausas para este valor
            'margem_seguranca': 0.10  # segundos antes/depois
        },
        'narracao': {
            'loudness_lufs': -14,
            'compressao': False
        },
        'clipes': {
            'modo': 'baixo',  # silenciar, baixo, manter
            'volume_db': -18  # quando modo=baixo
        },
        'musica': {
            'ativa': False,
            'volume_db': -20,
            'ducking': True,
            'fade_entrada': 2.0,
            'fade_saida': 3.0
        }
    },
    'ajuste_duracao': {
        'quando_clipe_maior': 'cortar_fim',
        'quando_clipe_menor': 'segurar_frame',
        'limite_segurar': 1.0,  # segundos max
        'limite_desacelerar': 0.8  # velocidade min (0.8x)
    },
    'textos': {
        'fonte': 'Arial',
        'tamanho': 48,
        'cor': 'white',
        'contorno_cor': 'black',
        'contorno_largura': 2,
        'margens_shorts': {
            'inferior': 200,  # px do fundo (UI)
            'lateral': 40
        },
        'margens_horizontal': {
            'superior': 60,
            'inferior': 60,
            'lateral': 80
        }
    },
    'efeitos': {
        'preset': 'limpo',  # limpo, basico, dinamico
        'transicoes': {
            'ativa': False,
            'duracao': 0.15
        },
        'zoom': {
            'ativo': False,
            'intensidade': 1.05,
            'cenas_aplicar': []  # lista de nums
        }
    },
    'render': {
        'codec_video': 'libx264',
        'codec_audio': 'aac',
        'crf': 18,
        'preset': 'medium',
        'audio_bitrate': '192k',
        'pix_fmt': 'yuv420p'
    },
    'preview': {
        'altura': 540,
        'crf': 28,
        'preset': 'fast'
    }
}


class Config:
    """Gerencia configuração"""
    
    def __init__(self, data: Dict[str, Any]):
        self.data = data
    
    def get(self, path: str, default=None):
        """Pega valor aninhado tipo 'audio.silencio.duracao_min'"""
        keys = path.split('.')
        val = self.data
        for k in keys:
            if isinstance(val, dict) and k in val:
                val = val[k]
            else:
                return default
        return val
    
    def set(self, path: str, value):
        """Define valor aninhado"""
        keys = path.split('.')
        d = self.data
        for k in keys[:-1]:
            if k not in d:
                d[k] = {}
            d = d[k]
        d[keys[-1]] = value
    
    @staticmethod
    def load_or_create(path: str) -> 'Config':
        """
        Carrega config. Se não existe, cria com defaults.
        Tenta YAML primeiro, fallback JSON.
        """
        config_path = Path(path)
        
        if config_path.exists():
            # Tenta YAML
            try:
                import yaml
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
                    return Config(data)
            except ImportError:
                pass
            
            # Fallback JSON
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return Config(data)
        else:
            # Cria novo
            config = Config(DEFAULT_CONFIG.copy())
            config.save(config_path)
            print(f"OK Config criado: {config_path}")
            return config
    
    def save(self, path: Path):
        """Salva config"""
        # Tenta YAML
        try:
            import yaml
            with open(path, 'w', encoding='utf-8') as f:
                yaml.dump(self.data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            return
        except ImportError:
            pass
        
        # Fallback JSON
        json_path = path.with_suffix('.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
