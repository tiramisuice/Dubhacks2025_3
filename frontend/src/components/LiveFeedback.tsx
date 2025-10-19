import { useState, useEffect } from 'react';
import { PracticeTip } from '../types';
import { motion } from 'motion/react';
import { Flame, CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import { MediaPipeResponse } from '../services/mediapipeService';

interface DualFeedback {
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

interface LiveFeedbackProps {
  overallAccuracy: number;
  currentTip?: PracticeTip;
  isPlaying: boolean;
  dualFeedback?: DualFeedback | null;
  dualError?: Error | null;
  mediaPipeResult?: MediaPipeResponse | null;
  mediaPipeError?: string | null;
}

export function LiveFeedback({ overallAccuracy, isPlaying, dualFeedback, dualError, mediaPipeResult, mediaPipeError }: LiveFeedbackProps) {
  // Store the last Tier 2 feedback to prevent flickering
  const [lastTier2Feedback, setLastTier2Feedback] = useState<string | null>(null);

  // Clear feedback when video is paused
  useEffect(() => {
    if (!isPlaying && lastTier2Feedback) {
      console.log('[LiveFeedback] Video paused - clearing Tier 2 feedback');
      setLastTier2Feedback(null);
    }
  }, [isPlaying, lastTier2Feedback]);

  // Only process and update when we have actual Tier 2 data
  useEffect(() => {
    if (dualFeedback && dualFeedback.overall_feedback) {
      console.log('[LiveFeedback] Received Tier 2 feedback:', {
        overall_feedback: dualFeedback.overall_feedback,
        overall_similarity_score: dualFeedback.overall_similarity_score,
        trend_analysis: dualFeedback.trend_analysis,
        encouragement: dualFeedback.encouragement
      });
      
      // Only update if this is actually new Tier 2 feedback
      if (dualFeedback.overall_feedback !== lastTier2Feedback) {
        console.log('[LiveFeedback] ✅ New Tier 2 feedback received, updating display');
        setLastTier2Feedback(dualFeedback.overall_feedback);
      } else {
        console.log('[LiveFeedback] ⏳ Same Tier 2 feedback, keeping current display');
      }
    } else if (dualFeedback && !dualFeedback.overall_feedback) {
      console.log('[LiveFeedback] ⏳ Received data without Tier 2 feedback, ignoring');
    }
  }, [dualFeedback, lastTier2Feedback]);

  // Removed hardcoded feedback simulation - only show real AI feedback

  return (
    <div className="h-full flex flex-col py-6 px-4 bg-gradient-to-b from-[#0f1219] to-[#13161f]">

      {/* Live Feedback Messages */}
      <div className="flex-1 space-y-3 overflow-hidden">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-4 text-center">
          Live Feedback
        </div>
        
        {/* Display Tier 2 feedback - only updates when new Tier 2 data arrives */}
        {lastTier2Feedback && (
          <motion.div
            key={lastTier2Feedback} // Use the feedback text as key to trigger animation only on new content
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 backdrop-blur-sm"
            style={{
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.15)'
            }}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-purple-300 mb-1">AI Analysis</div>
                <div className="text-sm text-white/90 leading-tight">{lastTier2Feedback}</div>
                <div className="text-xs text-gray-500 mt-1">Beat {Math.floor(Date.now() / 1000) % 100}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* MediaPipe Results Display */}
        {mediaPipeResult && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 backdrop-blur-sm"
            style={{
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.15)'
            }}
          >
            <div className="flex items-start gap-2">
              <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-cyan-300 mb-1">MediaPipe Analysis</div>
                <div className="text-sm text-white/90 leading-tight">
                  {mediaPipeResult.user_pose_detected && mediaPipeResult.reference_pose_detected ? (
                    <>
                      <div className="mb-1">
                        <span className="text-cyan-400 font-semibold">
                          {(mediaPipeResult.similarity_score * 100).toFixed(1)}%
                        </span> pose similarity
                      </div>
                      <div className="text-xs text-gray-400">
                        Processing: {mediaPipeResult.processing_time.toFixed(2)}s
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400">
                      {!mediaPipeResult.user_pose_detected && !mediaPipeResult.reference_pose_detected
                        ? 'No poses detected'
                        : !mediaPipeResult.user_pose_detected
                        ? 'User pose not detected'
                        : 'Reference pose not detected'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* MediaPipe Error Display */}
        {mediaPipeError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 backdrop-blur-sm"
          >
            <div className="text-sm text-orange-400 text-center">
              MediaPipe analysis failed: {mediaPipeError}
            </div>
          </motion.div>
        )}

        {/* Error Display */}
        {dualError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm"
          >
            <div className="text-sm text-red-400 text-center">
              AI analysis temporarily unavailable
            </div>
          </motion.div>
        )}
      </div>

      {/* Motivational Icon at Bottom */}
      <div className="mt-auto pt-6 flex justify-center">
        {overallAccuracy >= 80 ? (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Flame className="w-8 h-8 text-orange-400" />
          </motion.div>
        ) : (
          <CheckCircle2 className="w-8 h-8 text-gray-600" />
        )}
      </div>
    </div>
  );
}
