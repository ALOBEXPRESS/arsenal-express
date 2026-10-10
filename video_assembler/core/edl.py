"""EDL - cria/carrega/salva Edit Decision List (JSON)"""

import json
from pathlib import Path
from typing import Dict, List


class EDL:
    """Gerencia EDL (lista de decisões de edição)"""
    
    def __init__(self, config):
        self.config = config
    
    def create(self, videos: List[Dict], timing: Dict, formato: str, resolucao: List[int]) -> Dict:
        """
        Cria EDL a partir de vídeos + timing.
        Calcula ajustes (cortar/segurar/desacelerar) quando clipe != narração.
        """
        timeline = []
        pausas_removidas = []
        avisos = []
        
        # Pausas
        for p in timing.get('pausas_detectadas', []):
            pausa_alvo = self.config.get('audio.silencio.pausa_alvo', 0.25)
            if p['duration'] > pausa_alvo:
                pausas_removidas.append({
                    'posicao': p['start'],
                    'duracao_original': p['duration'],
                    'duracao_final': pausa_alvo,
                    'removido': p['duration'] - pausa_alvo,
                    'motivo': 'Silêncio longo encurtado para pausa-alvo'
                })
        
        # Cenas
        for i, v in enumerate(videos):
            cena_num = v['cena_num']
            clipe_path = v['path']
            clipe_info = v['info']
            clipe_dur = clipe_info['duration']
            
            # Timing da narração para esta cena
            cena_timing = timing['cenas'][i]
            narracao_dur = cena_timing['duracao']
            
            # Ajuste
            ajuste, motivo = self._calculate_adjustment(clipe_dur, narracao_dur, avisos, cena_num)
            
            # Textos (placeholder - ler de plano no futuro)
            textos_tela = []
            
            timeline.append({
                'cena': cena_num,
                'arquivo_origem': str(clipe_path),
                'tempo_inicio_clipe': 0.0,
                'tempo_fim_clipe': min(clipe_dur, narracao_dur),
                'posicao_timeline': cena_timing['tempo_inicio'],
                'duracao_final': narracao_dur,
                'ajuste_aplicado': ajuste,
                'motivo': motivo,
                'textos_tela': textos_tela
            })
        
        # Duração total
        duracao_total = timing['duracao_narracao_pos_cortes']
        
        # Aviso se > 180s (limite Shorts)
        if formato == '9:16' and duracao_total > 180:
            avisos.append(f'Duração {duracao_total:.1f}s excede limite de Shorts (180s)')
        
        return {
            'version': '1.0',
            'projeto': 'projeto',  # placeholder
            'formato_saida': formato,
            'resolucao_saida': resolucao,
            'fps_saida': self.config.get('formato.fps_saida', 30),
            'duracao_total_segundos': duracao_total,
            'timeline': timeline,
            'pausas_removidas': pausas_removidas,
            'avisos': avisos
        }
    
    def _calculate_adjustment(self, clipe_dur: float, narracao_dur: float, avisos: List[str], cena_num: int) -> tuple:
        """
        Calcula ajuste necessário quando clipe != narração.
        Retorna (ajuste_str, motivo_str)
        """
        diff = abs(clipe_dur - narracao_dur)
        
        # Tolerância 0.1s = OK
        if diff < 0.1:
            return 'nenhum', f'Clipe {clipe_dur:.1f}s = narração {narracao_dur:.1f}s'
        
        if clipe_dur > narracao_dur:
            # Clipe maior: cortar fim
            return 'cortado_fim', f'Clipe {clipe_dur:.1f}s, narração {narracao_dur:.1f}s — cortou {diff:.1f}s do fim'
        
        else:
            # Clipe menor: segurar frame ou desacelerar
            limite_segurar = self.config.get('ajuste_duracao.limite_segurar', 1.0)
            limite_desacelerar = self.config.get('ajuste_duracao.limite_desacelerar', 0.8)
            
            if diff <= limite_segurar:
                return 'segurar_frame', f'Clipe {clipe_dur:.1f}s, narração {narracao_dur:.1f}s — último frame segurado por {diff:.1f}s'
            else:
                # Tenta desacelerar
                velocidade_necessaria = clipe_dur / narracao_dur
                if velocidade_necessaria >= limite_desacelerar:
                    return 'desacelerar', f'Clipe {clipe_dur:.1f}s → {narracao_dur:.1f}s (velocidade {velocidade_necessaria:.2f}x)'
                else:
                    avisos.append(f'Cena {cena_num}: clipe muito curto ({clipe_dur:.1f}s vs {narracao_dur:.1f}s) — regerar clipe')
                    return 'segurar_frame', f'Clipe muito curto — segurar frame (não ideal)'
    
    def save(self, edl_data: Dict, path: Path):
        """Salva EDL em JSON"""
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(edl_data, f, indent=2, ensure_ascii=False)
    
    def load(self, path: Path) -> Dict:
        """Carrega EDL"""
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
