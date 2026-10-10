from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import logging

from app.config import settings
from app.worker import process_render_task

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Video Assembler API",
    description="Backend API for video rendering",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Models
class RenderRequest(BaseModel):
    render_id: str
    project_id: str


class RenderStatusResponse(BaseModel):
    render_id: str
    status: str
    progress: float
    message: Optional[str] = None


# Routes
@app.get("/")
async def root():
    return {
        "name": "Video Assembler API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "redis": check_redis_connection(),
        "storage": settings.render_output_dir.exists(),
    }


@app.post("/api/renders/start")
async def start_render(request: RenderRequest):
    """
    Start a new render job
    Enqueue the task in Celery
    """
    try:
        logger.info(f"Starting render: {request.render_id}")
        
        # Enqueue task
        task = process_render_task.delay(
            render_id=request.render_id,
            project_id=request.project_id,
        )
        
        return {
            "render_id": request.render_id,
            "task_id": task.id,
            "status": "queued",
            "message": "Render job queued successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to start render: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/renders/{render_id}/status")
async def get_render_status(render_id: str):
    """
    Get the current status of a render job
    """
    try:
        # TODO: Query Supabase for render status
        # For now, return mock data
        return {
            "render_id": render_id,
            "status": "processing",
            "progress": 45.0,
            "message": "Rendering video..."
        }
        
    except Exception as e:
        logger.error(f"Failed to get render status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/renders/{render_id}/cancel")
async def cancel_render(render_id: str):
    """
    Cancel a running render job
    """
    try:
        logger.info(f"Cancelling render: {render_id}")
        
        # TODO: Revoke Celery task
        # TODO: Update Supabase status
        
        return {
            "render_id": render_id,
            "status": "cancelled",
            "message": "Render job cancelled"
        }
        
    except Exception as e:
        logger.error(f"Failed to cancel render: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper functions
def check_redis_connection() -> bool:
    """Check if Redis is available"""
    try:
        import redis
        r = redis.from_url(settings.redis_url)
        r.ping()
        return True
    except Exception:
        return False


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
    )
