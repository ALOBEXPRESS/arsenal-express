from celery import Celery
from celery.utils.log import get_task_logger
import json
import subprocess
from pathlib import Path
from typing import Dict, Any
import time

from app.config import settings
from app.supabase_client import get_supabase_client

logger = get_task_logger(__name__)

# Create Celery app
celery_app = Celery(
    "video_assembler",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(bind=True, name="process_render")
def process_render_task(self, render_id: str, project_id: str):
    """
    Main task to process a video render
    
    Steps:
    1. Fetch render data from Supabase
    2. Download assets from Supabase Storage
    3. Generate FFmpeg command
    4. Execute FFmpeg with progress tracking
    5. Upload output to Supabase Storage
    6. Update render status
    """
    logger.info(f"Processing render: {render_id}")
    
    supabase = get_supabase_client()
    
    try:
        # Update status to processing
        update_render_status(supabase, render_id, "processing", 0)
        
        # 1. Fetch render data
        logger.info("Fetching render data...")
        render_data = fetch_render_data(supabase, render_id)
        
        if not render_data:
            raise Exception("Render not found")
        
        # 2. Download assets
        logger.info("Downloading assets...")
        update_render_status(supabase, render_id, "processing", 10, "Downloading assets...")
        asset_paths = download_assets(supabase, render_data)
        
        # 3. Parse FFmpeg command and replace paths
        logger.info("Preparing FFmpeg command...")
        update_render_status(supabase, render_id, "processing", 20, "Preparing video...")
        ffmpeg_command = render_data.get("ffmpeg_command", "")
        
        # Replace storage paths with local paths in FFmpeg command
        ffmpeg_command = replace_asset_paths_in_command(ffmpeg_command, asset_paths)
        
        # 4. Execute FFmpeg
        logger.info("Rendering video...")
        update_render_status(supabase, render_id, "processing", 30, "Rendering video...")
        
        output_path = settings.render_output_dir / f"{render_id}.mp4"
        
        # Execute with progress tracking
        success = execute_ffmpeg(
            render_id=render_id,
            ffmpeg_command=ffmpeg_command,
            output_path=output_path,
            on_progress=lambda progress: update_render_status(
                supabase, render_id, "processing", 30 + (progress * 0.6)
            )
        )
        
        if not success:
            raise Exception("FFmpeg execution failed")
        
        # 5. Upload output
        logger.info("Uploading final video...")
        update_render_status(supabase, render_id, "processing", 95, "Uploading video...")
        output_url = upload_output(supabase, render_id, output_path)
        
        # 6. Complete
        logger.info("Render completed!")
        complete_render(supabase, render_id, output_url)
        
        # Cleanup (remove temp directory and output file)
        temp_dir = settings.render_output_dir / f"temp_{render_id}"
        cleanup_temp_files(temp_dir, output_path)
        
        return {
            "render_id": render_id,
            "status": "completed",
            "output_url": output_url
        }
        
    except Exception as e:
        logger.error(f"Render failed: {e}")
        fail_render(supabase, render_id, str(e))
        raise


def fetch_render_data(supabase, render_id: str) -> Dict[str, Any]:
    """Fetch render data from Supabase"""
    response = supabase.table("renders").select("*").eq("id", render_id).single().execute()
    return response.data


def download_assets(supabase, render_data: Dict[str, Any]) -> Dict[str, Path]:
    """Download assets from Supabase Storage to temp directory"""
    import os
    
    render_id = render_data.get("id")
    temp_dir = settings.render_output_dir / f"temp_{render_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Parse scenes JSON
    scenes_json = render_data.get("scenes_json", "{}")
    if isinstance(scenes_json, str):
        scenes_data = json.loads(scenes_json)
    else:
        scenes_data = scenes_json
    
    scenes = scenes_data.get("scenes", [])
    
    asset_paths = {}
    
    for i, scene in enumerate(scenes):
        scene_id = scene.get("id", f"scene_{i}")
        
        # Download media (video/image)
        media = scene.get("media", {})
        if media and media.get("storage_path"):
            storage_path = media.get("storage_path")
            file_type = media.get("type", "video")
            ext = ".mp4" if file_type == "video" else ".jpg"
            
            try:
                # Download from Supabase Storage
                logger.info(f"Downloading media: {storage_path}")
                file_data = supabase.storage.from_("media").download(storage_path)
                
                # Save to temp directory
                local_path = temp_dir / f"{scene_id}_media{ext}"
                with open(local_path, "wb") as f:
                    f.write(file_data)
                
                asset_paths[f"{scene_id}_media"] = local_path
                logger.info(f"Downloaded media to: {local_path}")
                
            except Exception as e:
                logger.error(f"Failed to download media {storage_path}: {e}")
        
        # Download audio
        audio = scene.get("audio", {})
        if audio and audio.get("storage_path"):
            storage_path = audio.get("storage_path")
            
            try:
                # Download from Supabase Storage
                logger.info(f"Downloading audio: {storage_path}")
                file_data = supabase.storage.from_("media").download(storage_path)
                
                # Save to temp directory
                local_path = temp_dir / f"{scene_id}_audio.mp3"
                with open(local_path, "wb") as f:
                    f.write(file_data)
                
                asset_paths[f"{scene_id}_audio"] = local_path
                logger.info(f"Downloaded audio to: {local_path}")
                
            except Exception as e:
                logger.error(f"Failed to download audio {storage_path}: {e}")
    
    return asset_paths


def execute_ffmpeg(
    render_id: str,
    ffmpeg_command: str,
    output_path: Path,
    on_progress=None
) -> bool:
    """
    Execute FFmpeg command with progress tracking
    
    Parses FFmpeg stderr output to track progress based on time=XX:XX:XX
    """
    try:
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Replace placeholder with actual output path
        if "{output}" in ffmpeg_command:
            ffmpeg_command = ffmpeg_command.replace("{output}", str(output_path))
        else:
            # If no placeholder, append output path
            ffmpeg_command += f' "{output_path}"'
        
        logger.info(f"Executing FFmpeg command: {ffmpeg_command}")
        
        # Execute FFmpeg
        process = subprocess.Popen(
            ffmpeg_command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Track progress by parsing stderr
        total_duration = None
        last_progress = 0
        
        while True:
            line = process.stderr.readline()
            
            if not line:
                break
            
            # Parse duration from first lines (Duration: HH:MM:SS.ms)
            if "Duration:" in line and total_duration is None:
                try:
                    duration_str = line.split("Duration:")[1].split(",")[0].strip()
                    h, m, s = duration_str.split(":")
                    total_duration = int(h) * 3600 + int(m) * 60 + float(s)
                    logger.info(f"Total duration: {total_duration}s")
                except:
                    pass
            
            # Parse current time (time=HH:MM:SS.ms)
            if "time=" in line and total_duration:
                try:
                    time_str = line.split("time=")[1].split()[0]
                    h, m, s = time_str.split(":")
                    current_time = int(h) * 3600 + int(m) * 60 + float(s)
                    
                    progress = min(current_time / total_duration, 1.0)
                    
                    # Only update if progress increased by at least 5%
                    if progress - last_progress >= 0.05:
                        last_progress = progress
                        if on_progress:
                            on_progress(progress)
                        logger.info(f"Progress: {progress * 100:.1f}%")
                except:
                    pass
        
        # Wait for process to complete
        return_code = process.wait()
        
        if return_code != 0:
            stderr = process.stderr.read()
            logger.error(f"FFmpeg failed with code {return_code}: {stderr}")
            return False
        
        # Verify output file exists
        if not output_path.exists():
            logger.error("Output file was not created")
            return False
        
        logger.info(f"FFmpeg completed successfully. Output: {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"FFmpeg execution failed: {e}")
        return False


def upload_output(supabase, render_id: str, output_path: Path) -> str:
    """Upload final video to Supabase Storage"""
    try:
        # Verify file exists
        if not output_path.exists():
            raise Exception(f"Output file not found: {output_path}")
        
        # Read file data
        with open(output_path, "rb") as f:
            file_data = f.read()
        
        # Upload to Supabase Storage (renders bucket)
        storage_path = f"renders/{render_id}.mp4"
        
        logger.info(f"Uploading video to Storage: {storage_path}")
        
        supabase.storage.from_("renders").upload(
            path=storage_path,
            file=file_data,
            file_options={
                "content-type": "video/mp4",
                "upsert": "true"  # Overwrite if exists
            }
        )
        
        # Get public URL
        public_url = supabase.storage.from_("renders").get_public_url(storage_path)
        
        logger.info(f"Video uploaded successfully: {public_url}")
        
        return public_url
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise


def update_render_status(
    supabase,
    render_id: str,
    status: str,
    progress: float,
    message: str = None
):
    """Update render status in Supabase"""
    try:
        data = {
            "status": status,
            "progress": progress,
        }
        if message:
            data["message"] = message
        
        supabase.table("renders").update(data).eq("id", render_id).execute()
        
    except Exception as e:
        logger.error(f"Failed to update status: {e}")


def complete_render(supabase, render_id: str, output_url: str):
    """Mark render as completed"""
    supabase.table("renders").update({
        "status": "completed",
        "progress": 100,
        "output_url": output_url,
    }).eq("id", render_id).execute()


def fail_render(supabase, render_id: str, error_message: str):
    """Mark render as failed"""
    supabase.table("renders").update({
        "status": "failed",
        "progress": 0,
        "error_message": error_message,
    }).eq("id", render_id).execute()


def replace_asset_paths_in_command(ffmpeg_command: str, asset_paths: Dict[str, Path]) -> str:
    """
    Replace Supabase Storage paths with local downloaded file paths in FFmpeg command
    
    Example:
    Input: ffmpeg -i "https://...supabase.co/media/scene1.mp4" ...
    Output: ffmpeg -i "/tmp/render_xxx/scene1_media.mp4" ...
    """
    updated_command = ffmpeg_command
    
    # Replace each asset path
    for asset_key, local_path in asset_paths.items():
        # Convert Path to string with proper escaping
        local_path_str = str(local_path).replace("\\", "/")
        
        # The asset_key format is "{scene_id}_media" or "{scene_id}_audio"
        # We need to find and replace the corresponding URL in the command
        # For simplicity, we'll replace any occurrence of the asset filename
        
        # Extract filename from path
        filename = local_path.name
        
        # Replace in command (handles both quoted and unquoted paths)
        updated_command = updated_command.replace(f'"{filename}"', f'"{local_path_str}"')
        updated_command = updated_command.replace(f"'{filename}'", f'"{local_path_str}"')
        
    logger.info(f"Updated FFmpeg command with local paths")
    
    return updated_command


def cleanup_temp_files(*paths):
    """Cleanup temporary files and directories"""
    import shutil
    
    for path in paths:
        if isinstance(path, dict):
            # Cleanup dictionary of paths
            for p in path.values():
                if isinstance(p, Path):
                    try:
                        if p.is_file() and p.exists():
                            p.unlink()
                            logger.info(f"Deleted temp file: {p}")
                        elif p.is_dir() and p.exists():
                            shutil.rmtree(p)
                            logger.info(f"Deleted temp directory: {p}")
                    except Exception as e:
                        logger.warning(f"Failed to cleanup {p}: {e}")
        elif isinstance(path, Path):
            try:
                if path.is_file() and path.exists():
                    path.unlink()
                    logger.info(f"Deleted file: {path}")
                elif path.is_dir() and path.exists():
                    shutil.rmtree(path)
                    logger.info(f"Deleted directory: {path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup {path}: {e}")
