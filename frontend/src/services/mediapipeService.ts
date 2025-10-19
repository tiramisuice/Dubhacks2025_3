/**
 * MediaPipe Service for Frontend
 * Handles communication with the backend MediaPipe API for pose detection and analysis.
 */

export interface MediaPipeRequest {
  user_image: string; // base64 encoded user webcam image
  reference_image: string; // base64 encoded reference video frame
  timestamp?: number;
  draw_landmarks?: boolean;
}

export interface MediaPipeResponse {
  timestamp: number;
  user_pose_detected: boolean;
  reference_pose_detected: boolean;
  similarity_score: number;
  processing_time: number;
  user_landmarks?: number[][];
  reference_landmarks?: number[][];
  user_analysis?: {
    total_landmarks: number;
    visible_landmarks: number;
    average_confidence: number;
    pose_center: { x: number; y: number };
    pose_bounds: {
      min_x: number;
      max_x: number;
      min_y: number;
      max_y: number;
    };
    key_points?: {
      nose: number[];
      left_shoulder: number[];
      right_shoulder: number[];
      left_hip: number[];
      right_hip: number[];
      left_wrist: number[];
      right_wrist: number[];
      left_ankle: number[];
      right_ankle: number[];
    };
  };
  reference_analysis?: {
    total_landmarks: number;
    visible_landmarks: number;
    average_confidence: number;
    pose_center: { x: number; y: number };
    pose_bounds: {
      min_x: number;
      max_x: number;
      min_y: number;
      max_y: number;
    };
    key_points?: {
      nose: number[];
      left_shoulder: number[];
      right_shoulder: number[];
      left_hip: number[];
      right_hip: number[];
      left_wrist: number[];
      right_wrist: number[];
      left_ankle: number[];
      right_ankle: number[];
    };
  };
  user_image_with_landmarks?: string; // base64 encoded image with drawn landmarks
  reference_image_with_landmarks?: string; // base64 encoded image with drawn landmarks
  success: boolean;
  error?: string;
}

class MediaPipeService {
  private baseUrl: string;

  constructor() {
    // Use the same base URL as other services
    this.baseUrl = 'http://localhost:8000';
  }

  /**
   * Analyze poses using MediaPipe on both user and reference images.
   * 
   * @param userImage - Base64 encoded user webcam image
   * @param referenceImage - Base64 encoded reference video frame
   * @param timestamp - Optional timestamp for the analysis
   * @param drawLandmarks - Whether to draw landmarks on the images
   * @returns Promise<MediaPipeResponse>
   */
  async analyzePoses(
    userImage: string,
    referenceImage: string,
    timestamp?: number,
    drawLandmarks: boolean = false
  ): Promise<MediaPipeResponse> {
    try {
      console.log('[MediaPipe] Sending pose analysis request...');
      
      const request: MediaPipeRequest = {
        user_image: userImage,
        reference_image: referenceImage,
        timestamp: timestamp || Date.now() / 1000,
        draw_landmarks: drawLandmarks
      };

      const response = await fetch(`${this.baseUrl}/api/mediapipe/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MediaPipe API error: ${response.status} - ${errorText}`);
      }

      const result: MediaPipeResponse = await response.json();
      
      console.log('[MediaPipe] Analysis complete:', {
        user_pose_detected: result.user_pose_detected,
        reference_pose_detected: result.reference_pose_detected,
        similarity_score: result.similarity_score,
        processing_time: result.processing_time
      });

      return result;

    } catch (error) {
      console.error('[MediaPipe] Error analyzing poses:', error);
      throw error;
    }
  }

  /**
   * Convert canvas element to base64 image.
   * 
   * @param canvas - HTML canvas element
   * @param quality - JPEG quality (0-1)
   * @returns Base64 encoded image string
   */
  canvasToBase64(canvas: HTMLCanvasElement, quality: number = 0.8): string {
    try {
      return canvas.toDataURL('image/jpeg', quality).split(',')[1];
    } catch (error) {
      console.error('[MediaPipe] Error converting canvas to base64:', error);
      throw error;
    }
  }

  /**
   * Convert video frame to base64 image.
   * 
   * @param video - HTML video element
   * @param quality - JPEG quality (0-1)
   * @returns Base64 encoded image string
   */
  videoFrameToBase64(video: HTMLVideoElement, quality: number = 0.8): string {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return this.canvasToBase64(canvas, quality);
    } catch (error) {
      console.error('[MediaPipe] Error converting video frame to base64:', error);
      throw error;
    }
  }

  /**
   * Convert base64 image to data URL for display.
   * 
   * @param base64 - Base64 encoded image string
   * @param mimeType - MIME type (default: image/jpeg)
   * @returns Data URL string
   */
  base64ToDataUrl(base64: string, mimeType: string = 'image/jpeg'): string {
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Get pose analysis summary for display.
   * 
   * @param response - MediaPipe response
   * @returns Formatted summary string
   */
  getAnalysisSummary(response: MediaPipeResponse): string {
    if (!response.success) {
      return `Error: ${response.error || 'Unknown error'}`;
    }

    const parts = [];
    
    if (response.user_pose_detected) {
      parts.push('User pose detected');
    } else {
      parts.push('No user pose detected');
    }
    
    if (response.reference_pose_detected) {
      parts.push('Reference pose detected');
    } else {
      parts.push('No reference pose detected');
    }
    
    if (response.user_pose_detected && response.reference_pose_detected) {
      parts.push(`Similarity: ${(response.similarity_score * 100).toFixed(1)}%`);
    }
    
    parts.push(`Processing time: ${response.processing_time.toFixed(2)}s`);
    
    return parts.join(' • ');
  }

  /**
   * Get similarity score as percentage.
   * 
   * @param response - MediaPipe response
   * @returns Similarity percentage (0-100)
   */
  getSimilarityPercentage(response: MediaPipeResponse): number {
    return Math.round(response.similarity_score * 100);
  }

  /**
   * Check if both poses were detected successfully.
   * 
   * @param response - MediaPipe response
   * @returns True if both poses detected
   */
  hasBothPoses(response: MediaPipeResponse): boolean {
    return response.user_pose_detected && response.reference_pose_detected;
  }

  /**
   * Get pose confidence level.
   * 
   * @param response - MediaPipe response
   * @returns Confidence level string
   */
  getConfidenceLevel(response: MediaPipeResponse): 'high' | 'medium' | 'low' {
    if (!response.user_analysis && !response.reference_analysis) {
      return 'low';
    }

    const userConfidence = response.user_analysis?.average_confidence || 0;
    const referenceConfidence = response.reference_analysis?.average_confidence || 0;
    const avgConfidence = (userConfidence + referenceConfidence) / 2;

    if (avgConfidence >= 0.8) return 'high';
    if (avgConfidence >= 0.6) return 'medium';
    return 'low';
  }
}

// Export singleton instance
export const mediapipeService = new MediaPipeService();
export default mediapipeService;
