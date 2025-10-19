import React, { useEffect, useRef, useState } from 'react';
import { MediaPipeResponse } from '../services/mediapipeService';

interface MediaPipeOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  mediaPipeResult: MediaPipeResponse | null;
  isActive: boolean;
  className?: string;
}

export function MediaPipeOverlay({ videoRef, mediaPipeResult, isActive, className = '' }: MediaPipeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Update canvas size when video dimensions change
  useEffect(() => {
    const updateCanvasSize = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        // Get the video's display dimensions
        const rect = video.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    updateCanvasSize();
    
    // Update on window resize
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [videoRef]);

  // Draw MediaPipe landmarks
  useEffect(() => {
    console.log('[MediaPipeOverlay] Effect triggered:', { isActive, mediaPipeResult: !!mediaPipeResult, canvas: !!canvasRef.current, video: !!videoRef.current });
    
    if (!isActive || !mediaPipeResult || !canvasRef.current || !videoRef.current) {
      // Clear canvas if MediaPipe is not active
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw user pose landmarks if available
    if (mediaPipeResult.user_landmarks && mediaPipeResult.user_pose_detected) {
      console.log('[MediaPipeOverlay] Drawing user landmarks:', mediaPipeResult.user_landmarks.length);
      drawPoseLandmarks(ctx, mediaPipeResult.user_landmarks, canvas.width, canvas.height, '#00ff88');
    } else {
      console.log('[MediaPipeOverlay] No user landmarks to draw:', { 
        hasLandmarks: !!mediaPipeResult.user_landmarks, 
        poseDetected: mediaPipeResult.user_pose_detected 
      });
    }

    // Draw reference pose landmarks if available
    if (mediaPipeResult.reference_landmarks && mediaPipeResult.reference_pose_detected) {
      console.log('[MediaPipeOverlay] Drawing reference landmarks:', mediaPipeResult.reference_landmarks.length);
      drawPoseLandmarks(ctx, mediaPipeResult.reference_landmarks, canvas.width, canvas.height, '#ff6b6b');
    } else {
      console.log('[MediaPipeOverlay] No reference landmarks to draw:', { 
        hasLandmarks: !!mediaPipeResult.reference_landmarks, 
        poseDetected: mediaPipeResult.reference_pose_detected 
      });
    }

  }, [isActive, mediaPipeResult, canvasSize]);

  const drawPoseLandmarks = (
    ctx: CanvasRenderingContext2D, 
    landmarks: number[][], 
    canvasWidth: number, 
    canvasHeight: number,
    color: string
  ) => {
    if (!landmarks || landmarks.length === 0) return;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    // Draw pose connections
    const connections = [
      // Face
      [0, 1], [1, 2], [2, 3], [3, 7],
      [0, 4], [4, 5], [5, 6], [6, 8],
      // Torso
      [11, 12], [11, 13], [12, 14], [13, 15], [14, 16],
      [11, 23], [12, 24], [23, 24],
      // Arms
      [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
      [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
      // Legs
      [23, 25], [25, 27], [27, 29], [27, 31],
      [24, 26], [26, 28], [28, 30], [28, 32]
    ];

    // Draw connections
    connections.forEach(([start, end]) => {
      if (landmarks[start] && landmarks[end] && 
          landmarks[start][3] > 0.5 && landmarks[end][3] > 0.5) {
        const startX = landmarks[start][0] * canvasWidth;
        const startY = landmarks[start][1] * canvasHeight;
        const endX = landmarks[end][0] * canvasWidth;
        const endY = landmarks[end][1] * canvasHeight;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    });

    // Draw landmarks
    landmarks.forEach((landmark, index) => {
      if (landmark[3] > 0.5) { // Only draw visible landmarks
        const x = landmark[0] * canvasWidth;
        const y = landmark[1] * canvasHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw landmark index for debugging (optional)
        if (index < 10) { // Only show first 10 for readability
          ctx.fillStyle = 'white';
          ctx.font = '10px Arial';
          ctx.fillText(index.toString(), x + 5, y - 5);
          ctx.fillStyle = color;
        }
      }
    });
  };

  if (!isActive) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        zIndex: 10,
        width: '100%',
        height: '100%'
      }}
    />
  );
}
