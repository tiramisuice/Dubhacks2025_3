/**
 * Dual Snapshot Service for Real-time Dance Feedback
 * 
 * This service handles capturing both webcam and reference video frames
 * and sending them to the backend for GPT-4o analysis, similar to
 * the approach used in riptide-ai2/split_video.py.
 * 
 * Author: AI Assistant
 * Date: 2025-01-18
 */

export interface DualSnapshotRequest {
  webcam_image: string; // base64 encoded webcam image
  reference_video_path: string; // path to reference video file
  video_timestamp: number; // current timestamp in reference video
  session_id: string;
}

export interface DualSnapshotResponse {
  timestamp: number;
  feedback_text: string;
  severity: 'high' | 'medium' | 'low';
  focus_areas: string[];
  similarity_score: number;
  is_positive: boolean;
  specific_issues: string[];
  recommendations: string[];
  success: boolean;
  error?: string;
  
  // Tier 2 analysis fields (optional)
  tier2_analysis?: {
    overall_feedback: string;
    overall_similarity_score: number;
    trend_analysis: string;
    key_improvements: string[];
    encouragement: string;
    is_positive: boolean;
  };
  overall_feedback?: string;
  overall_similarity_score?: number;
  trend_analysis?: string;
  key_improvements?: string[];
  encouragement?: string;
}

export interface DualSnapshotOptions {
  apiBaseUrl?: string;
  sessionId: string;
  referenceVideoPath: string;
  onFeedback?: (feedback: DualSnapshotResponse) => void;
  onError?: (error: Error) => void;
}

class DualSnapshotService {
  private apiBaseUrl: string;
  private sessionId: string;
  private referenceVideoPath: string;
  private onFeedback?: (feedback: DualSnapshotResponse) => void;
  private onError?: (error: Error) => void;
  private isCapturing: boolean = false;
  private captureInterval: number | null = null;
  private videoElement: HTMLVideoElement | null = null;

  constructor(options: DualSnapshotOptions) {
    this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:8000';
    this.sessionId = options.sessionId;
    this.referenceVideoPath = options.referenceVideoPath;
    this.onFeedback = options.onFeedback;
    this.onError = options.onError;
  }

