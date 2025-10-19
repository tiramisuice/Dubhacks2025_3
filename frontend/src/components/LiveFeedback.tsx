import { useState, useEffect } from 'react';
import { PracticeTip } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, CheckCircle2, AlertCircle, Brain, Zap } from 'lucide-react';

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
}

export function LiveFeedback({ overallAccuracy, currentTip, isPlaying, dualFeedback, dualError }: LiveFeedbackProps) {
  // Store the last Tier 2 feedback to prevent flickering
  const [lastTier2Feedback, setLastTier2Feedback] = useState<string | null>(null);

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

  const getAccuracyColor = () => {
    if (overallAccuracy >= 80) return 'text-green-400';
    if (overallAccuracy >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getAccuracyLabel = () => {
    if (overallAccuracy >= 90) return 'Excellent!';
    if (overallAccuracy >= 80) return 'Great!';
    if (overallAccuracy >= 70) return 'Good';
    if (overallAccuracy >= 60) return 'Keep going';
    return 'Focus!';
  };

  return (
    <div className="h-full flex flex-col py-6 px-4 bg-gradient-to-b from-[#0f1219] to-[#13161f]">
      {/* Status Badge at Top */}
      <div className="mb-8">
        <div className="relative">
          <div 
            className={`text-center py-4 px-6 rounded-2xl border-2 ${
              overallAccuracy >= 80 
                ? 'bg-green-500/10 border-green-500/50' 
                : overallAccuracy >= 60
                ? 'bg-yellow-500/10 border-yellow-500/50'
                : 'bg-red-500/10 border-red-500/50'
            }`}
            style={{
              boxShadow: overallAccuracy >= 80 
                ? '0 0 20px rgba(34, 197, 94, 0.2)' 
                : overallAccuracy >= 60
                ? '0 0 20px rgba(234, 179, 8, 0.2)'
                : '0 0 20px rgba(239, 68, 68, 0.2)'
            }}
          >
            <div className={`text-3xl mb-1 ${getAccuracyColor()}`}>
              {Math.round(overallAccuracy)}%
            </div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">
              {getAccuracyLabel()}
            </div>
          </div>
        </div>
      </div>

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
