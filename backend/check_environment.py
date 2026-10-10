#!/usr/bin/env python3
"""
Environment Check Script
Verifies all required dependencies and configurations are present
"""

import sys
import os
import subprocess
from pathlib import Path


def print_header(text):
    """Print formatted header"""
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_check(name, passed, details=""):
    """Print check result"""
    status = "✅" if passed else "❌"
    print(f"{status} {name}")
    if details:
        print(f"   {details}")


def check_python():
    """Check Python version"""
    version = sys.version_info
    passed = version.major == 3 and version.minor >= 10
    details = f"Python {version.major}.{version.minor}.{version.micro}"
    print_check("Python 3.10+", passed, details)
    return passed


def check_command(command, name, version_arg="--version"):
    """Check if command exists and get version"""
    try:
        result = subprocess.run(
            [command, version_arg],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.split('\n')[0]
            print_check(f"{name} installed", True, version)
            return True
        else:
            print_check(f"{name} installed", False, "Command failed")
            return False
    except FileNotFoundError:
        print_check(f"{name} installed", False, "Not found in PATH")
        return False
    except subprocess.TimeoutExpired:
        print_check(f"{name} installed", False, "Command timeout")
        return False
    except Exception as e:
        print_check(f"{name} installed", False, str(e))
        return False


def check_redis():
    """Check Redis connection"""
    try:
        import redis
        r = redis.Redis(host='localhost', port=6379, socket_connect_timeout=2)
        r.ping()
        print_check("Redis running", True, "Connected to localhost:6379")
        return True
    except ImportError:
        print_check("Redis running", False, "redis-py not installed")
        return False
    except Exception as e:
        print_check("Redis running", False, f"Cannot connect: {e}")
        return False


def check_env_file():
    """Check .env file exists and has required vars"""
    env_path = Path(".env")
    
    if not env_path.exists():
        print_check(".env file", False, "File not found")
        return False
    
    required_vars = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "CELERY_BROKER_URL",
        "CELERY_RESULT_BACKEND",
        "RENDER_OUTPUT_DIR"
    ]
    
    with open(env_path) as f:
        content = f.read()
    
    missing = []
    for var in required_vars:
        if var not in content:
            missing.append(var)
    
    if missing:
        print_check(".env file", False, f"Missing: {', '.join(missing)}")
        return False
    else:
        print_check(".env file", True, "All required vars present")
        return True


def check_python_packages():
    """Check required Python packages"""
    packages = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "celery": "celery",
        "redis": "redis",
        "supabase": "supabase",
        "python-dotenv": "dotenv"
    }
    
    all_installed = True
    
    for package, import_name in packages.items():
        try:
            __import__(import_name)
            print_check(f"Package: {package}", True)
        except ImportError:
            print_check(f"Package: {package}", False, "Not installed")
            all_installed = False
    
    return all_installed


def check_output_dir():
    """Check render output directory exists"""
    # Try to get from .env
    output_dir = os.getenv("RENDER_OUTPUT_DIR", "/tmp/renders")
    path = Path(output_dir)
    
    if path.exists():
        print_check("Output directory", True, str(path))
        return True
    else:
        print_check("Output directory", False, f"{path} does not exist")
        print(f"   Run: mkdir -p {path}")
        return False


def check_supabase_connection():
    """Check Supabase connection"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        
        from supabase import create_client
        
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_ANON_KEY")
        
        if not url or not key:
            print_check("Supabase connection", False, "Missing credentials in .env")
            return False
        
        supabase = create_client(url, key)
        
        # Try a simple query
        response = supabase.table("profiles").select("*").limit(1).execute()
        
        print_check("Supabase connection", True, "Connected successfully")
        return True
        
    except ImportError:
        print_check("Supabase connection", False, "supabase-py not installed")
        return False
    except Exception as e:
        print_check("Supabase connection", False, str(e))
        return False


def main():
    """Run all checks"""
    print_header("Environment Check for Video Assembler Backend")
    
    print("\n📦 System Dependencies:")
    checks = []
    
    checks.append(check_python())
    checks.append(check_command("ffmpeg", "FFmpeg"))
    checks.append(check_command("redis-cli", "Redis CLI", "ping"))
    
    print("\n🐍 Python Packages:")
    checks.append(check_python_packages())
    
    print("\n🔌 Services:")
    checks.append(check_redis())
    
    print("\n⚙️  Configuration:")
    checks.append(check_env_file())
    checks.append(check_output_dir())
    checks.append(check_supabase_connection())
    
    # Summary
    print_header("Summary")
    
    total = len(checks)
    passed = sum(checks)
    percentage = (passed / total * 100) if total > 0 else 0
    
    print(f"\nTotal: {passed}/{total} checks passed ({percentage:.0f}%)")
    
    if passed == total:
        print("\n🎉 All checks passed! You're ready to start the backend.")
        print("\nNext steps:")
        print("  1. Start FastAPI:    python -m app.main")
        print("  2. Start Worker:     celery -A app.worker:celery_app worker --loglevel=info")
        return 0
    else:
        print("\n⚠️  Some checks failed. Please fix the issues above.")
        print("\nCommon fixes:")
        print("  • Install FFmpeg:     choco install ffmpeg (Windows)")
        print("  • Install Redis:      docker run -d -p 6379:6379 redis")
        print("  • Install packages:   pip install -r requirements.txt")
        print("  • Create .env:        cp .env.example .env")
        return 1


if __name__ == "__main__":
    sys.exit(main())
