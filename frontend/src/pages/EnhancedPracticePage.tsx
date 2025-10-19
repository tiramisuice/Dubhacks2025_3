import React, { useState, useEffect } from 'react';
import { mockRoutines } from '../data/mockData';
import { PracticeTip } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Play, SkipForward } from 'lucide-react';

// Import our new components and services
import { VideoPlayer } from '../components/VideoPlayer';
import { LiveCameraView } from '../components/LiveCameraView';
import { LiveFeedback } from '../components/LiveFeedback';
import { PracticeControlBar } from '../components/PracticeControlBar';
// Removed useVideoBeatSync - using time-based progress instead
import { useSnapshotCapture } from '../hooks/useSnapshotCapture';
import { useDualSnapshot } from '../hooks/useDualSnapshot';
import { mockFeedbackService, MockFeedbackResponse } from '../services/mockFeedbackService';

interface EnhancedPracticePageProps {
  routineId: string;
  onReview: () => void;
  onSettings: () => void;
}

export function EnhancedPracticePage({ routineId, onReview, onSettings }: EnhancedPracticePageProps) {
  const routine = mockRoutines.find((r) => r.id === routineId);
  
  // Video state
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSkeleton] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // Camera and feedback state
  // const [mirrorCamera] = useState(true);
  const [mirrorVideo, setMirrorVideo] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentFeedback, setCurrentFeedback] = useState<MockFeedbackResponse | null>(null);
  const [overallAccuracy, setOverallAccuracy] = useState(82);
  const [showCongratulations, setShowCongratulations] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [autoNavigateCountdown, setAutoNavigateCountdown] = useState(5);

  // Video reference
  const videoSrc = `/src/data/${routine?.title.toLowerCase()}.mp4`; // Video files in frontend/src/data
  const backendVideoPath = `app/data/${routine?.title.toLowerCase()}.mp4`; // Backend path for dual snapshot service

  if (!routine) {
    return <div>Routine not found</div>;
  }

  // Time-based progress instead of beats
  const progressPercentage = videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0;
  const formattedCurrentTime = formatTime(videoCurrentTime);
  const formattedDuration = formatTime(videoDuration);

  // Handle video seek
  const handleVideoSeek = (time: number) => {
    console.log(`Seeking to: ${time}`);
    setIsSeeking(true);
    setVideoCurrentTime(time);
    
    // Update the video element directly
    const videoElement = document.querySelector('video') as HTMLVideoElement;
    if (videoElement) {
      videoElement.currentTime = time;
    }
    
    // Reset seeking flag after a short delay
    setTimeout(() => {
      setIsSeeking(false);
    }, 100);
  };

  // Handle video time update (ignore during seeking)
  const handleVideoTimeUpdate = (time: number) => {
    if (!isSeeking) {
      setVideoCurrentTime(time);
      
      // Check if video has ended
      if (videoDuration > 0 && time >= videoDuration - 0.1 && !videoEnded) {
        handleVideoEnd();
      }
    }
  };

  // Handle video end
  const handleVideoEnd = () => {
    console.log('Video ended - pausing feedback and showing congratulations');
    setVideoEnded(true);
    setIsPlaying(false);
    
    // Pause all feedback systems
    pauseProcessing();
    stopAutoCapture();
    
    // Show congratulations popup
    setShowCongratulations(true);
    setAutoNavigateCountdown(5);
    
    // Start countdown for auto-navigation
    const countdownInterval = setInterval(() => {
      setAutoNavigateCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setShowCongratulations(false);
          onReview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle timeline click for seeking
  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (videoEnded) return; // Don't allow seeking after video ends
    
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Timeline clicked!');
    
    const timeline = event.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickPercentage = clickX / rect.width;
    const newTime = clickPercentage * videoDuration;
    
    console.log('Seeking to:', newTime, 'seconds');
    handleVideoSeek(newTime);
  };

  // Handle timeline hover for preview
  const handleTimelineHover = (_event: React.MouseEvent<HTMLDivElement>) => {
    // const timeline = event.currentTarget;
    // const rect = timeline.getBoundingClientRect();
    // const hoverX = event.clientX - rect.left;
    // const hoverPercentage = hoverX / rect.width;
    // const hoverTime = hoverPercentage * videoDuration;
    
    // You could add a tooltip here showing the hover time
    // For now, we'll just update the cursor
  };

  // Use snapshot capture hook (legacy)
  const {
    isCapturing,
    startAutoCapture,
    stopAutoCapture,
    pauseProcessing,
    resumeProcessing
  } = useSnapshotCapture({
    autoCapture: isPlaying && hasStarted,
    captureInterval: 500,
    onSnapshotProcessed: (result) => {
      console.log('Snapshot processed:', result);
    },
    onError: (error) => {
      console.error('Snapshot error:', error);
    }
  });

  // Use dual snapshot hook for GPT-4o analysis
  const {
    isCapturing: isDualCapturing,
    hasVideoElement,
    currentFeedback: dualFeedback,
    feedbackHistory,
    error: dualError,
    startCapture: startDualCapture,
    stopCapture: stopDualCapture,
    pauseCapture: pauseDualCapture,
    resumeCapture: resumeDualCapture,
    setVideoElement,
    clearFeedbackHistory
  } = useDualSnapshot({
    sessionId: `session_${routineId}`,
    referenceVideoPath: backendVideoPath,
    apiBaseUrl: 'http://localhost:8000',
    autoStart: false,
    captureInterval: 500
  });

  // Update overall accuracy when dual feedback is received
  useEffect(() => {
    if (dualFeedback && dualFeedback.similarity_score !== undefined) {
      const newAccuracy = Math.round(dualFeedback.similarity_score * 100);
      setOverallAccuracy(newAccuracy);
      console.log(`Updated accuracy from dual feedback: ${newAccuracy}%`);
    }
  }, [dualFeedback]);

  // Handle camera snapshot - now using dual snapshot system
  const handleSnapshot = async (snapshot: string) => {
    if (!hasStarted) return;

    try {
      // Use dual snapshot system for real GPT-4o analysis
      if (hasVideoElement && dualFeedback) {
        // The dual snapshot system is already running and providing feedback
        // We don't need to process individual snapshots anymore
        console.log('Dual snapshot system is active, using GPT-4o feedback');
        return;
      }

      // Fallback to mock service if dual snapshot isn't available
      const feedback = await mockFeedbackService.processSnapshot(snapshot, {
        baseScore: 0.75,
        feedbackFrequency: 0.3,
        includeErrors: true
      });

      setCurrentFeedback(feedback);
      
      // Update overall accuracy based on combined score
      if (feedback.comparison_result) {
        const newAccuracy = Math.round(feedback.comparison_result.combined_score * 100);
        setOverallAccuracy(newAccuracy);
      }

      console.log('Feedback received (mock):', feedback);
    } catch (error) {
      console.error('Error processing snapshot:', error);
    }
  };

  // Debug logging for timeline
  useEffect(() => {
    console.log('Timeline Debug:', {
      videoCurrentTime,
      videoDuration,
      progressPercentage,
      formattedCurrentTime,
      formattedDuration
    });
  }, [videoCurrentTime, videoDuration, progressPercentage]);

  // Control capture based on play/pause state
  useEffect(() => {
    if (hasStarted && !videoEnded) {
      if (isPlaying) {
        console.log('Video playing - resuming capture');
        resumeProcessing();
        startAutoCapture();
        
        // Also start dual snapshot capture if we have a video element
        if (hasVideoElement) {
          const webcamVideo = document.querySelector('#webcam video') as HTMLVideoElement;
          if (webcamVideo) {
            resumeDualCapture(webcamVideo);
            console.log('Starting dual snapshot capture with GPT-4o analysis');
          }
        }
      } else {
        console.log('Video paused - pausing capture');
        pauseProcessing();
        stopAutoCapture();
        pauseDualCapture();
      }
    }
  }, [isPlaying, hasStarted, videoEnded, resumeProcessing, pauseProcessing, startAutoCapture, stopAutoCapture, hasVideoElement, resumeDualCapture, pauseDualCapture]);

  const handleStart = () => {
    setCountdown(3);
  };

  // Set up video element for dual snapshot when video loads
  useEffect(() => {
    const videoElement = document.querySelector('video') as HTMLVideoElement;
    if (videoElement) {
      setVideoElement(videoElement);
    }
  }, [videoDuration, setVideoElement]);

  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown === 0) {
      setTimeout(() => {
        setCountdown(null);
        setHasStarted(true);
        setIsPlaying(true);
        startAutoCapture();
        
        // Also start dual snapshot capture if we have a video element
        if (hasVideoElement) {
          const videoElement = document.querySelector('video') as HTMLVideoElement;
          if (videoElement) {
            startDualCapture(videoElement);
          }
        }
      }, 500);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, startAutoCapture, hasVideoElement, startDualCapture]);

  // Generate current tip from feedback
  const currentTip: PracticeTip | undefined = currentFeedback?.live_feedback ? {
    joint: 'General',
    message: currentFeedback.live_feedback,
    beatIndex: Math.floor(videoCurrentTime * 2), // Convert time to approximate beat index
  } : undefined;

  return (
    <div className="relative h-screen w-full" style={{ backgroundImage: "linear-gradient(rgb(11, 14, 22) 0%, rgb(15, 18, 25) 50%, rgb(18, 22, 38) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)" }}>
      {/* Skip to Summary Button */}
      {hasStarted && (
        <button
          onClick={onReview}
          className="absolute top-6 right-6 z-40 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/20 text-white text-sm flex items-center gap-2 transition-all backdrop-blur-sm"
        >
          <SkipForward className="w-4 h-4" />
          Skip to Summary
        </button>
      )}

      {/* Start Button Overlay */}
      <AnimatePresence>
        {!hasStarted && countdown === null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <motion.button
              onClick={handleStart}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative group"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="relative flex items-center gap-4 px-12 py-6 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full">
                <Play className="w-8 h-8 text-white" />
                <span className="text-white text-2xl uppercase tracking-wider">Start Practice</span>
              </div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative"
            >
              <div 
                className="absolute inset-0 blur-3xl opacity-80"
                style={{
                  background: `radial-gradient(circle, ${
                    countdown === 3 ? '#22d3ee' : countdown === 2 ? '#a855f7' : '#ec4899'
                  } 0%, transparent 70%)`
                }}
              />
              <div 
                className="relative text-[200px] leading-none"
                style={{
                  color: countdown === 3 ? '#22d3ee' : countdown === 2 ? '#a855f7' : '#ec4899',
                  textShadow: `0 0 40px ${countdown === 3 ? '#22d3ee' : countdown === 2 ? '#a855f7' : '#ec4899'}`
                }}
              >
                {countdown}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Congratulations Overlay */}
      <AnimatePresence>
        {showCongratulations && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: -50 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative text-center"
            >
              {/* Background glow effect */}
              <div 
                className="absolute inset-0 blur-3xl opacity-60"
                style={{
                  background: 'radial-gradient(circle, #22d3ee 0%, #a855f7 50%, #ec4899 100%, transparent 70%)'
                }}
              />
              
              {/* Main content */}
              <div className="relative bg-gradient-to-br from-cyan-500/20 to-purple-500/20 backdrop-blur-sm border border-white/20 rounded-2xl p-12 max-w-lg mx-4">
                {/* Celebration emoji */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                  className="text-8xl mb-6"
                >
                  🎉
                </motion.div>
                
                {/* Congratulations text */}
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                  className="text-4xl font-bold text-white mb-4"
                >
                  Congratulations!
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7, duration: 0.6 }}
                  className="text-lg text-white/80 mb-6"
                >
                  You've completed the routine! Your final accuracy was <span className="text-cyan-400 font-semibold">{overallAccuracy}%</span>
                </motion.p>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                  className="text-sm text-white/60 mb-6"
                >
                  Auto-navigating to summary in {autoNavigateCountdown} seconds...
                </motion.p>
                
                {/* View Summary button */}
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9, duration: 0.4 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setShowCongratulations(false);
                    onReview();
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-semibold rounded-full transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  View Performance Summary
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full max-w-[1159.2px] h-full">
          {/* Time Progress Bar at Top */}
          <div 
            className={`absolute bg-gradient-to-b from-[#1a1d2e] h-[80px] left-0 to-[rgba(0,0,0,0)] top-0 w-full ${videoEnded ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
            onClick={handleTimelineClick}
            onMouseMove={handleTimelineHover}
          >
            <div aria-hidden="true" className="absolute border-[0px_0px_0.8px] border-[rgba(255,255,255,0.05)] border-solid inset-0 pointer-events-none" />
          
            {/* Progress Bar Background */}
            <div className="absolute h-[79.2px] left-0 top-0 w-full">
              <div className="absolute inset-0 bg-black/20 rounded-sm hover:bg-black/30 transition-colors" />
            </div>

            {/* Progress Bar Fill */}
            <div
              className="absolute bg-gradient-to-r from-cyan-500/30 to-purple-500/30 h-[79.2px] transition-all duration-100"
              style={{ width: `${progressPercentage}%` }}
            />

            {/* Time Markers (every 10 seconds) */}
            <div className="absolute h-[79.2px] left-0 top-0 w-full">
              {videoDuration > 0 && Array.from({ length: Math.ceil(videoDuration / 10) }).map((_, idx) => {
                const time = idx * 10;
                const position = (time / videoDuration) * 100;
                
                return (
                  <div
                    key={idx}
                    className={`absolute ${
                      time % 30 === 0
                        ? 'bg-[rgba(255,255,255,0.4)] h-[24px] top-[43.2px]' // Every 30 seconds
                        : 'bg-[rgba(255,255,255,0.15)] h-[12px] top-[55.2px]' // Every 10 seconds
                    } w-px`}
                    style={{ left: `${position}%` }}
                  />
                );
              })}
            </div>

            {/* Playhead */}
            <div
              className="absolute bg-[#00d3f3] h-[79.2px] shadow-[0px_0px_20px_0px_rgba(34,211,238,0.8),0px_0px_40px_0px_rgba(34,211,238,0.4)] top-0 w-[3px] transition-all duration-100"
              style={{ left: `${progressPercentage}%` }}
            >
              <div className="bg-[#00d3f3] h-[12px] rounded-[2.68435e+07px] shadow-[0px_0px_12px_0px_#22d3ee,0px_0px_24px_0px_rgba(34,211,238,0.6)] w-full" />
            </div>

            {/* Time Display */}
            <div className="absolute h-[15.988px] left-[16px] top-[51.2px]">
              <p className="font-['Arimo',_sans-serif] font-normal leading-[16px] text-[#6a7282] text-[12px]">
                {formattedCurrentTime}
              </p>
            </div>
            <div className="absolute h-[15.988px] right-[16px] top-[51.2px]">
              <p className="font-['Arimo',_sans-serif] font-normal leading-[16px] text-[#6a7282] text-[12px]">
                {formattedDuration}
              </p>
            </div>
          </div>

          {/* Three Column Layout - User, Live Feedback, Performer */}
          <div className="absolute h-[594.4px] left-[24px] top-[80px] w-[1111.2px]">
            {/* Left: User View */}
            <div className="absolute bg-gradient-to-b from-[#0b0e16] h-[537px] left-[24px] rounded-[10px] to-[#121626] top-[21px] w-[400.025px]">
              <div className="h-[537px] overflow-clip relative rounded-[inherit] w-full">
                <div className="absolute left-[16.8px] top-[16.8px] z-10">
                  <p className="font-['Arimo',_sans-serif] font-normal leading-[16px] text-[#6a7282] text-[12px] tracking-[0.6px] uppercase">
                    User
                  </p>
                </div>
                {/* Live Camera Feed */}
                <LiveCameraView
                  className="absolute inset-0 rounded-[inherit] w-full h-full"
                  onSnapshot={handleSnapshot}
                  autoSnapshot={hasStarted && isCapturing && isPlaying}
                  snapshotInterval={500}
                  showMirrorButton={true}
                  mirrorButtonPosition="top-right"
                />
              </div>
              <div aria-hidden="true" className="absolute border-[0.8px] border-[rgba(255,255,255,0.05)] border-solid inset-0 pointer-events-none rounded-[10px]" />
            </div>

            {/* Center: Live Feedback Column */}
            <div className="absolute bg-gradient-to-b from-[#0b0e16] h-[537px] left-[466px] rounded-[10px] to-[#121626] top-[24px] w-[156px]">
              <LiveFeedback 
                overallAccuracy={overallAccuracy}
                currentTip={currentTip}
                isPlaying={isPlaying}
                dualFeedback={dualFeedback}
                dualError={dualError}
              />
              <div aria-hidden="true" className="absolute border-[0.8px] border-[rgba(255,255,255,0.05)] border-solid inset-0 pointer-events-none rounded-[10px]" />
            </div>

            {/* Right: Reference Video */}
            <div className="absolute bg-gradient-to-b from-[#0b0e16] h-[537px] left-[673px] rounded-[10px] to-[#121626] top-[24px] w-[438px]">
              <div className="h-[537px] overflow-clip relative rounded-[inherit] w-full">
                <div className="absolute left-[301.15px] top-[16.8px]">
                  <p className="font-['Arimo',_sans-serif] font-normal leading-[16px] text-[#6a7282] text-[12px] tracking-[0.6px] uppercase">
                    Reference
                  </p>
                </div>
                {/* Video Player */}
                <VideoPlayer
                  videoSrc={videoSrc}
                  isPlaying={isPlaying}
                  currentTime={videoCurrentTime}
                  duration={videoDuration}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onLoadedMetadata={setVideoDuration}
                  onPlayPause={() => setIsPlaying(!isPlaying)}
                  onRestart={() => {
                    // Go back 10 seconds instead of to beginning
                    const newTime = Math.max(0, videoCurrentTime - 10);
                    setVideoCurrentTime(newTime);
                    setIsPlaying(false);
                    setCurrentFeedback(null);
                    setOverallAccuracy(82);
                  }}
                  playbackRate={playbackRate}
                  mirror={mirrorVideo}
                  showSkeleton={showSkeleton}
                  className="w-full h-full"
                />

                {/* Reference Video Mirror Button */}
                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={() => setMirrorVideo(!mirrorVideo)}
                    className="px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/20 rounded-lg text-white text-xs flex items-center gap-1 transition-all backdrop-blur-sm"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {mirrorVideo ? 'Unmirror' : 'Mirror'}
                  </button>
                </div>
              </div>
              <div aria-hidden="true" className="absolute border-[0.8px] border-[rgba(255,255,255,0.05)] border-solid inset-0 pointer-events-none rounded-[10px]" />
            </div>
          </div>

          {/* Control Bar */}
          <div className="absolute bg-gradient-to-b from-[#0f1219] h-[80.8px] left-0 to-[#0f1219] top-[674.4px] via-50% via-[#13161f] w-full">
            <PracticeControlBar
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onRestart={() => {
                // Go back 10 seconds instead of to beginning
                const newTime = Math.max(0, videoCurrentTime - 10);
                setVideoCurrentTime(newTime);
                
                // Update the video element directly
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                  videoElement.currentTime = newTime;
                }
                
                // Pause the video
                setIsPlaying(false);
                
                // Reset feedback
                setCurrentFeedback(null);
                setOverallAccuracy(82);
                
                // Stop capture temporarily
                stopAutoCapture();
                
                // Start 5-second countdown before resuming
                setTimeout(() => {
                  console.log('5-second countdown finished, ready to resume');
                  // Don't auto-resume, let user click play
                }, 5000);
              }}
              onSettings={onSettings}
              fps={30}
              warnings={[]}
              playbackRate={playbackRate}
              onPlaybackRateChange={setPlaybackRate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to format time
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
