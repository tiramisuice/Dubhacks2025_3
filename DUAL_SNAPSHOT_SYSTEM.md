# Dual Snapshot System for Real-time Dance Feedback

## Overview

This system implements real-time dance pose comparison using GPT-4o vision analysis, similar to the approach used in `riptide-ai2/split_video.py` but adapted for dance training. The system captures both webcam and reference video frames every 0.5 seconds and sends them to GPT-4o for detailed pose comparison and feedback.

## 🎯 Key Features

- **Real-time Dual Capture**: Captures webcam and reference video frames simultaneously
- **GPT-4o Vision Analysis**: Uses OpenAI's vision API for detailed pose comparison
- **0.5-second Intervals**: Provides frequent feedback during practice sessions
- **Detailed Feedback**: Includes specific issues, recommendations, and similarity scores
- **Cost Optimization**: Automatically downscales images to reduce API costs
- **Error Handling**: Robust fallback mechanisms for API failures

## 🏗️ Architecture

### Backend Components

1. **DualSnapshotService** (`app/services/dual_snapshot_service.py`)
   - Handles dual snapshot capture and processing
   - Manages image downscaling for cost optimization
   - Integrates with OpenAI GPT-4o vision API
   - Provides detailed dance feedback analysis

2. **API Endpoint** (`/api/sessions/dual-snapshot`)
   - Accepts webcam image, reference video path, and timestamp
   - Returns detailed feedback with similarity scores
   - Handles errors gracefully with fallback responses

### Frontend Components

1. **DualSnapshotService** (`src/services/dualSnapshotService.ts`)
   - Manages dual snapshot capture from webcam and video
   - Handles API communication with backend
   - Provides auto-capture functionality with configurable intervals

2. **useDualSnapshot Hook** (`src/hooks/useDualSnapshot.ts`)
   - React hook for integrating dual snapshot functionality
   - Manages state and provides easy-to-use interface
   - Handles feedback history and error states

3. **Enhanced LiveFeedback Component**
   - Displays GPT-4o analysis results
   - Shows specific issues and recommendations
   - Provides visual feedback with color-coded severity levels

## 🚀 Usage

### Backend API

```python
# Process dual snapshot
POST /api/sessions/dual-snapshot
{
  "webcam_image": "data:image/jpeg;base64,...",
  "reference_video_path": "/path/to/video.mp4",
  "video_timestamp": 5.0,
  "session_id": "session_123"
}

# Response
{
  "timestamp": 5.0,
  "feedback_text": "Great posture! Extend your left arm more.",
  "severity": "medium",
  "focus_areas": ["left_arm", "posture"],
  "similarity_score": 0.85,
  "is_positive": true,
  "specific_issues": ["Left arm not fully extended"],
  "recommendations": ["Extend your left arm to match the reference angle"],
  "success": true
}
```

### Frontend Integration

```typescript
import { useDualSnapshot } from '../hooks/useDualSnapshot';

function PracticePage() {
  const {
    isCapturing,
    currentFeedback,
    startCapture,
    stopCapture,
    setVideoElement
  } = useDualSnapshot({
    sessionId: 'session_123',
    referenceVideoPath: '/videos/routine.mp4',
    apiBaseUrl: 'http://localhost:8000',
    captureInterval: 500
  });

  // Start capture when video begins
  const handleVideoStart = () => {
    const webcamVideo = document.querySelector('#webcam') as HTMLVideoElement;
    const referenceVideo = document.querySelector('#reference') as HTMLVideoElement;
    
    setVideoElement(referenceVideo);
    startCapture(webcamVideo);
  };

  return (
    <div>
      {currentFeedback && (
        <div className="feedback">
          <p>{currentFeedback.feedback_text}</p>
          <p>Similarity: {Math.round(currentFeedback.similarity_score * 100)}%</p>
        </div>
      )}
    </div>
  );
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-your-openai-api-key

# Optional
DUAL_SNAPSHOT_MAX_IMAGE_SIZE=640x480
DUAL_SNAPSHOT_CAPTURE_INTERVAL=500
```

### Service Configuration

```typescript
const dualSnapshotOptions = {
  sessionId: 'unique_session_id',
  referenceVideoPath: '/path/to/reference/video.mp4',
  apiBaseUrl: 'http://localhost:8000',
  captureInterval: 500, // milliseconds
  onFeedback: (feedback) => console.log('Feedback:', feedback),
  onError: (error) => console.error('Error:', error)
};
```

## 📊 Feedback Analysis

The GPT-4o analysis provides comprehensive feedback including:

