"""Scene timing - calcula quando cada cena começa/termina na narração"""

from pathlib import Path
from typing import Dict, List, Optional
from utils.ffmpeg_utils import FFmpegUtils


class SceneTiming:
    """Calcula timing de cenas"""
    
    def __init__(self, config):
        self.config = config
    
    def calculate(self, videos: List[Dict], narracao_path: Optional[Path], plano_path: Optional[Path]) -> Dict:
        """
        Calcula timing. Retorna: {
            'modo': 1|2|3,
            'duracao_narracao_original': float,
            'duracao_narracao_pos_cortes': float,
            'pausas_detectadas': [{start, end, duration}],
            'cenas': [{cena_num, tempo_inicio, tempo_fim, duracao}]
        }
        """
        modo = self.config.get('cenas.modo_timing', 1)
        
        if modo == 1:
            return self._calculate_mode1(videos, narracao_path)
        elif modo == 2:
            return self._calculate_mode2(videos, narracao_path, plano_path)
        elif modo == 3:
            return self._calculate_mode3(videos, narracao_path, plano_path)
        else:
            raise ValueError(f"Modo inválido: {modo}")
    
    def _calculate_mode1(self, videos: List[Dict], narracao_path: Optional[Path]) -> Dict:
        """
        Modo 1: Duração fixa por cena (padrão).
        Se narração existe, detecta pausas e encurta.
        Divide narração pós-corte igualmente (ou com exceções).
        """
        num_cenas = len(videos)
        duracao_padrao = self.config.get('cenas.duracao_padrao', 6.6)
        excecoes = self.config.get('cenas.excecoes', {})
        
        if not narracao_path or not narracao_path.exists():
            # Sem narração: usa duração padrão
            cenas = []
            tempo_acum = 0.0
            for v in videos:
                cena_num = v['cena_num']
                duracao = excecoes.get(str(cena_num), excecoes.get(cena_num, duracao_padrao))
                cenas.append({
                    'cena_num': cena_num,
                    'tempo_inicio': tempo_acum,
                    'tempo_fim': tempo_acum + duracao,
                    'duracao': duracao
                })
                tempo_acum += duracao
            
            return {
                'modo': 1,
                'duracao_narracao_original': tempo_acum,
                'duracao_narracao_pos_cortes': tempo_acum,
                'pausas_detectadas': [],
                'cenas': cenas
            }
        
        # Com narração: detecta pausas
        narracao_info = FFmpegUtils.probe_file(narracao_path)
        if not narracao_info:
            raise ValueError(f"Falha ao analisar narração: {narracao_path}")
        
        duracao_original = narracao_info['duration']
        
        # Detecta silêncios
        silence_dur = self.config.get('audio.silencio.duracao_min', 0.45)
        silence_level = self.config.get('audio.silencio.nivel_db', -35)
        pausas = FFmpegUtils.detect_silence(
            narracao_path,
            silence_dur,
            silence_level,
            self.config.data
        )
        
        # Calcula tempo removido (encurtar pausas) — SE HABILITADO
        pausa_alvo = self.config.get('audio.silencio.pausa_alvo', 0.25)
        remover_pausas = self.config.get('audio.silencio.remover_pausas', True)
        
        tempo_removido = 0.0
        if remover_pausas:
            for p in pausas:
                if p['duration'] > pausa_alvo:
                    tempo_removido += (p['duration'] - pausa_alvo)
        
        duracao_pos_cortes = duracao_original - tempo_removido
        
        # CRITICAL FIX: usa AUDIO DURATION TOTAL como constraint
        # Não divide cegamente — video DEVE ser >= audio pra não cortar
        
        # Soma durações (padrão + exceções)
        duracoes_cenas = []
        for v in videos:
            cena_num = v['cena_num']
            dur = excecoes.get(str(cena_num), excecoes.get(cena_num, None))
            if dur is None:
                # Calcula automático: divide tempo restante igualmente entre cenas sem exceção
                duracoes_cenas.append(None)
            else:
                duracoes_cenas.append(dur)
        
        # Tempo reservado por exceções
        tempo_excecoes = sum(d for d in duracoes_cenas if d is not None)
        cenas_sem_excecao = sum(1 for d in duracoes_cenas if d is None)
        
        if cenas_sem_excecao > 0:
            tempo_restante = duracao_pos_cortes - tempo_excecoes
            duracao_auto = tempo_restante / cenas_sem_excecao if tempo_restante > 0 else duracao_padrao
        else:
            duracao_auto = duracao_padrao
        
        # Monta cenas
        cenas = []
        tempo_acum = 0.0
        for i, v in enumerate(videos):
            cena_num = v['cena_num']
            dur = duracoes_cenas[i] if duracoes_cenas[i] is not None else duracao_auto
            cenas.append({
                'cena_num': cena_num,
                'tempo_inicio': tempo_acum,
                'tempo_fim': tempo_acum + dur,
                'duracao': dur
            })
            tempo_acum += dur
        
        # FIX: se video final < audio, extend última cena
        video_duration_calculated = tempo_acum
        if video_duration_calculated < duracao_pos_cortes:
            diff = duracao_pos_cortes - video_duration_calculated
            cenas[-1]['duracao'] += diff
            cenas[-1]['tempo_fim'] += diff
            print(f"⚠ Video estendido +{diff:.2f}s pra match audio total ({duracao_pos_cortes:.2f}s)")
        
        return {
            'modo': 1,
            'duracao_narracao_original': duracao_original,
            'duracao_narracao_pos_cortes': duracao_pos_cortes,
            'pausas_detectadas': pausas,
            'cenas': cenas
        }
    
    def _calculate_mode2(self, videos: List[Dict], narracao_path: Optional[Path], plano_path: Optional[Path]) -> Dict:
        """
        Modo 2: Marcações manuais (JSON com {cena, tempo_inicio}).
        TODO: implementar quando necessário.
        """
        raise NotImplementedError("Modo 2 (marcações manuais) não implementado ainda.")
    
    def _calculate_mode3(self, videos: List[Dict], narracao_path: Optional[Path], plano_path: Optional[Path]) -> Dict:
        """
        Modo 3: Transcrição automática + alinhamento.
        TODO: implementar quando necessário (requer faster-whisper).
        """
        raise NotImplementedError("Modo 3 (transcrição auto) não implementado ainda. Instale faster-whisper.")
