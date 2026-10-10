"""
Test script for the video render worker

This script tests the worker functions without requiring full Celery setup
"""

import json
from pathlib import Path
from app.worker import (
    execute_ffmpeg,
    replace_asset_paths_in_command,
)


def test_ffmpeg_execution():
    """Test FFmpeg execution with a simple command"""
    print("Testing FFmpeg execution...")
    
    # Simple test: create a 5-second black video
    output_path = Path("test_output.mp4")
    
    command = 'ffmpeg -f lavfi -i color=c=black:s=1920x1080:d=5 -c:v libx264 -preset ultrafast'
    
    def progress_callback(progress):
        print(f"Progress: {progress * 100:.1f}%")
    
    success = execute_ffmpeg(
        render_id="test",
        ffmpeg_command=command,
        output_path=output_path,
        on_progress=progress_callback
    )
    
    if success and output_path.exists():
        print(f"✅ FFmpeg test passed! Output: {output_path}")
        print(f"   File size: {output_path.stat().st_size / 1024:.1f} KB")
        
        # Cleanup
        output_path.unlink()
        return True
    else:
        print("❌ FFmpeg test failed!")
        return False


def test_path_replacement():
    """Test asset path replacement in FFmpeg command"""
    print("\nTesting path replacement...")
    
    # Mock asset paths
    asset_paths = {
        "scene_0_media": Path("/tmp/render_123/scene_0_media.mp4"),
        "scene_0_audio": Path("/tmp/render_123/scene_0_audio.mp3"),
        "scene_1_media": Path("/tmp/render_123/scene_1_media.jpg"),
    }
    
    # Mock FFmpeg command
    original_command = '''ffmpeg -i "scene_0_media.mp4" -i "scene_0_audio.mp3" -i "scene_1_media.jpg" output.mp4'''
    
    updated_command = replace_asset_paths_in_command(original_command, asset_paths)
    
    print(f"Original: {original_command}")
    print(f"Updated:  {updated_command}")
    
    # Check if paths were replaced
    if "/tmp/render_123" in updated_command:
        print("✅ Path replacement test passed!")
        return True
    else:
        print("❌ Path replacement test failed!")
        return False


def test_ffmpeg_progress_parsing():
    """Test that FFmpeg progress can be parsed from real output"""
    print("\nTesting FFmpeg progress parsing...")
    
    # Create a 10-second video with multiple inputs to test progress
    output_path = Path("test_progress.mp4")
    
    command = '''ffmpeg -f lavfi -i color=c=blue:s=1280x720:d=10 -c:v libx264 -preset ultrafast'''
    
    progress_updates = []
    
    def progress_callback(progress):
        progress_updates.append(progress)
        print(f"Progress update: {progress * 100:.1f}%")
    
    success = execute_ffmpeg(
        render_id="test_progress",
        ffmpeg_command=command,
        output_path=output_path,
        on_progress=progress_callback
    )
    
    if success and len(progress_updates) > 0:
        print(f"✅ Progress parsing test passed! Received {len(progress_updates)} updates")
        print(f"   Progress range: {min(progress_updates) * 100:.1f}% - {max(progress_updates) * 100:.1f}%")
        
        # Cleanup
        if output_path.exists():
            output_path.unlink()
        return True
    else:
        print("❌ Progress parsing test failed!")
        if output_path.exists():
            output_path.unlink()
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Backend Worker Tests")
    print("=" * 60)
    
    results = []
    
    # Run tests
    results.append(("FFmpeg Execution", test_ffmpeg_execution()))
    results.append(("Path Replacement", test_path_replacement()))
    results.append(("Progress Parsing", test_ffmpeg_progress_parsing()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    total_passed = sum(1 for _, passed in results if passed)
    print(f"\nTotal: {total_passed}/{len(results)} tests passed")
    
    if total_passed == len(results):
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️ Some tests failed. Check the output above.")
