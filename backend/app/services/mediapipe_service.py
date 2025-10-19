"""
MediaPipe Service for Real-time Pose Detection and Analysis
Handles pose detection on both user webcam and reference video frames.
"""
import cv2
import mediapipe as mp
import numpy as np
import base64
import json
import time
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from io import BytesIO
from PIL import Image


@dataclass
class PoseLandmarks:
    """Data class for pose landmarks."""
    landmarks: List[List[float]]  # 33 landmarks with [x, y, z, visibility]
    confidence: float
    timestamp: float
    has_pose: bool


@dataclass
class MediaPipeResult:
    """Data class for MediaPipe processing results."""
    user_pose: Optional[PoseLandmarks]
    reference_pose: Optional[PoseLandmarks]
    similarity_score: float
    processing_time: float
    success: bool
    error: Optional[str] = None


class MediaPipeService:
    """
    Service for real-time pose detection using MediaPipe.
    Processes both user webcam frames and reference video frames.
    """
    
    def __init__(self):
        """Initialize MediaPipe components."""
        # Initialize MediaPipe solutions
        self.mp_pose = mp.solutions.pose
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Initialize pose detection
        self.pose_detector = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # Initialize drawing utilities
        self.drawing_utils = mp.solutions.drawing_utils
        self.drawing_styles = mp.solutions.drawing_styles
        
        print("[MediaPipe] Service initialized successfully")
    
    def process_dual_frames(
        self, 
        user_image_b64: str, 
        reference_image_b64: str,
        timestamp: float = None
    ) -> MediaPipeResult:
        """
        Process both user and reference images for pose detection and comparison.
        
        Args:
            user_image_b64: Base64 encoded user webcam image
            reference_image_b64: Base64 encoded reference video frame
            timestamp: Optional timestamp for the analysis
            
        Returns:
            MediaPipeResult: Complete analysis results
        """
        start_time = time.time()
        
        try:
            if timestamp is None:
                timestamp = time.time()
            
            # Process user image
            user_pose = self._process_single_image(user_image_b64, timestamp, "user")
            
            # Process reference image
            reference_pose = self._process_single_image(reference_image_b64, timestamp, "reference")
            
            # Calculate similarity if both poses are detected
            similarity_score = 0.0
            if user_pose and user_pose.has_pose and reference_pose and reference_pose.has_pose:
                similarity_score = self._calculate_pose_similarity(
                    user_pose.landmarks, 
                    reference_pose.landmarks
                )
            
            processing_time = time.time() - start_time
            
            return MediaPipeResult(
                user_pose=user_pose,
                reference_pose=reference_pose,
                similarity_score=similarity_score,
                processing_time=processing_time,
                success=True
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"[MediaPipe] Error processing dual frames: {e}")
            
            return MediaPipeResult(
                user_pose=None,
                reference_pose=None,
                similarity_score=0.0,
                processing_time=processing_time,
                success=False,
                error=str(e)
            )
    
    def _process_single_image(self, image_b64: str, timestamp: float, source: str) -> Optional[PoseLandmarks]:
        """
        Process a single image for pose detection.
        
        Args:
            image_b64: Base64 encoded image
            timestamp: Timestamp for the analysis
            source: Source identifier ("user" or "reference")
            
        Returns:
            Optional[PoseLandmarks]: Detected pose landmarks or None
        """
        try:
            # Decode base64 image
            image_bytes = base64.b64decode(image_b64)
            image = Image.open(BytesIO(image_bytes))
            
            # Convert PIL to OpenCV format
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process with MediaPipe
            results = self.pose_detector.process(rgb_frame)
            
            if results.pose_landmarks:
                # Extract landmarks
                landmarks = []
                for landmark in results.pose_landmarks.landmark:
                    landmarks.append([
                        landmark.x,
                        landmark.y, 
                        landmark.z,
                        landmark.visibility
                    ])
                
                # Calculate average confidence
                confidence = np.mean([lm[3] for lm in landmarks])
                
                print(f"[MediaPipe] {source.capitalize()} pose detected: {len(landmarks)} landmarks, confidence: {confidence:.3f}")
                
                return PoseLandmarks(
                    landmarks=landmarks,
                    confidence=confidence,
                    timestamp=timestamp,
                    has_pose=True
                )
            else:
                print(f"[MediaPipe] No {source} pose detected")
                return PoseLandmarks(
                    landmarks=[],
                    confidence=0.0,
                    timestamp=timestamp,
                    has_pose=False
                )
                
        except Exception as e:
            print(f"[MediaPipe] Error processing {source} image: {e}")
            return None
    
    def _calculate_pose_similarity(self, user_landmarks: List[List[float]], reference_landmarks: List[List[float]]) -> float:
        """
        Calculate similarity between user and reference pose landmarks.
        
        Args:
            user_landmarks: User pose landmarks
            reference_landmarks: Reference pose landmarks
            
        Returns:
            float: Similarity score between 0.0 and 1.0
        """
        try:
            if len(user_landmarks) != len(reference_landmarks):
                return 0.0
            
            # Convert to numpy arrays for easier calculation
            user_array = np.array(user_landmarks)
            reference_array = np.array(reference_landmarks)
            
            # Extract x, y coordinates (ignore z and visibility for 2D comparison)
            user_2d = user_array[:, :2]
            reference_2d = reference_array[:, :2]
            
            # Calculate normalized distances for each landmark
            distances = []
            for i in range(len(user_2d)):
                # Skip landmarks with low visibility
                if user_array[i][3] < 0.5 or reference_array[i][3] < 0.5:
                    continue
                
                # Calculate Euclidean distance
                dist = np.linalg.norm(user_2d[i] - reference_2d[i])
                distances.append(dist)
            
            if not distances:
                return 0.0
            
            # Convert distances to similarity score (0-1)
            # Average distance of 0.1 = 90% similarity, 0.2 = 80%, etc.
            avg_distance = np.mean(distances)
            similarity = max(0.0, 1.0 - (avg_distance * 5))  # Scale factor of 5
            
            print(f"[MediaPipe] Pose similarity: {similarity:.3f} (avg distance: {avg_distance:.3f})")
            return similarity
            
        except Exception as e:
            print(f"[MediaPipe] Error calculating pose similarity: {e}")
            return 0.0
    
    def draw_pose_landmarks(self, image_b64: str, landmarks: List[List[float]]) -> str:
        """
        Draw pose landmarks on an image and return as base64.
        
        Args:
            image_b64: Base64 encoded input image
            landmarks: Pose landmarks to draw
            
        Returns:
            str: Base64 encoded image with drawn landmarks
        """
        try:
            # Decode base64 image
            image_bytes = base64.b64decode(image_b64)
            image = Image.open(BytesIO(image_bytes))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            # Create MediaPipe landmarks object
            if landmarks:
                # Convert landmarks to MediaPipe format
                mp_landmarks = self.mp_pose.PoseLandmark
                
                # Create a simple drawing on the frame
                for i, landmark in enumerate(landmarks):
                    if landmark[3] > 0.5:  # Only draw visible landmarks
                        x = int(landmark[0] * frame.shape[1])
                        y = int(landmark[1] * frame.shape[0])
                        cv2.circle(frame, (x, y), 3, (0, 255, 0), -1)
            
            # Convert back to base64
            _, buffer = cv2.imencode('.jpg', frame)
            result_b64 = base64.b64encode(buffer).decode('utf-8')
            
            return result_b64
            
        except Exception as e:
            print(f"[MediaPipe] Error drawing landmarks: {e}")
            return image_b64  # Return original image if drawing fails
    
    def get_pose_analysis(self, landmarks: List[List[float]]) -> Dict[str, Any]:
        """
        Analyze pose landmarks and return detailed information.
        
        Args:
            landmarks: Pose landmarks
            
        Returns:
            Dict[str, Any]: Analysis results
        """
        try:
            if not landmarks:
                return {"error": "No landmarks provided"}
            
            # Convert to numpy array
            landmarks_array = np.array(landmarks)
            
            # Calculate basic pose metrics
            analysis = {
                "total_landmarks": len(landmarks),
                "visible_landmarks": sum(1 for lm in landmarks if lm[3] > 0.5),
                "average_confidence": np.mean([lm[3] for lm in landmarks]),
                "pose_center": {
                    "x": float(np.mean(landmarks_array[:, 0])),
                    "y": float(np.mean(landmarks_array[:, 1]))
                },
                "pose_bounds": {
                    "min_x": float(np.min(landmarks_array[:, 0])),
                    "max_x": float(np.max(landmarks_array[:, 0])),
                    "min_y": float(np.min(landmarks_array[:, 1])),
                    "max_y": float(np.max(landmarks_array[:, 1]))
                }
            }
            
            # Calculate key body part positions
            if len(landmarks) >= 33:  # Full pose has 33 landmarks
                analysis["key_points"] = {
                    "nose": landmarks[0][:2],
                    "left_shoulder": landmarks[11][:2],
                    "right_shoulder": landmarks[12][:2],
                    "left_hip": landmarks[23][:2],
                    "right_hip": landmarks[24][:2],
                    "left_wrist": landmarks[15][:2],
                    "right_wrist": landmarks[16][:2],
                    "left_ankle": landmarks[27][:2],
                    "right_ankle": landmarks[28][:2]
                }
            
            return analysis
            
        except Exception as e:
            print(f"[MediaPipe] Error analyzing pose: {e}")
            return {"error": str(e)}
    
    def cleanup(self):
        """Clean up MediaPipe resources."""
        if hasattr(self, 'pose_detector'):
            self.pose_detector.close()
        print("[MediaPipe] Service cleaned up")


# Global MediaPipe service instance
mediapipe_service = MediaPipeService()
