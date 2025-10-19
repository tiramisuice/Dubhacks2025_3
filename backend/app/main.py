"""
FastAPI main application entry point.
Unified API for K-Pop Dance Trainer with real-time pose detection and feedback.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import base64
import time
import os
import numpy as np
import cv2
from PIL import Image
from io import BytesIO

# Import configuration
from app.data.config import settings

# Import services
from app.services.pose_comparison_service import PoseComparisonService
from app.services.pose_comparison_config import PoseComparisonConfig, DEFAULT_CONFIG, DANCE_CONFIG
from app.services.live_feedback_service import LiveFeedbackService, SnapshotData
from app.services.angle_calculator import AngleCalculator
from app.services.scoring import ScoringService
from app.services.feedback_generation import FeedbackGenerationService
from app.services.dual_snapshot_service import dual_snapshot_service, DualSnapshotData

# Import MediaPipe for pose detection
import mediapipe as mp

# Create FastAPI app instance
app = FastAPI(
    title="K-Pop Dance Trainer API",
    description="Real-time pose detection and dance feedback API",
    version="1.0.0",
)

# Startup event to test OpenAI API
@app.on_event("startup")
async def startup_event():
    """Test OpenAI API connection on server startup"""
    print("Server starting up...")
    
    # Import and run OpenAI test
    try:
        import sys
        import os
        sys.path.append(os.path.dirname(os.path.dirname(__file__)))
        
        from test_openai_startup import test_openai_connection
        
        print("Testing OpenAI API connection...")
        success = await test_openai_connection()
        
        if success:
            print("SUCCESS: OpenAI API is ready for dual snapshot analysis!")
        else:
            print("WARNING: OpenAI API test failed - dual snapshot may not work properly")
            
    except Exception as e:
        print(f"WARNING: Could not test OpenAI API: {e}")
    
    print("Server startup complete!")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# PYDANTIC MODELS FOR REQUEST/RESPONSE
# ============================================================================

class ImageSnapshotRequest(BaseModel):
    """Request model for processing image snapshots."""
    image: str  # base64 encoded image


class ProcessSnapshotResponse(BaseModel):
    """Response model for processed snapshots."""
    timestamp: float
    pose_landmarks: Optional[List[List[float]]] = None
    hand_landmarks: List[List[List[float]]] = []
    hand_classifications: List[Dict[str, Any]] = []
    preprocessed_angles: Dict[str, float] = {}
    comparison_result: Optional[Dict[str, Any]] = None
    live_feedback: Optional[str] = None
    success: bool
    error: Optional[str] = None


class StartSessionResponse(BaseModel):
    """Response model for session start."""
    session_id: str
    message: str


class SessionStatusResponse(BaseModel):
    """Response model for session status."""
    session_id: Optional[str]
    start_time: Optional[float]
    pose_count: int
    reference_video: Optional[str]
    session_duration: float


class SessionFeedbackResponse(BaseModel):
    """Response model for session end feedback with AI-generated summary."""
    session_id: str
    total_poses: int
    average_similarity: float
    session_summary: str  # AI-generated overall summary
    detailed_feedback: List[Dict[str, Any]] = []  # Individual feedback items from session

    # AI-generated insights (optional - only if summary was generated)
    key_insights: Optional[List[str]] = None
    improvement_areas: Optional[List[Dict[str, Any]]] = None
    strengths: Optional[List[str]] = None
    severity_distribution: Optional[Dict[str, int]] = None


class LoadReferenceRequest(BaseModel):
    """Request model for loading reference video."""
    video_name: str


class UpdateConfigRequest(BaseModel):
    """Request model for updating pose comparison config."""
    pose_weight: Optional[float] = None
    motion_weight: Optional[float] = None
    dtw_enabled: Optional[bool] = None
    preset: Optional[str] = None  # "default", "dance", "position_focused", "motion_focused"


class DualSnapshotRequest(BaseModel):
    """Request model for dual snapshot analysis (webcam + reference video)."""
    webcam_image: str  # base64 encoded webcam image
    reference_video_path: str  # path to reference video file
    video_timestamp: float  # current timestamp in reference video
    session_id: str


class DualSnapshotResponse(BaseModel):
    """Response model for dual snapshot analysis."""
    timestamp: float
    feedback_text: str
    severity: str  # "high", "medium", "low"
    focus_areas: List[str]
    similarity_score: float
    is_positive: bool
    specific_issues: List[str]
    recommendations: List[str]
    success: bool
    
    # Tier 2 analysis fields (optional)
    tier2_analysis: Optional[Dict] = None
    overall_feedback: Optional[str] = None
    overall_similarity_score: Optional[float] = None
    trend_analysis: Optional[str] = None
    key_improvements: Optional[List[str]] = None
    encouragement: Optional[str] = None
    error: Optional[str] = None


# ============================================================================
# GLOBAL STATE MANAGEMENT
# ============================================================================

# Initialize MediaPipe
mp_pose = mp.solutions.pose
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

# Initialize pose and hand detection
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=settings.mediapipe_model_complexity,
    enable_segmentation=False,
    min_detection_confidence=settings.mediapipe_min_detection_confidence,
    min_tracking_confidence=settings.mediapipe_min_tracking_confidence
)

hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Global services (INTERNAL - Never exposed to API)
comparison_service: Optional[PoseComparisonService] = None
live_feedback_service = LiveFeedbackService()  # Internal LLM service
scoring_service = ScoringService()
feedback_generation_service = FeedbackGenerationService()  # Internal LLM service
angle_calculator = AngleCalculator()
current_config = DEFAULT_CONFIG

# Session management
current_session = {
    'session_id': None,
    'start_time': None,
    'pose_data': [],
    'feedback_history': [],
    'reference_video': None
}

# Pose sequence storage
pose_sequence = []
MAX_SEQUENCE_LENGTH = 100  # Keep last 100 poses


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def load_reference_video(video_name: str) -> bool:
    """
    Load reference video for pose comparison.

    Args:
        video_name: Name of the reference video (without extension)

    Returns:
        bool: True if loaded successfully, False otherwise
    """
    global comparison_service
    try:
        # Get the correct path relative to app directory
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_path = os.path.join(current_dir, "data", "processed_poses", f"{video_name}_poses.npy")

        if not os.path.exists(data_path):
            print(f"Reference video file not found: {data_path}")
            return False

        # Load the numpy array
        reference_data = np.load(data_path, allow_pickle=True)

        # Convert to format expected by PoseComparisonService
        reference_poses_list = []
        for frame_data in reference_data:
            if frame_data.get('has_pose', False):
                pose_dict = {
                    'landmarks': frame_data['landmarks'],
                    'timestamp': frame_data['timestamp'],
                    'frame_number': frame_data['frame_number']
                }
                reference_poses_list.append(pose_dict)

        # Initialize comparison service with reference poses
        comparison_service = PoseComparisonService(reference_poses_list, current_config)
        current_session['reference_video'] = video_name

        print(f"✅ Loaded {len(reference_poses_list)} reference poses from {video_name}")
        return True

    except Exception as e:
        print(f"❌ Error loading reference video: {e}")
        import traceback
        traceback.print_exc()
        return False


def generate_llm_feedback(image_data: str, comparison_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Generate LLM-powered feedback using LiveFeedbackService (INTERNAL).

    This function calls the internal LiveFeedbackService which uses OpenAI.
    The OpenAI client and all LLM details are NEVER exposed to the API layer.

    Args:
        image_data: Base64 encoded image
        comparison_result: Pose comparison results

    Returns:
        Optional[Dict]: Feedback dictionary with:
            - feedback_text: str (processed text only, NO OpenAI metadata)
            - severity: str ("high", "medium", "low")
            - focus_areas: List[str] (body parts needing attention)
            - is_positive: bool (encouragement vs correction)
            - context: Dict (performance context)
        Returns None if no feedback generated.
    """
    try:
        # Convert comparison data to SnapshotData format
        snapshot_data = SnapshotData(
            timestamp=time.time(),
            frame_base64=image_data,
            pose_similarity=comparison_result.get('pose_score', 0.0),
            motion_similarity=comparison_result.get('motion_score', 0.0),
            combined_score=comparison_result.get('combined_score', 0.0),
            errors=[],  # TODO: Convert angle/position differences to error format
            best_match_idx=comparison_result.get('best_match_idx', 0),
            reference_timestamp=0.0,
            timing_offset=0.0
        )

        # Call INTERNAL service (OpenAI interaction happens here, internally)
        feedback_result = live_feedback_service.process_snapshot(snapshot_data)

        if feedback_result:
            # Return complete feedback object (NO OpenAI metadata, just processed results)
            return {
                'feedback_text': feedback_result.get('feedback_text', 'Keep practicing!'),
                'severity': feedback_result.get('severity', 'medium'),
                'focus_areas': feedback_result.get('focus_areas', []),
                'is_positive': feedback_result.get('is_positive', False),
                'context': feedback_result.get('context', {})
            }
        else:
            # No feedback generated (score was good enough)
            return None

    except Exception as e:
        print(f"LLM feedback generation failed: {e}")
        # Return fallback feedback
        combined_score = comparison_result.get('combined_score', 0.0)
        return {
            'feedback_text': "Great pose! Keep it up!" if combined_score >= 0.8 else "Keep practicing!",
            'severity': 'low' if combined_score >= 0.8 else 'medium',
            'focus_areas': [],
            'is_positive': combined_score >= 0.8,
            'context': {}
        }


