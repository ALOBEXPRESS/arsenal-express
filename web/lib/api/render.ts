/**
 * Render API Client
 * 
 * Handles communication with the backend FastAPI server for video rendering
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export interface RenderJobResponse {
  task_id: string;
  render_id: string;
  status: string;
}

export interface RenderStatusResponse {
  task_id: string;
  state: string;
  status: string;
  progress: number;
  message?: string;
  result?: {
    render_id: string;
    status: string;
    output_url?: string;
  };
}

/**
 * Submit a render job to the backend
 */
export async function submitRenderJob(
  renderId: string,
  projectId: string
): Promise<RenderJobResponse> {
  const response = await fetch(`${BACKEND_URL}/api/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      render_id: renderId,
      project_id: projectId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to submit render job');
  }

  return response.json();
}

/**
 * Get render job status from the backend
 */
export async function getRenderStatus(taskId: string): Promise<RenderStatusResponse> {
  const response = await fetch(`${BACKEND_URL}/api/render/${taskId}/status`);

  if (!response.ok) {
    throw new Error('Failed to get render status');
  }

  return response.json();
}

/**
 * Poll render status until completion or failure
 * 
 * @param taskId - Celery task ID
 * @param onProgress - Callback for progress updates
 * @param pollInterval - Interval in ms between polls (default: 2000)
 */
export async function pollRenderStatus(
  taskId: string,
  onProgress: (status: RenderStatusResponse) => void,
  pollInterval: number = 2000
): Promise<RenderStatusResponse> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getRenderStatus(taskId);
        onProgress(status);

        // Check if completed or failed
        if (status.state === 'SUCCESS') {
          resolve(status);
        } else if (status.state === 'FAILURE') {
          reject(new Error(status.result?.message || 'Render failed'));
        } else {
          // Continue polling
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Test backend connection
 */
export async function testBackendConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
