"""FFmpeg/FFprobe utils - chamadas seguras, verificações"""

import subprocess
import re
from typing import Tuple, List, Optional
from pathlib import Path


class FFmpegUtils:
    """Utils para FFmpeg/FFprobe"""
    
    @staticmethod
    def run_command(cmd: List[str], check=True, capture=True, timeout=None) -> Tuple[int, str, str]:
        """
        Executa comando. Retorna (exit_code, stdout, stderr).
        Paths com espaços/acentos OK. Sem shell=True (seguro).
        """
        try:
            result = subprocess.run(
                cmd,
                capture_output=capture,
                text=True,
                timeout=timeout,
                check=False  # Controla manualmente
            )
            if check and result.returncode != 0:
                return result.returncode, result.stdout, result.stderr
            return result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return -1, '', f'Timeout após {timeout}s'
        except FileNotFoundError:
            return -1, '', f'Comando não encontrado: {cmd[0]}'
        except Exception as e:
            return -1, '', str(e)
    
    @staticmethod
    def check_ffmpeg() -> Tuple[bool, str]:
        """Verifica se FFmpeg existe. Retorna (ok, versão)"""
        code, out, err = FFmpegUtils.run_command(['ffmpeg', '-version'], check=False)
        if code != 0:
            return False, ''
        # Parse version
        match = re.search(r'ffmpeg version (\S+)', out)
        version = match.group(1) if match else 'unknown'
        return True, version
    
    @staticmethod
    def check_ffprobe() -> Tuple[bool, str]:
        """Verifica FFprobe"""
        code, out, err = FFmpegUtils.run_command(['ffprobe', '-version'], check=False)
        if code != 0:
            return False, ''
        match = re.search(r'ffprobe version (\S+)', out)
        version = match.group(1) if match else 'unknown'
        return True, version
    
    @staticmethod
    def check_filters(required: List[str]) -> Tuple[bool, List[str]]:
        """Verifica se filtros existem. Retorna (ok, missing)"""
        code, out, err = FFmpegUtils.run_command(['ffmpeg', '-filters'], check=False)
        if code != 0:
            return False, required
        
        missing = []
        for filt in required:
            if filt not in out:
                missing.append(filt)
        
        return len(missing) == 0, missing
    
    @staticmethod
    def check_codecs(required: List[str]) -> Tuple[bool, List[str]]:
        """Verifica codecs"""
        code, out, err = FFmpegUtils.run_command(['ffmpeg', '-encoders'], check=False)
        if code != 0:
            return False, required
        
        missing = []
        for codec in required:
            if codec not in out:
                missing.append(codec)
        
        return len(missing) == 0, missing
    
    @staticmethod
    def probe_file(file_path: Path) -> Optional[dict]:
        """
        Analisa arquivo com ffprobe.
        Retorna dict com: duration, width, height, fps, codec_video, codec_audio,
        has_audio, channels, sample_rate, orientacao
        """
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,r_frame_rate,codec_name,duration',
            '-of', 'default=noprint_wrappers=1',
            str(file_path)
        ]
        
        code, out, err = FFmpegUtils.run_command(cmd, check=False)
        if code != 0:
            return None
        
        info = {}
        for line in out.strip().split('\n'):
            if '=' in line:
                key, val = line.split('=', 1)
                info[key] = val
        
        # Audio
        cmd_audio = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=codec_name,channels,sample_rate',
            '-of', 'default=noprint_wrappers=1',
            str(file_path)
        ]
        
        code_a, out_a, _ = FFmpegUtils.run_command(cmd_audio, check=False)
        has_audio = code_a == 0 and out_a.strip() != ''
        
        audio_info = {}
        if has_audio:
            for line in out_a.strip().split('\n'):
                if '=' in line:
                    key, val = line.split('=', 1)
                    audio_info[key] = val
        
        # Duration do container
        cmd_dur = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(file_path)
        ]
        code_dur, out_dur, _ = FFmpegUtils.run_command(cmd_dur, check=False)
        duration = float(out_dur.strip()) if code_dur == 0 and out_dur.strip() else 0.0
        
        # Parse FPS
        fps_str = info.get('r_frame_rate', '0/1')
        if '/' in fps_str:
            num, den = fps_str.split('/')
            fps = float(num) / float(den) if float(den) > 0 else 0.0
        else:
            fps = float(fps_str) if fps_str else 0.0
        
        width = int(info.get('width', 0))
        height = int(info.get('height', 0))
        
        # Orientação
        if width > 0 and height > 0:
            ratio = width / height
            if ratio > 1.5:
                orientacao = 'horizontal'  # 16:9
            elif ratio < 0.75:
                orientacao = 'vertical'    # 9:16
            else:
                orientacao = 'quadrado'
        else:
            orientacao = 'unknown'
        
        return {
            'duration': duration,
            'width': width,
            'height': height,
            'fps': fps,
            'codec_video': info.get('codec_name', ''),
            'codec_audio': audio_info.get('codec_name', ''),
            'has_audio': has_audio,
            'channels': int(audio_info.get('channels', 0)),
            'sample_rate': int(audio_info.get('sample_rate', 0)),
            'orientacao': orientacao
        }
    
    @staticmethod
    def detect_silence(audio_path: Path, silence_dur: float, silence_level: int, config: dict) -> List[dict]:
        """
        Detecta silêncios. Retorna lista de [{start, end, duration}]
        """
        cmd = [
            'ffmpeg',
            '-i', str(audio_path),
            '-af', f'silencedetect=n={silence_level}dB:d={silence_dur}',
            '-f', 'null',
            '-'
        ]
        
        code, out, err = FFmpegUtils.run_command(cmd, check=False, timeout=300)
        
        silences = []
        lines = err.split('\n')
        
        current = {}
        for line in lines:
            if 'silence_start' in line:
                match = re.search(r'silence_start: ([\d.]+)', line)
                if match:
                    current = {'start': float(match.group(1))}
            elif 'silence_end' in line and current:
                match_end = re.search(r'silence_end: ([\d.]+)', line)
                match_dur = re.search(r'silence_duration: ([\d.]+)', line)
                if match_end:
                    current['end'] = float(match_end.group(1))
                    current['duration'] = current['end'] - current['start']
                    if match_dur:
                        current['duration'] = float(match_dur.group(1))
                    silences.append(current)
                    current = {}
        
        return silences