def process_image_snapshot(image_data: str) -> Dict[str, Any]:
    """
    Process a single image snapshot for pose detection and comparison.

    Args:
        image_data: Base64 encoded image

    Returns:
        dict: Processing results including landmarks, comparison, and feedback
    """
    try:
        # Convert base64 to image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Process pose
        pose_results = pose.process(rgb_frame)

        # Process hands
        hand_results = hands.process(rgb_frame)

        # Extract landmarks
        pose_landmarks = None
        hand_landmarks = []
        hand_classifications = []
        preprocessed_angles = {}

        if pose_results.pose_landmarks:
            # Convert pose landmarks to numpy array
            pose_landmarks = np.array([
                [lm.x, lm.y, lm.z, lm.visibility]
                for lm in pose_results.pose_landmarks.landmark
            ])

        if hand_results.multi_hand_landmarks:
            for idx, hand_landmark in enumerate(hand_results.multi_hand_landmarks):
                # Convert hand landmarks to numpy array
                hand_array = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmark.landmark])
                hand_landmarks.append(hand_array)

                # Get hand classification
                if hand_results.multi_handedness and idx < len(hand_results.multi_handedness):
                    handedness = hand_results.multi_handedness[idx]
                    hand_classifications.append({
                        'label': handedness.classification[0].label,
                        'confidence': handedness.classification[0].score
                    })

        # Calculate preprocessed angles if we have pose landmarks
        if pose_landmarks is not None:
            try:
                # Flatten pose landmarks for angle calculation (x, y, z coordinates only)
                pose_flat = pose_landmarks[:, :3].flatten()

                # Calculate angles
                if hand_landmarks:
                    hand_flat = hand_landmarks[0].flatten()
                    preprocessed_angles = angle_calculator.calculate_all_angles(pose_flat, hand_flat)
                else:
                    preprocessed_angles = angle_calculator.calculate_all_angles(pose_flat)

            except Exception as e:
                print(f"Error calculating angles: {e}")
                preprocessed_angles = {}

        # Perform real-time comparison if service is available
        comparison_result = None
        live_feedback = None

        if pose_landmarks is not None and comparison_service is not None:
            try:
                # Compare with reference
                comparison_result = comparison_service.update_user_pose(pose_landmarks)

                # Generate detailed feedback using LiveFeedbackService (internal LLM call)
                # Returns processed feedback dict (NO OpenAI metadata)
                feedback_data = generate_llm_feedback(image_data, comparison_result)

                # Store in session data
                current_session['pose_data'].append({
                    'timestamp': time.time(),
                    'pose_landmarks': pose_landmarks,
                    'comparison_result': comparison_result
                })

                # Store complete feedback record for session summary (if feedback was generated)
                # This data structure is used by FeedbackGenerationService.generate_session_summary()
                if feedback_data:
                    session_timestamp = time.time() - current_session['start_time'] if current_session['start_time'] else 0

                    current_session['feedback_history'].append({
                        # Required fields for session summary
                        'timestamp': session_timestamp,  # Seconds from session start
                        'feedback_text': feedback_data.get('feedback_text', ''),
                        'severity': feedback_data.get('severity', 'medium'),
                        'focus_areas': feedback_data.get('focus_areas', []),
                        'similarity_score': comparison_result.get('combined_score', 0.0),
                        'is_positive': feedback_data.get('is_positive', False),

                        # Additional context for analysis
                        'context': feedback_data.get('context', {})
                    })

                # Extract feedback text for immediate response
                live_feedback = feedback_data.get('feedback_text', None) if feedback_data else None

                # Add to scoring service
                scoring_service.add_score(
                    timestamp=time.time() - current_session['start_time'] if current_session['start_time'] else 0,
                    combined_score=comparison_result.get('combined_score', 0.0),
                    pose_score=comparison_result.get('pose_score', 0.0),
                    motion_score=comparison_result.get('motion_score', 0.0),
                    errors=[]
                )

            except Exception as e:
                print(f"Error in pose comparison: {e}")
                comparison_result = None
                live_feedback = "Comparison unavailable"

        # Create result
        result = {
            'timestamp': time.time(),
            'pose_landmarks': pose_landmarks.tolist() if pose_landmarks is not None else None,
            'hand_landmarks': [hand.tolist() for hand in hand_landmarks],
            'hand_classifications': hand_classifications,
            'preprocessed_angles': preprocessed_angles,
            'comparison_result': comparison_result,
            'live_feedback': live_feedback,
            'success': True
        }

        # Add to sequence for comparison
        if pose_landmarks is not None:
            pose_sequence.append(pose_landmarks)
            if len(pose_sequence) > MAX_SEQUENCE_LENGTH:
                pose_sequence.pop(0)

        return result

    except Exception as e:
        return {
            'timestamp': time.time(),
            'pose_landmarks': None,
            'hand_landmarks': [],
            'hand_classifications': [],
            'preprocessed_angles': {},
            'comparison_result': None,
            'live_feedback': None,
            'success': False,
            'error': str(e)
        }


