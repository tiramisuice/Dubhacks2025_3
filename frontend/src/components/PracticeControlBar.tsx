import { Badge } from './ui/badge';
import { Play, Pause, RotateCcw, Gauge, Settings, Activity } from 'lucide-react';

interface PracticeControlBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onMediaPipe?: () => void;
  fps?: number;
  warnings?: string[];
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  mediaPipeActive?: boolean;
}

export function PracticeControlBar({
  isPlaying,
  onPlayPause,
  onRestart,
  onSettings,
  onMediaPipe,
  fps = 60,
  warnings = [],
  playbackRate = 1,
  onPlaybackRateChange,
  mediaPipeActive = false,
}: PracticeControlBarProps) {

  return (
    <div className="bg-gradient-to-r from-[#0f1219] via-[#13161f] to-[#0f1219] border-t border-white/10 px-6 py-4">
      <div className="max-w-[2000px] mx-auto flex items-center justify-between gap-6">
        {/* Left: Main Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPlayPause}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center transition-all shadow-lg hover:shadow-purple-500/50"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" />
            )}
          </button>

          <button
            onClick={onRestart}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10"
          >
            <RotateCcw className="w-4 h-4 text-gray-400" />
          </button>

          <div className="h-8 w-[1px] bg-white/10 mx-2" />

          {/* Speed */}
          <button
            onClick={() => onPlaybackRateChange?.(playbackRate === 1 ? 0.75 : 1)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-white transition-all flex items-center gap-1"
          >
            <Gauge className="w-3 h-3" />
            {playbackRate}×
          </button>
        </div>

        {/* Center: MediaPipe & Settings */}
        <div className="flex items-center gap-3">
          {/* MediaPipe Toggle */}
          {onMediaPipe && (
            <button
              onClick={onMediaPipe}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${
                mediaPipeActive
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-500 border-cyan-400/50 shadow-lg shadow-cyan-500/25'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
              title={mediaPipeActive ? 'Disable MediaPipe Analysis' : 'Enable MediaPipe Analysis'}
            >
              <Activity className={`w-4 h-4 ${mediaPipeActive ? 'text-white' : 'text-gray-400'}`} />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={onSettings}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Right: Status */}
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="border-green-500/30 text-green-400 bg-green-500/10 text-xs"
          >
            {fps} FPS
          </Badge>

          {/* MediaPipe Status */}
          {onMediaPipe && (
            <Badge
              variant="outline"
              className={`text-xs ${
                mediaPipeActive
                  ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10'
                  : 'border-gray-500/30 text-gray-400 bg-gray-500/10'
              }`}
            >
              {mediaPipeActive ? 'MediaPipe ON' : 'MediaPipe OFF'}
            </Badge>
          )}

          {warnings.length === 0 ? (
            <Badge
              variant="outline"
              className="border-green-500/30 text-green-400 bg-green-500/10 text-xs"
            >
              Connection OK
            </Badge>
          ) : (
            warnings.map((warning, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10 text-xs"
              >
                {warning}
              </Badge>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
