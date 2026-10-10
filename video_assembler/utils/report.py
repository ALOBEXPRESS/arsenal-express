"""Report - gera MD e CSV de cortes/ajustes"""

import csv
from pathlib import Path
from typing import Dict


class Report:
    """Gerador de relatórios"""
    
    def __init__(self, config):
        self.config = config
    
    def generate(self, edl_data: Dict, output_dir: Path):
        """Gera relatorio_cortes.md e .csv"""
        md_path = output_dir / 'relatorio_cortes.md'
        csv_path = output_dir / 'relatorio_cortes.csv'
        
        # MD
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write("# Relatório de Cortes e Ajustes\n\n")
            f.write(f"**Projeto:** {edl_data.get('projeto', 'N/A')}\n")
            f.write(f"**Formato:** {edl_data.get('formato_saida', 'N/A')}\n")
            f.write(f"**Duração total:** {edl_data.get('duracao_total_segundos', 0):.2f}s\n\n")
            
            f.write("## Cenas\n\n")
            f.write("| Cena | Arquivo | Ajuste | Motivo |\n")
            f.write("|------|---------|--------|--------|\n")
            
            for item in edl_data.get('timeline', []):
                cena = item['cena']
                arquivo = Path(item['arquivo_origem']).name
                ajuste = item.get('ajuste_aplicado', 'nenhum')
                motivo = item.get('motivo', '')
                f.write(f"| {cena} | {arquivo} | {ajuste} | {motivo} |\n")
            
            if edl_data.get('pausas_removidas'):
                f.write("\n## Pausas Removidas\n\n")
                f.write("| Posição | Original | Final | Removido | Motivo |\n")
                f.write("|---------|----------|-------|----------|---------|\n")
                for p in edl_data['pausas_removidas']:
                    f.write(f"| {p['posicao']:.2f}s | {p['duracao_original']:.2f}s | {p['duracao_final']:.2f}s | {p['removido']:.2f}s | {p['motivo']} |\n")
            
            if edl_data.get('avisos'):
                f.write("\n## Avisos\n\n")
                for aviso in edl_data['avisos']:
                    f.write(f"- ⚠ {aviso}\n")
        
        # CSV
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Cena', 'Arquivo', 'Tempo_Inicio', 'Tempo_Fim', 'Duracao', 'Ajuste', 'Motivo'])
            
            for item in edl_data.get('timeline', []):
                writer.writerow([
                    item['cena'],
                    Path(item['arquivo_origem']).name,
                    f"{item['tempo_inicio_clipe']:.2f}",
                    f"{item['tempo_fim_clipe']:.2f}",
                    f"{item['duracao_final']:.2f}",
                    item.get('ajuste_aplicado', 'nenhum'),
                    item.get('motivo', '')
                ])