  /**
   * Set the reference video element for frame extraction
   */
  setVideoElement(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * Capture a snapshot from the webcam
   */
  private captureWebcamSnapshot(videoElement: HTMLVideoElement): string | null {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('[DualSnapshot] Could not get canvas context');
        return null;
      }

      // Set canvas dimensions to match video
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Convert to base64 data URL
      const dataURL = canvas.toDataURL('image/jpeg', 0.8); // 0.8 quality for smaller file size
      
      return dataURL;
    } catch (error) {
      console.error('[DualSnapshot] Error capturing webcam snapshot:', error);
      return null;
    }
  }

  /**
   * Capture a snapshot from the reference video
   */
  private captureReferenceSnapshot(): string | null {
    if (!this.videoElement) {
      console.error('[DualSnapshot] No reference video element set');
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('[DualSnapshot] Could not get canvas context for reference video');
        return null;
      }

      // Set canvas dimensions to match video
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

      // Convert to base64 data URL
      const dataURL = canvas.toDataURL('image/jpeg', 0.8);
      
      return dataURL;
    } catch (error) {
      console.error('[DualSnapshot] Error capturing reference snapshot:', error);
      return null;
    }
  }

  /**
   * Send dual snapshot to backend for analysis
   */
  private async sendDualSnapshot(
    webcamSnapshot: string,
    videoTimestamp: number
  ): Promise<DualSnapshotResponse | null> {
    try {
      const request: DualSnapshotRequest = {
        webcam_image: webcamSnapshot,
        reference_video_path: this.referenceVideoPath,
        video_timestamp: videoTimestamp,
        session_id: this.sessionId
      };

      console.log(`[DualSnapshot] Sending dual snapshot at ${videoTimestamp}s`);

      const response = await fetch(`${this.apiBaseUrl}/api/sessions/dual-snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: DualSnapshotResponse = await response.json();
      console.log('[DualSnapshot] Received feedback:', result);
      
      // Debug Tier 2 data with more detailed logging
      console.log('[DualSnapshot] Checking Tier 2 data:');
      console.log('  - result.overall_feedback:', result.overall_feedback);
      console.log('  - result.tier2_analysis:', result.tier2_analysis);
      console.log('  - typeof result.overall_feedback:', typeof result.overall_feedback);
      console.log('  - result.overall_feedback === null:', result.overall_feedback === null);
      console.log('  - result.overall_feedback === undefined:', result.overall_feedback === undefined);
      
      if (result.tier2_analysis || result.overall_feedback) {
        console.log('[DualSnapshot] ✅ Tier 2 data received:', {
          overall_feedback: result.overall_feedback,
          overall_similarity_score: result.overall_similarity_score,
          trend_analysis: result.trend_analysis,
          encouragement: result.encouragement,
          tier2_analysis: result.tier2_analysis
        });
        console.log('[DualSnapshot] Full result object:', JSON.stringify(result, null, 2));
      } else {
        console.log('[DualSnapshot] ⏳ No Tier 2 data, using Tier 1 only');
        console.log('[DualSnapshot] Available fields:', Object.keys(result));
        console.log('[DualSnapshot] Full result object:', JSON.stringify(result, null, 2));
      }

      return result;
    } catch (error) {
      console.error('[DualSnapshot] Error sending dual snapshot:', error);
      if (this.onError) {
        this.onError(error as Error);
      }
      return null;
    }
  }

  /**
   * Process a single dual snapshot
   */
  async processDualSnapshot(
    webcamVideoElement: HTMLVideoElement,
    videoTimestamp: number
  ): Promise<DualSnapshotResponse | null> {
    // Capture webcam snapshot
    const webcamSnapshot = this.captureWebcamSnapshot(webcamVideoElement);
    if (!webcamSnapshot) {
      console.warn('[DualSnapshot] Failed to capture webcam snapshot');
      return null;
    }

    // Send to backend for analysis
    const result = await this.sendDualSnapshot(webcamSnapshot, videoTimestamp);
    
    if (result && this.onFeedback) {
      this.onFeedback(result);
    }

    return result;
  }

  /**
   * Start automatic dual snapshot capture every 0.5 seconds
   */
  startAutoCapture(
    webcamVideoElement: HTMLVideoElement,
    intervalMs: number = 500
  ): void {
    if (this.isCapturing) {
      console.warn('[DualSnapshot] Auto capture already running');
      return;
    }

    this.isCapturing = true;
    console.log(`[DualSnapshot] Starting auto capture every ${intervalMs}ms`);

    this.captureInterval = window.setInterval(async () => {
      if (!this.videoElement) {
        console.warn('[DualSnapshot] No reference video element available');
        return;
      }

      const videoTimestamp = this.videoElement.currentTime;
      
      try {
        await this.processDualSnapshot(webcamVideoElement, videoTimestamp);
      } catch (error) {
        console.error('[DualSnapshot] Error in auto capture:', error);
        if (this.onError) {
          this.onError(error as Error);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop automatic dual snapshot capture
   */
  stopAutoCapture(): void {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    console.log('[DualSnapshot] Stopped auto capture');
  }

  /**
   * Pause auto capture (keep interval but don't process)
   */
  pauseAutoCapture(): void {
    console.log(`[DualSnapshot] Pausing - isCapturing: ${this.isCapturing}, hasInterval: ${!!this.captureInterval}`);
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    console.log('[DualSnapshot] Paused auto capture - OpenAI API calls stopped to save costs');
  }

  /**
   * Resume auto capture
   */
  resumeAutoCapture(webcamVideoElement: HTMLVideoElement, intervalMs: number = 500): void {
    console.log(`[DualSnapshot] Attempting to resume - isCapturing: ${this.isCapturing}, hasInterval: ${!!this.captureInterval}`);
    
    if (this.isCapturing && !this.captureInterval) {
      console.log(`[DualSnapshot] Resumed auto capture - OpenAI API calls will resume (every ${intervalMs}ms)`);
      this.captureInterval = window.setInterval(async () => {
        if (!this.videoElement) {
          console.warn('[DualSnapshot] No reference video element available');
          return;
        }

        const videoTimestamp = this.videoElement.currentTime;
        
        try {
          await this.processDualSnapshot(webcamVideoElement, videoTimestamp);
        } catch (error) {
          console.error('[DualSnapshot] Error in auto capture:', error);
          if (this.onError) {
            this.onError(error as Error);
          }
        }
      }, intervalMs);
      console.log('[DualSnapshot] Resumed auto capture');
    }
  }

  /**
   * Get current capture status
   */
  getCaptureStatus(): { isCapturing: boolean; hasVideoElement: boolean } {
    return {
      isCapturing: this.isCapturing,
      hasVideoElement: this.videoElement !== null
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopAutoCapture();
    this.videoElement = null;
    console.log('[DualSnapshot] Service cleaned up');
  }
}

export default DualSnapshotService;