### Analysis Criteria
1. **Body Alignment & Posture**
   - Overall body positioning and stance
   - Spine alignment and core engagement
   - Shoulder positioning and relaxation

2. **Arm Positioning & Movement**
   - Arm angles and extension
   - Hand positioning and finger placement
   - Elbow positioning and straightness

3. **Leg Positioning & Stance**
   - Foot placement and weight distribution
   - Knee positioning and alignment
   - Hip positioning and stability

4. **Head & Neck Positioning**
   - Head angle and direction
   - Neck alignment with spine
   - Facial expression and focus

5. **Timing & Flow**
   - Pose matching with reference timing
   - Smoothness of transitions
   - Overall movement quality

### Response Format
```json
{
  "overall_assessment": "Brief overall assessment",
  "similarity_score": 0.85,
  "severity": "medium",
  "focus_areas": ["left_arm", "right_leg", "posture"],
  "specific_issues": [
    "Left arm is not fully extended - should be at 45-degree angle",
    "Right leg stance is too narrow - should be shoulder-width apart"
  ],
  "recommendations": [
    "Extend your left arm more to match the reference angle",
    "Widen your stance by moving your right foot outward"
  ],
  "positive_feedback": "Great job maintaining good posture!",
  "is_positive": false
}
```

## 🧪 Testing

### Run Backend Tests
```bash
cd Dubhacks25/backend
python test_dual_snapshot.py
```

### Test with Real Video
1. Place a test video file in the backend directory
2. Update the video path in `test_dual_snapshot.py`
3. Run the test script
4. Verify GPT-4o analysis results

### Frontend Testing
1. Start the backend server: `uvicorn app.main:app --reload`
2. Start the frontend: `npm run dev`
3. Navigate to the practice page
4. Start a practice session and verify dual snapshot capture

## 💰 Cost Optimization

The system includes several cost optimization features:

1. **Image Downscaling**: Automatically resizes images to max 640x480 pixels
2. **JPEG Compression**: Uses 0.8 quality JPEG compression
3. **Smart Capture**: Only captures when video is playing
4. **Error Handling**: Prevents unnecessary API calls on errors

### Estimated Costs
- **Image Size**: ~50KB per image (downscaled)
- **API Calls**: 2 images per call (webcam + reference)
- **Frequency**: Every 0.5 seconds during practice
- **Cost**: ~$0.01-0.02 per minute of practice (depending on OpenAI pricing)

## 🔒 Security

- **API Key Protection**: OpenAI API key stored in environment variables
- **No Metadata Exposure**: Backend never returns OpenAI metadata to frontend
- **Input Validation**: All inputs validated before processing
- **Error Sanitization**: Error messages sanitized before returning to frontend

## 🚨 Error Handling

The system includes comprehensive error handling:

1. **API Failures**: Graceful fallback to generic feedback
2. **Image Processing Errors**: Continues with available data
3. **Network Issues**: Retry logic with exponential backoff
4. **Invalid Inputs**: Validation with clear error messages

## 📈 Performance

- **Capture Latency**: <100ms for image capture
- **API Response Time**: 2-5 seconds for GPT-4o analysis
- **Memory Usage**: Minimal - images processed in memory
- **CPU Usage**: Low - optimized image processing

## 🔄 Integration with Existing System

The dual snapshot system integrates seamlessly with the existing dance trainer:

1. **Backward Compatible**: Works alongside existing snapshot system
2. **Enhanced Feedback**: Provides more detailed analysis than pose comparison
3. **Unified UI**: Integrates with existing LiveFeedback component
4. **Session Management**: Uses existing session tracking

## 🎯 Future Enhancements

1. **Batch Processing**: Process multiple snapshots together
2. **Caching**: Cache reference frames to reduce processing
3. **Custom Models**: Fine-tune models for specific dance styles
4. **Real-time Streaming**: WebSocket-based real-time feedback
5. **Performance Analytics**: Track improvement over time

## 📚 Related Files

- `riptide-ai2/split_video.py` - Original inspiration for dual analysis
- `app/services/dual_snapshot_service.py` - Core service implementation
- `src/services/dualSnapshotService.ts` - Frontend service
- `src/hooks/useDualSnapshot.ts` - React integration hook
- `test_dual_snapshot.py` - Test script

## 🤝 Contributing

When contributing to the dual snapshot system:

1. Follow the existing code patterns
2. Add comprehensive error handling
3. Include tests for new functionality
4. Update documentation
5. Consider cost implications of changes

---

**Note**: This system requires an OpenAI API key with GPT-4o vision access. Ensure you have appropriate API credits and rate limits configured.
