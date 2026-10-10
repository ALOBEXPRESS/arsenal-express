#!/usr/bin/env python3
"""
Quick Server Status Checker
Verifies which servers are running and ready for testing
"""

import sys
import socket
import subprocess
from urllib.request import urlopen
from urllib.error import URLError


def print_header(text):
    """Print formatted header"""
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_status(name, running, details=""):
    """Print server status"""
    status = "🟢 RUNNING" if running else "🔴 NOT RUNNING"
    print(f"{status:20} {name}")
    if details:
        print(f"{'':20} {details}")


def check_port(host, port, name):
    """Check if a port is open"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print_status(f"{name} (:{port})", True, f"Port {port} is open")
            return True
        else:
            print_status(f"{name} (:{port})", False, f"Port {port} is closed")
            return False
    except Exception as e:
        print_status(f"{name} (:{port})", False, str(e))
        return False


def check_http(url, name):
    """Check if HTTP endpoint responds"""
    try:
        response = urlopen(url, timeout=2)
        if response.status == 200:
            body = response.read().decode('utf-8')
            print_status(name, True, f"Response: {body[:50]}")
            return True
        else:
            print_status(name, False, f"HTTP {response.status}")
            return False
    except URLError as e:
        print_status(name, False, f"Cannot connect: {e.reason}")
        return False
    except Exception as e:
        print_status(name, False, str(e))
        return False


def check_redis():
    """Check Redis using redis-cli"""
    try:
        result = subprocess.run(
            ["redis-cli", "ping"],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode == 0 and "PONG" in result.stdout:
            print_status("Redis", True, "redis-cli ping → PONG")
            return True
        else:
            print_status("Redis", False, "redis-cli ping failed")
            return False
    except FileNotFoundError:
        # Try checking port instead
        return check_port("localhost", 6379, "Redis")
    except Exception as e:
        print_status("Redis", False, str(e))
        return False


def main():
    """Check all servers"""
    print_header("Server Status Check")
    
    print("\n📡 Checking Services...")
    checks = []
    
    # Check Redis
    checks.append(("Redis", check_redis()))
    
    # Check Frontend (Next.js)
    checks.append(("Frontend", check_http("http://localhost:3000", "Next.js")))
    
    # Check Backend (FastAPI)
    checks.append(("Backend API", check_http("http://localhost:8000/health", "FastAPI")))
    
    # Check Worker (Celery) - just check if backend is running, worker doesn't expose port
    # We already checked backend above
    
    # Summary
    print_header("Summary")
    
    running = sum(1 for _, status in checks if status)
    total = len(checks)
    
    print(f"\n{running}/{total} services running")
    
    if running == total:
        print("\n🎉 All services are running!")
        print("\n✅ You can now run Playwright tests")
        print("\nNext: Tell Kiro 'Todos os servidores estão rodando!'")
        return 0
    else:
        print("\n⚠️  Some services are not running")
        print("\nMissing services:")
        for name, status in checks:
            if not status:
                print(f"  • {name}")
        
        print("\n📖 See START_SERVERS.md for instructions")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
