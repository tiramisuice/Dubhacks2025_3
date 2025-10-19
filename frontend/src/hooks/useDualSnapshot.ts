/**
 * React Hook for Dual Snapshot Capture and Analysis
 * 
 * This hook integrates the DualSnapshotService with React components
 * for real-time dance feedback during practice sessions.
 * 
 * Author: AI Assistant
 * Date: 2025-01-18
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import DualSnapshotService, { DualSnapshotResponse, DualSnapshotOptions } from '../services/dualSnapshotService';

export interface UseDualSnapshotOptions {
  sessionId: string;
  referenceVideoPath: string;
  apiBaseUrl?: string;
  autoStart?: boolean;
  captureInterval?: number;
}

export interface UseDualSnapshotReturn {
  // State
  isCapturing: boolean;
  hasVideoElement: boolean;
  currentFeedback: DualSnapshotResponse | null;
  feedbackHistory: DualSnapshotResponse[];
  error: Error | null;
  
  // Actions
  startCapture: (webcamVideoElement: HTMLVideoElement) => void;
  stopCapture: () => void;
  pauseCapture: () => void;
  resumeCapture: (webcamVideoElement: HTMLVideoElement) => void;
  processSingleSnapshot: (webcamVideoElement: HTMLVideoElement, videoTimestamp: number) => Promise<DualSnapshotResponse | null>;
  setVideoElement: (videoElement: HTMLVideoElement) => void;
  clearFeedbackHistory: () => void;
  
  // Status
  getStatus: () => { isCapturing: boolean; hasVideoElement: boolean };
}

export function useDualSnapshot(options: UseDualSnapshotOptions): UseDualSnapshotReturn {
  const {
    sessionId,
    referenceVideoPath,
    apiBaseUrl,
    autoStart = false,
    captureInterval = 500
  } = options;

  // State
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasVideoElement, setHasVideoElement] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<DualSnapshotResponse | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<DualSnapshotResponse[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Service instance
  const serviceRef = useRef<DualSnapshotService | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  // Initialize service
  useEffect(() => {
    const serviceOptions: DualSnapshotOptions = {
      sessionId,
      referenceVideoPath,
      apiBaseUrl,
      onFeedback: (feedback: DualSnapshotResponse) => {
        setCurrentFeedback(feedback);
        setFeedbackHistory(prev => [...prev.slice(-9), feedback]); // Keep last 10 feedback items
        setError(null);
      },
      onError: (err: Error) => {
        setError(err);
        console.error('[useDualSnapshot] Service error:', err);
      }
    };

    serviceRef.current = new DualSnapshotService(serviceOptions);

    return () => {
      if (serviceRef.current) {
        serviceRef.current.cleanup();
      }
    };
  }, [sessionId, referenceVideoPath, apiBaseUrl]);

  // Update service status
  useEffect(() => {
    if (serviceRef.current) {
      const status = serviceRef.current.getCaptureStatus();
      setIsCapturing(status.isCapturing);
      setHasVideoElement(status.hasVideoElement);
    }
  }, [isCapturing, hasVideoElement]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && serviceRef.current && webcamVideoRef.current) {
      startCapture(webcamVideoRef.current);
    }
  }, [autoStart]);

  // Actions
  const startCapture = useCallback((webcamVideoElement: HTMLVideoElement) => {
    if (!serviceRef.current) {
      console.error('[useDualSnapshot] Service not initialized');
      return;
    }

    webcamVideoRef.current = webcamVideoElement;
    serviceRef.current.startAutoCapture(webcamVideoElement, captureInterval);
    setIsCapturing(true);
    setError(null);
  }, [captureInterval]);

  const stopCapture = useCallback(() => {
    if (!serviceRef.current) return;

    serviceRef.current.stopAutoCapture();
    setIsCapturing(false);
  }, []);

  const pauseCapture = useCallback(() => {
    if (!serviceRef.current) {
      console.log('[useDualSnapshot] Cannot pause - service not initialized');
      return;
    }

    console.log('[useDualSnapshot] Pausing dual snapshot capture');
    serviceRef.current.pauseAutoCapture();
    setIsCapturing(false);
  }, []);

  const resumeCapture = useCallback((webcamVideoElement: HTMLVideoElement) => {
    if (!serviceRef.current) {
      console.log('[useDualSnapshot] Cannot resume - service not initialized');
      return;
    }

    console.log('[useDualSnapshot] Resuming dual snapshot capture');
    webcamVideoRef.current = webcamVideoElement;
    serviceRef.current.resumeAutoCapture(webcamVideoElement, captureInterval);
    setIsCapturing(true);
  }, [captureInterval]);

  const processSingleSnapshot = useCallback(async (
    webcamVideoElement: HTMLVideoElement,
    videoTimestamp: number
  ): Promise<DualSnapshotResponse | null> => {
    if (!serviceRef.current) {
      console.error('[useDualSnapshot] Service not initialized');
      return null;
    }

    try {
      const result = await serviceRef.current.processDualSnapshot(webcamVideoElement, videoTimestamp);
      return result;
    } catch (err) {
      setError(err as Error);
      return null;
    }
  }, []);

  const setVideoElement = useCallback((videoElement: HTMLVideoElement) => {
    if (!serviceRef.current) return;

    serviceRef.current.setVideoElement(videoElement);
    setHasVideoElement(true);
  }, []);

  const clearFeedbackHistory = useCallback(() => {
    setFeedbackHistory([]);
    setCurrentFeedback(null);
  }, []);

  const getStatus = useCallback(() => {
    return {
      isCapturing,
      hasVideoElement
    };
  }, [isCapturing, hasVideoElement]);

  return {
    // State
    isCapturing,
    hasVideoElement,
    currentFeedback,
    feedbackHistory,
    error,
    
    // Actions
    startCapture,
    stopCapture,
    pauseCapture,
    resumeCapture,
    processSingleSnapshot,
    setVideoElement,
    clearFeedbackHistory,
    
    // Status
    getStatus
  };
}
