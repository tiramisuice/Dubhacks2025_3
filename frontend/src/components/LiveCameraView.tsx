import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { RotateCcw, Camera, AlertCircle } from 'lucide-react';

interface LiveCameraViewProps {
  className?: string;
  showMirrorButton?: boolean;
  mirrorButtonPosition?: 'top-right' | 'bottom-center';
  onSnapshot?: (snapshot: string) => void; // Callback for when snapshot is taken
  autoSnapshot?: boolean; // Auto-capture snapshots at intervals
  snapshotInterval?: number; // Interval in milliseconds (default 500ms)
}

export function LiveCameraView({ 
  className = '', 
  showMirrorButton = true,
  mirrorButtonPosition = 'top-right',
  onSnapshot,
  autoSnapshot = false,
  snapshotInterval = 500
}: LiveCameraViewProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotIntervalRef = useRef<number | null>(null);

  // Initialize webcam
  useEffect(() => {
    let mounted = true;

    const initCamera = async () => {
      try {
        setDebugInfo('Requesting camera access...');
        console.log('Requesting camera access...');
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });
        
        console.log('Camera stream obtained:', stream);
        setDebugInfo('Stream obtained, waiting for video element...');
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        
        // Wait for video element to be available
        const waitForVideoElement = () => {
          return new Promise<HTMLVideoElement>((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait
            
            const checkVideo = () => {
              attempts++;
              if (videoRef.current) {
                console.log('Video element found!');
                setDebugInfo('Video element found, setting up...');
                resolve(videoRef.current);
              } else if (attempts >= maxAttempts) {
                reject(new Error('Video element not found after waiting'));
              } else {
                setTimeout(checkVideo, 100);
              }
            };
            
            checkVideo();
          });
        };

        try {
          const videoElement = await waitForVideoElement();
          
          console.log('Setting video srcObject...');
          videoElement.srcObject = stream;
          
          // Add event listeners for debugging
          videoElement.onloadstart = () => {
            console.log('Video load started');
            setDebugInfo('Video loading...');
          };
          
          videoElement.onloadedmetadata = () => {
            console.log('Video metadata loaded');
            setDebugInfo('Metadata loaded, playing...');
          };
          
          videoElement.oncanplay = () => {
            console.log('Video can play');
            setDebugInfo('Video ready to play');
          };
          
          videoElement.onplaying = () => {
            console.log('Video is playing');
            setDebugInfo('Video playing successfully');
            if (mounted) {
              setCameraReady(true);
            }
          };
          
          videoElement.onerror = (e) => {
            console.error('Video error:', e);
            setDebugInfo('Video error occurred');
            if (mounted) {
              setCameraError('Failed to display camera feed.');
            }
          };
          
          // Try to play immediately
          try {
            console.log('Attempting to play video...');
            await videoElement.play();
            console.log('Video playing successfully');
            if (mounted) {
              setCameraReady(true);
            }
          } catch (playError) {
            console.error('Error playing video:', playError);
            setDebugInfo('Play error, waiting for metadata...');
          }
        } catch (videoError) {
          console.error('Video element error:', videoError);
          setDebugInfo('Video element not found');
          if (mounted) {
            setCameraError('Failed to initialize video element.');
          }
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        if (!mounted) return;
        
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            setCameraError('Camera access denied. Please allow camera permissions.');
          } else if (error.name === 'NotFoundError') {
            setCameraError('No camera found. Please connect a camera.');
          } else {
            setCameraError('Failed to access camera. Please check your device.');
          }
        }
        setDebugInfo('Camera access failed');
      }
    };

    // Small delay to ensure component is fully rendered
    const timer = setTimeout(() => {
      initCamera();
    }, 100);

    // Cleanup function
    return () => {
      mounted = false;
      clearTimeout(timer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Snapshot capture function
  const captureSnapshot = (): string | null => {
    if (!videoRef.current || !canvasRef.current) {
      console.warn('Video or canvas not ready for snapshot');
      return null;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.warn('Canvas context not available');
      return null;
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Apply mirror transformation if needed
    if (mirrorCamera) {
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
    }

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 data URL
    const dataURL = canvas.toDataURL('image/jpeg', 0.8); // 0.8 quality for smaller file size
    
    return dataURL;
  };

  // Auto-snapshot functionality
  useEffect(() => {
    if (autoSnapshot && cameraReady && onSnapshot) {
      // Start auto-snapshot interval
      snapshotIntervalRef.current = setInterval(() => {
        const snapshot = captureSnapshot();
        if (snapshot) {
          onSnapshot(snapshot);
        }
      }, snapshotInterval);

      return () => {
        if (snapshotIntervalRef.current) {
          clearInterval(snapshotIntervalRef.current);
        }
      };
    } else if (snapshotIntervalRef.current) {
      // Clear interval if auto-snapshot is disabled
      clearInterval(snapshotIntervalRef.current);
      snapshotIntervalRef.current = null;
    }
  }, [autoSnapshot, cameraReady, onSnapshot, snapshotInterval, mirrorCamera]);

  // Manual snapshot function (can be called externally)
  const takeSnapshot = (): string | null => {
    return captureSnapshot();
  };

  // Expose takeSnapshot function via ref (optional)
  useEffect(() => {
    if (videoRef.current) {
      (videoRef.current as any).takeSnapshot = takeSnapshot;
    }
  }, [mirrorCamera]);

  return (
    <div className={`relative ${className}`}>
      {/* Hidden canvas for snapshot capture */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      
      {/* Video element - always present */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
        style={{
          transform: mirrorCamera ? 'scaleX(-1)' : 'scaleX(1)',
          objectFit: 'cover',
          width: '100%',
          height: '100%'
        }}
      />
      
      {/* Mirror Camera Button */}
      {cameraReady && showMirrorButton && (
        <div className={`absolute ${
          mirrorButtonPosition === 'top-right' 
            ? 'top-2 right-2' 
            : 'bottom-2 left-1/2 transform -translate-x-1/2'
        }`}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMirrorCamera(!mirrorCamera)}
            className="bg-black/50 border-white/20 text-white hover:bg-black/70 text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            {mirrorCamera ? 'Unmirror' : 'Mirror'}
          </Button>
        </div>
      )}
      
      {/* Overlay states */}
      {cameraError ? (
        // Error State
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-black/80">
          <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-xs text-red-400 text-center">{cameraError}</p>
        </div>
      ) : !cameraReady ? (
        // Loading State
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <Camera className="w-8 h-8 text-purple-500 mb-2 animate-pulse" />
          <p className="text-xs text-muted-foreground">Activating camera...</p>
        </div>
      ) : null}
    </div>
  );
}
