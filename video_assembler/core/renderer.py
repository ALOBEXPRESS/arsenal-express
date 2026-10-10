"""Renderer - monta vídeo final com FFmpeg"""

from pathlib import Path
from typing import Dict, Optional
from utils.ffmpeg_utils import FFmpegUtils


class Renderer:
    """Renderiza vídeo"""
    
    def __init__(self, config):
        self.config = config
    
    def render_preview(self, edl_data: Dict, output_dir: Path, timecode: bool = False) -> Optional[Path]:
        """
        Renderiza prévia leve com filter_complex.
        """
        w, h = edl_data['resolucao_saida']
        altura_preview = self.config.get('preview.altura', 540)
        
        # Mantém proporção
        if h > w:  # vertical
            h_new = altura_preview
            w_new = int(w * (h_new / h))
        else:  # horizontal
            w_new = int(w * (altura_preview / h))
            h_new = altura_preview
        
        # H.264 precisa dimensões pares
        w_new = w_new + (w_new % 2)
        h_new = h_new + (h_new % 2)
        
        output_file = output_dir / f'previa_{w_new}x{h_new}.mp4'
        
        # Constrói filter_complex
        filter_parts = []
        fps = edl_data['fps_saida']
        
        # Para cada cena: normaliza + trim + scale
        for i, item in enumerate(edl_data['timeline']):
            t_start = item['tempo_inicio_clipe']
            t_end = item['tempo_fim_clipe']
            
            # Normaliza: fps, scale, setsar, trim
            vf = (
                f"[{i}:v]fps={fps},"
                f"scale={w_new}:{h_new}:flags=fast_bilinear,"
                f"setsar=1,"
                f"setpts=PTS-STARTPTS,"
                f"trim=start={t_start}:end={t_end},"
                f"setpts=PTS-STARTPTS"
                f"[v{i}]"
            )
            filter_parts.append(vf)
            
            # Audio
            af = (
                f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                f"asetpts=PTS-STARTPTS,"
                f"atrim=start={t_start}:end={t_end},"
                f"asetpts=PTS-STARTPTS"
                f"[a{i}]"
            )
            filter_parts.append(af)
        
        # Concat todos
        n = len(edl_data['timeline'])
        concat_inputs = ''.join(f'[v{i}][a{i}]' for i in range(n))
        concat_filter = f"{concat_inputs}concat=n={n}:v=1:a=1[vout][aout]"
        filter_parts.append(concat_filter)
        
        filter_complex = ';'.join(filter_parts)
        
        # Comando FFmpeg
        cmd = ['ffmpeg']
        
        # Inputs
        for item in edl_data['timeline']:
            cmd.extend(['-i', str(Path(item['arquivo_origem']).resolve())])
        
        cmd.extend([
            '-filter_complex', filter_complex,
            '-map', '[vout]',
            '-map', '[aout]',
            '-c:v', 'libx264',
            '-preset', self.config.get('preview.preset', 'fast'),
            '-crf', str(self.config.get('preview.crf', 28)),
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            str(output_file)
        ])
        
        print(f"Renderizando previa...")
        code, out, err = FFmpegUtils.run_command(cmd, check=False, timeout=600)
        
        if code == 0 and output_file.exists():
            return output_file
        else:
            print(f"X Erro no render:")
            print(err[-800:] if len(err) > 800 else err)
            # Salva log
            log_file = output_dir.parent / 'logs' / 'ffmpeg_preview_error.log'
            log_file.parent.mkdir(exist_ok=True)
            log_file.write_text(err, encoding='utf-8')
            print(f"Log salvo: {log_file}")
            return None
    
    def render_final(self, edl_data: Dict, output_dir: Path) -> Optional[Path]:
        """
        Renderiza vídeo final com filter_complex completo.
        """
        w, h = edl_data['resolucao_saida']
        output_file = output_dir / f'video_final_{w}x{h}.mp4'
        
        # Constrói filter_complex
        filter_parts = []
        fps = edl_data['fps_saida']
        
        # Para cada cena: normaliza + trim + scale
        for i, item in enumerate(edl_data['timeline']):
            t_start = item['tempo_inicio_clipe']
            t_end = item['tempo_fim_clipe']
            
            # Video: fps, scale, setsar, trim
            vf = (
                f"[{i}:v]fps={fps},"
                f"scale={w}:{h}:flags=lanczos,"
                f"setsar=1,"
                f"setpts=PTS-STARTPTS,"
                f"trim=start={t_start}:end={t_end},"
                f"setpts=PTS-STARTPTS"
            )
            
            # Se precisa segurar frame
            if item.get('ajuste_aplicado') == 'segurar_frame':
                duracao_final = item['duracao_final']
                duracao_clipe = t_end - t_start
                segurar = duracao_final - duracao_clipe
                if segurar > 0:
                    vf += f",tpad=stop_mode=clone:stop_duration={segurar}"
            
            vf += f"[v{i}]"
            filter_parts.append(vf)
            
            # Audio: resample, trim, fade
            af = (
                f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                f"asetpts=PTS-STARTPTS,"
                f"atrim=start={t_start}:end={t_end},"
                f"asetpts=PTS-STARTPTS,"
                f"afade=t=in:st=0:d=0.01,"
                f"afade=t=out:st={t_end-t_start-0.01}:d=0.01"
                f"[a{i}]"
            )
            filter_parts.append(af)
        
        # Concat
        n = len(edl_data['timeline'])
        concat_inputs = ''.join(f'[v{i}][a{i}]' for i in range(n))
        concat_filter = f"{concat_inputs}concat=n={n}:v=1:a=1[vout][aout]"
        filter_parts.append(concat_filter)
        
        filter_complex = ';'.join(filter_parts)
        
        # Comando FFmpeg
        cmd = ['ffmpeg']
        
        # Inputs
        for item in edl_data['timeline']:
            cmd.extend(['-i', str(Path(item['arquivo_origem']).resolve())])
        
        cmd.extend([
            '-filter_complex', filter_complex,
            '-map', '[vout]',
            '-map', '[aout]',
            '-c:v', self.config.get('render.codec_video', 'libx264'),
            '-preset', self.config.get('render.preset', 'medium'),
            '-crf', str(self.config.get('render.crf', 18)),
            '-pix_fmt', self.config.get('render.pix_fmt', 'yuv420p'),
            '-c:a', self.config.get('render.codec_audio', 'aac'),
            '-b:a', self.config.get('render.audio_bitrate', '192k'),
            '-movflags', '+faststart',
            '-y',
            str(output_file)
        ])
        
        print(f"Renderizando final (isso pode demorar)...")
        code, out, err = FFmpegUtils.run_command(cmd, check=False, timeout=3600)
        
        if code == 0 and output_file.exists():
            # Valida duração
            info = FFmpegUtils.probe_file(output_file)
            if info:
                diff = abs(info['duration'] - edl_data['duracao_total_segundos'])
                if diff > (1.0 / edl_data['fps_saida']):  # > 1 frame
                    print(f"! Diferenca de duracao: {diff:.2f}s")
                else:
                    print(f"OK Duracao validada: {info['duration']:.2f}s")
            
            return output_file
        else:
            print(f"X Erro no render:")
            print(err[-800:] if len(err) > 800 else err)
            # Salva log
            log_file = output_dir.parent / 'logs' / 'ffmpeg_render_error.log'
            log_file.parent.mkdir(exist_ok=True)
            log_file.write_text(err, encoding='utf-8')
            print(f"Log salvo: {log_file}")
            return None