# ============================================================================
# API ENDPOINTS - HEALTH & ROOT
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint - API information."""
    return {
        "message": "K-Pop Dance Trainer API",
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "sessions": "/api/sessions",
            "reference": "/api/reference",
            "config": "/api/config"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with system status."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": time.time(),
        "reference_loaded": comparison_service is not None,
        "active_session": current_session['session_id'] is not None,
        "services": {
            "pose_comparison": comparison_service is not None,
            "live_feedback": True,
            "scoring": True
        }
    }


# ============================================================================
# API ENDPOINTS - SESSION MANAGEMENT
# ============================================================================

@app.post("/api/sessions/start", response_model=StartSessionResponse)
async def start_session():
    """
    Start a new dance session.

    Returns:
        StartSessionResponse: Session ID and confirmation message
    """
    global current_session

    session_id = f"session_{int(time.time())}"
    current_session = {
        'session_id': session_id,
        'start_time': time.time(),
        'pose_data': [],
        'feedback_history': [],
        'reference_video': current_session.get('reference_video')
    }

    # Reset services for new session
    live_feedback_service.reset()
    scoring_service.reset()

    return StartSessionResponse(
        session_id=session_id,
        message="Session started successfully"
    )


@app.post("/api/sessions/end", response_model=SessionFeedbackResponse)
async def end_session():
    """
    End the current session and get comprehensive AI-generated summary.

    SERVER-SIDE EVENT TRIGGER:
    When this endpoint is called, it automatically triggers the internal
    FeedbackGenerationService to analyze all live feedback from the session
    and generate a comprehensive summary. This is the ONLY way the session
    summary LLM is invoked - no separate API call needed.

    SECURITY NOTE: Calls internal LLM service (OpenAI) automatically but
    returns ONLY processed feedback text. No OpenAI metadata is exposed.

    Returns:
        SessionFeedbackResponse: Complete session summary with AI-generated insights
    """
    global current_session

    if not current_session['session_id']:
        raise HTTPException(status_code=400, detail="No active session to end")

    # Calculate basic session metrics
    total_poses = len(current_session['pose_data'])

    if total_poses > 0:
        similarity_scores = [
            data['comparison_result'].get('combined_score', 0.0)
            for data in current_session['pose_data']
            if data['comparison_result']
        ]
        average_similarity = np.mean(similarity_scores) if similarity_scores else 0.0
    else:
        average_similarity = 0.0

    # Get session statistics from scoring service
    session_stats = scoring_service.get_session_statistics()

    # SERVER-SIDE EVENT: Automatically generate comprehensive AI summary
    # This is triggered internally when session ends (not a separate API call)
    # FeedbackGenerationService calls OpenAI internally but returns ONLY processed text
    ai_summary = feedback_generation_service.generate_session_summary(
        live_feedback_history=current_session['feedback_history'],
        session_statistics=session_stats
    )

    # Build comprehensive response with AI insights
    # All AI-generated content (overall_summary, key_insights, etc.) comes from
    # the internal FeedbackGenerationService - NO OpenAI metadata is included
    response = SessionFeedbackResponse(
        session_id=current_session['session_id'],
        total_poses=total_poses,
        average_similarity=float(average_similarity),
        session_summary=ai_summary.get('overall_summary', 'Session completed!'),
        detailed_feedback=current_session['feedback_history'],

        # AI-generated insights (processed text only, no OpenAI metadata)
        key_insights=ai_summary.get('key_insights', []),
        improvement_areas=ai_summary.get('improvement_areas', []),
        strengths=ai_summary.get('strengths', []),
        severity_distribution=ai_summary.get('severity_distribution', {})
    )

    # Keep reference video loaded but reset session
    reference_video = current_session.get('reference_video')
    current_session = {
        'session_id': None,
        'start_time': None,
        'pose_data': [],
        'feedback_history': [],
        'reference_video': reference_video
    }

    return response


@app.get("/api/sessions/status", response_model=SessionStatusResponse)
async def get_session_status():
    """
    Get current session status.

    Returns:
        SessionStatusResponse: Current session information
    """
    return SessionStatusResponse(
        session_id=current_session['session_id'],
        start_time=current_session['start_time'],
        pose_count=len(current_session['pose_data']),
        reference_video=current_session['reference_video'],
        session_duration=time.time() - current_session['start_time'] if current_session['start_time'] else 0
    )


# ============================================================================
# API ENDPOINTS - POSE PROCESSING
# ============================================================================

@app.post("/api/sessions/snapshot", response_model=ProcessSnapshotResponse)
async def process_snapshot(request: ImageSnapshotRequest):
    """
    Process a single image snapshot for pose detection and comparison.
    This endpoint is called every 0.5 seconds by the frontend.

    Args:
        request: ImageSnapshotRequest with base64 encoded image

    Returns:
        ProcessSnapshotResponse: Detected poses, comparison results, and live feedback
    """
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail='No image data provided')

        result = process_image_snapshot(request.image)
        return ProcessSnapshotResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sessions/dual-snapshot", response_model=DualSnapshotResponse)
async def process_dual_snapshot(request: DualSnapshotRequest):
    """
    Process dual snapshots (webcam + reference video frame) for real-time dance feedback.
    This endpoint is called every 0.5 seconds during practice mode.
    
    Similar to the approach in riptide-ai2/split_video.py but for dance pose comparison.

    Args:
        request: DualSnapshotRequest with webcam image, reference video path, and timestamp

    Returns:
        DualSnapshotResponse: Detailed dance feedback comparing user pose to reference
    """
    try:
        if not request.webcam_image:
            raise HTTPException(status_code=400, detail='No webcam image data provided')
        
        if not request.reference_video_path:
            raise HTTPException(status_code=400, detail='No reference video path provided')

        # Process the dual snapshot using the enhanced Tier 2 system
        tier1_result, tier2_result = await dual_snapshot_service.process_dual_snapshot_with_tier2(
            webcam_snapshot=request.webcam_image,
            reference_video_path=request.reference_video_path,
            video_timestamp=request.video_timestamp,
            session_id=request.session_id
        )
        
        # Build response with Tier 2 data if available
        response_data = {
            "timestamp": tier1_result.timestamp,
            "feedback_text": tier1_result.feedback_text,
            "severity": tier1_result.severity,
            "focus_areas": tier1_result.focus_areas,
            "similarity_score": tier1_result.similarity_score,
            "is_positive": tier1_result.is_positive,
            "specific_issues": tier1_result.specific_issues,
            "recommendations": tier1_result.recommendations,
            "success": True
        }
        
        # Add Tier 2 analysis if available
        if tier2_result:
            print(f"[API] 🔍 Tier 2 result details:")
            print(f"  - overall_feedback: {tier2_result.overall_feedback}")
            print(f"  - overall_similarity_score: {tier2_result.overall_similarity_score}")
            print(f"  - trend_analysis: {tier2_result.trend_analysis}")
            print(f"  - encouragement: {tier2_result.encouragement}")
            
            response_data.update({
                "tier2_analysis": {
                    "overall_feedback": tier2_result.overall_feedback,
                    "overall_similarity_score": tier2_result.overall_similarity_score,
                    "trend_analysis": tier2_result.trend_analysis,
                    "key_improvements": tier2_result.key_improvements,
                    "encouragement": tier2_result.encouragement,
                    "is_positive": tier2_result.is_positive
                },
                "overall_feedback": tier2_result.overall_feedback,
                "overall_similarity_score": tier2_result.overall_similarity_score,
                "trend_analysis": tier2_result.trend_analysis,
                "key_improvements": tier2_result.key_improvements,
                "encouragement": tier2_result.encouragement
            })
            print(f"[API] ✅ Returning Tier 2 analysis: {tier2_result.overall_feedback}")
            print(f"[API] 🔍 Final response_data.overall_feedback: {response_data.get('overall_feedback')}")
        else:
            print(f"[API] ⏳ No Tier 2 analysis available, returning Tier 1 only")
        
        return DualSnapshotResponse(**response_data)

    except Exception as e:
        print(f"[API] Error in dual snapshot processing: {e}")
        return DualSnapshotResponse(
            timestamp=request.video_timestamp,
            feedback_text="Keep practicing! Focus on matching the reference pose.",
            severity="medium",
            focus_areas=["general"],
            similarity_score=0.5,
            is_positive=False,
            specific_issues=["Processing error occurred"],
            recommendations=["Continue practicing and focus on the reference"],
            success=False,
            error=str(e)
        )


@app.get("/api/sessions/pose-sequence")
async def get_pose_sequence():
    """
    Get the current pose sequence for analysis.

    Returns:
        dict: Current pose sequence and metadata
    """
    return {
        'sequence': [pose.tolist() for pose in pose_sequence],
        'length': len(pose_sequence),
        'max_length': MAX_SEQUENCE_LENGTH
    }


@app.post("/api/sessions/clear-sequence")
async def clear_sequence():
    """
    Clear the pose sequence buffer.

    Returns:
        dict: Success confirmation
    """
    global pose_sequence
    pose_sequence = []
    return {'success': True, 'message': 'Pose sequence cleared'}


# ============================================================================
# API ENDPOINTS - REFERENCE VIDEO
# ============================================================================

@app.post("/api/reference/load")
async def load_reference(request: LoadReferenceRequest):
    """
    Load a reference video for pose comparison.

    Args:
        request: LoadReferenceRequest with video name

    Returns:
        dict: Success message
    """
    try:
        success = load_reference_video(request.video_name)
        if success:
            return {
                "success": True,
                "message": f"Reference video '{request.video_name}' loaded successfully",
                "video_name": request.video_name
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to load reference video '{request.video_name}'"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reference/current")
async def get_current_reference():
    """
    Get information about the currently loaded reference video.

    Returns:
        dict: Current reference video information
    """
    if comparison_service is None:
        return {
            "loaded": False,
            "video_name": None
        }

    stats = comparison_service.get_statistics()
    return {
        "loaded": True,
        "video_name": current_session.get('reference_video'),
        "reference_frames": stats.get('reference_frames', 0)
    }


# ============================================================================
# API ENDPOINTS - CONFIGURATION
# ============================================================================

@app.post("/api/config/update")
async def update_config(request: UpdateConfigRequest):
    """
    Update pose comparison configuration.

    Args:
        request: UpdateConfigRequest with config parameters

    Returns:
        dict: Updated configuration
    """
    global current_config, comparison_service

    try:
        # Handle preset configurations
        if request.preset:
            if request.preset == "default":
                new_config = DEFAULT_CONFIG
            elif request.preset == "dance":
                new_config = DANCE_CONFIG
            elif request.preset == "position_focused":
                new_config = PoseComparisonConfig(pose_weight=0.9, motion_weight=0.1)
            elif request.preset == "motion_focused":
                new_config = PoseComparisonConfig(pose_weight=0.3, motion_weight=0.7)
            else:
                raise HTTPException(status_code=400, detail=f"Unknown preset: {request.preset}")
        else:
            # Update individual parameters
            new_config = PoseComparisonConfig(
                pose_weight=request.pose_weight or current_config.pose_weight,
                motion_weight=request.motion_weight or current_config.motion_weight,
                dtw_enabled=request.dtw_enabled if request.dtw_enabled is not None else current_config.dtw_enabled,
                smoothing_window=current_config.smoothing_window,
                dtw_window=current_config.dtw_window,
                dtw_interval=current_config.dtw_interval
            )

        # Validate weights sum to 1.0
        if abs(new_config.pose_weight + new_config.motion_weight - 1.0) > 0.001:
            raise HTTPException(status_code=400, detail="Pose and motion weights must sum to 1.0")

        # Update global config
        current_config = new_config

        # Update comparison service if it exists
        if comparison_service:
            comparison_service.update_config(current_config)

        return {
            "success": True,
            "message": "Configuration updated successfully",
            "config": current_config.to_dict()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config")
async def get_config():
    """
    Get current pose comparison configuration.

    Returns:
        dict: Current configuration settings
    """
    return {
        "config": current_config.to_dict()
    }


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
