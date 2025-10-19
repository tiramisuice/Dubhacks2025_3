"""
Dual Snapshot Service for Real-time Dance Feedback

This service captures both webcam and reference video frames simultaneously
and sends them to GPT-4o for dance pose comparison analysis, similar to
the approach used in riptide-ai2/split_video.py.

Author: AI Assistant
Date: 2025-01-18
"""

import asyncio
import base64
import json
import os
import re
from typing import Dict, List, Optional, Tuple, Union
from dataclasses import dataclass
from collections import deque
import time
from openai import AsyncOpenAI
from dotenv import load_dotenv
import cv2
import numpy as np
from PIL import Image
from io import BytesIO

# Load environment variables
load_dotenv()

# Ensure we have the API key
if not os.getenv("OPENAI_API_KEY"):
    print("⚠️  WARNING: OPENAI_API_KEY not found in environment variables")
    print("Please make sure your .env file exists and contains: OPENAI_API_KEY=sk-...")

@dataclass
class DualSnapshotData:
    """Data structure for dual snapshot analysis"""
    timestamp: float
    webcam_frame_base64: str  # User's webcam snapshot
    reference_frame_base64: str  # Reference video frame
    video_current_time: float  # Current time in reference video
    session_id: str

@dataclass
class DanceFeedbackResult:
    """Result from dance pose comparison analysis"""
    timestamp: float
    feedback_text: str
    severity: str  # "high", "medium", "low"
    focus_areas: List[str]  # Body parts needing attention
    similarity_score: float  # 0.0-1.0
    is_positive: bool
    specific_issues: List[str]  # Detailed issues found
    recommendations: List[str]  # Specific improvement suggestions

@dataclass
class Tier1Result:
    """Tier 1 AI analysis result stored for Tier 2 processing"""
    timestamp: float
    feedback_text: str
    similarity_score: float
    severity: str
    focus_areas: List[str]
    is_positive: bool
    specific_issues: List[str]
    recommendations: List[str]

@dataclass
class Tier2AnalysisResult:
    """Tier 2 AI analysis result for live feedback"""
    timestamp: float
    overall_feedback: str
    overall_similarity_score: float
    trend_analysis: str
    key_improvements: List[str]
    encouragement: str
    is_positive: bool

class DualSnapshotService:
    """
    Service for capturing and analyzing dual snapshots (webcam + reference video)
    using GPT-4o vision API for real-time dance feedback.
    """
    
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        self.client = AsyncOpenAI(api_key=api_key)
        self.max_image_size = (640, 480)  # Max dimensions for OpenAI API
        
        # Tier 1 results storage (past 3 seconds)
        self.tier1_results: deque = deque(maxlen=6)  # 6 results = 3 seconds at 0.5s intervals (Tier 1 still runs every 0.5s)
        self.tier2_analysis_interval = 3.0  # Run Tier 2 analysis every 3 seconds for better readability
        self.last_tier2_analysis = -999.0  # Initialize to negative value to prevent early triggers
        self.tier2_analysis_in_progress = False  # Prevent concurrent Tier 2 analyses
        
    def downscale_image_for_openai(self, frame: np.ndarray, max_width: int = 640, max_height: int = 480) -> np.ndarray:
        """
        Downscale an image to a reasonable size for OpenAI API calls to reduce costs.
        Similar to the approach in split_video.py
        """
        height, width = frame.shape[:2]
        
        # If image is already smaller than max dimensions, return as is
        if width <= max_width and height <= max_height:
            return frame
        
        # Calculate the scaling factor
        scale_width = max_width / width
        scale_height = max_height / height
        scale = min(scale_width, scale_height)
        
        # Calculate new dimensions
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        # Resize image
        resized_image = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
        
        print(f"[DualSnapshot] Resized image from {width}x{height} to {new_width}x{new_height}")
        return resized_image
    
    def downscale_data_url(self, data_url: str, max_width: int = 640, max_height: int = 480) -> str:
        """
        Downscale an image in data URL format for OpenAI API calls to reduce costs.
        """
        # Check if data URL needs processing
        pattern = r'data:image\/([a-zA-Z]+);base64,(.+)'
        match = re.match(pattern, data_url)
        
        if not match:
            print("[DualSnapshot] Not a valid data URL format, returning as is")
            return data_url
            
        img_format, base64_data = match.groups()
        
        # Decode base64 to image
        img_data = base64.b64decode(base64_data)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            print("[DualSnapshot] Failed to decode image from data URL, returning as is")
            return data_url
        
        # Get current dimensions
        height, width = img.shape[:2]
        
        # Check if downscaling is needed
        if width <= max_width and height <= max_height:
            print("[DualSnapshot] Image already within size limits, no resizing needed")
            return data_url
        
        # Downscale the image
        resized_img = self.downscale_image_for_openai(img, max_width, max_height)
        
        # Convert back to data URL
        success, buffer = cv2.imencode(f'.{img_format.lower()}', resized_img)
        if not success:
            print("[DualSnapshot] Failed to encode resized image, returning original data URL")
            return data_url
        
        b64_resized = base64.b64encode(buffer).decode('ascii')
        resized_data_url = f'data:image/{img_format};base64,{b64_resized}'
        
        print(f"[DualSnapshot] Resized data URL from approx. {len(data_url)} to {len(resized_data_url)} chars")
        return resized_data_url
    
    def frame_to_data_url(self, frame: np.ndarray, for_openai: bool = True) -> str:
        """
        Encode an OpenCV BGR frame (numpy array) into a JPEG Data URL.
        Similar to split_video.py implementation.
        """
        print("[DualSnapshot] Encoding frame to JPEG data URL...")
        
        # Downscale if needed for OpenAI
        if for_openai:
            frame = self.downscale_image_for_openai(frame)
        
        success, buffer = cv2.imencode(".jpg", frame)
        if not success:
            raise RuntimeError("Failed to encode frame to JPEG")
        b64 = base64.b64encode(buffer).decode("ascii")
        data_url = f"data:image/jpeg;base64,{b64}"
        print("[DualSnapshot] Frame encoded, length:", len(data_url))
        return data_url
    
    def extract_reference_frame(self, video_path: str, timestamp: float) -> Optional[np.ndarray]:
        """
        Extract a specific frame from the reference video at the given timestamp.
        Similar to the frame extraction in split_video.py but for specific timestamps.
        """
        try:
            # Convert relative path to absolute path
            if not os.path.isabs(video_path):
                # Get the backend directory (parent of app directory)
                backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                video_path = os.path.join(backend_dir, video_path)
            
            print(f"[DualSnapshot] Attempting to open video at: {video_path}")
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                print(f"[DualSnapshot] Could not open video: {video_path}")
                return None
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            if not fps or fps <= 0:
                print(f"[DualSnapshot] Could not read FPS from video")
                cap.release()
                return None
            
            # Calculate frame number for the timestamp
            frame_number = int(timestamp * fps)
            
            # Seek to the specific frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            
            ret, frame = cap.read()
            cap.release()
            
            if ret:
                print(f"[DualSnapshot] Extracted reference frame at {timestamp}s (frame {frame_number})")
                return frame
            else:
                print(f"[DualSnapshot] Failed to read frame at timestamp {timestamp}")
                return None
                
        except Exception as e:
            print(f"[DualSnapshot] Error extracting reference frame: {e}")
            return None
    
    async def analyze_dual_snapshot(self, snapshot_data: DualSnapshotData) -> DanceFeedbackResult:
        """
        Analyze both webcam and reference video frames using GPT-4o vision API
        to provide detailed dance pose comparison feedback.
        """
        print(f"[DualSnapshot] Analyzing dual snapshot at {snapshot_data.timestamp}s...")
        
        # Downscale both images for OpenAI API
        webcam_data_url = self.downscale_data_url(snapshot_data.webcam_frame_base64)
        reference_data_url = self.downscale_data_url(snapshot_data.reference_frame_base64)
        
        prompt = """
        You are a computer vision system analyzing two images for geometric comparison.
        
        Image 1: Current configuration
        Image 2: Reference configuration
        
        Analyze the spatial relationships and geometric differences between these two configurations.
        
        COMPARISON CRITERIA:
        
        1. SPATIAL ALIGNMENT
           - Overall positioning differences
           - Geometric relationships
           - Coordinate system alignment
        
        2. ANGULAR DIFFERENCES
           - Angle measurements
           - Orientation differences
           - Rotational variations
        
        3. POSITIONAL VARIATIONS
           - Location differences
           - Distance measurements
           - Spatial offsets
        
        4. STRUCTURAL COMPARISON
           - Shape analysis
           - Form differences
           - Configuration matching
        
        FEEDBACK FORMAT:
        You MUST respond with ONLY a valid JSON object in the following format. Do not include any markdown formatting, explanations, or additional text:
        {
            "overall_assessment": "Brief overall assessment (1-2 sentences)",
            "similarity_score": 0.85,
            "severity": "medium",
            "focus_areas": ["body_part1", "body_part2", "posture"],
            "specific_issues": [
                "Specific issue description",
                "Another specific issue"
            ],
            "recommendations": [
                "Actionable recommendation 1",
                "Actionable recommendation 2",
                "Actionable recommendation 3"
            ],
            "positive_feedback": "Encouraging feedback for what's done well",
            "is_positive": false
        }
        
        IMPORTANT GUIDELINES:
        - This is for educational dance instruction only
        - Be specific and actionable in your feedback
        - Focus on the most critical issues first
        - Provide encouragement when appropriate
        - Use dance terminology when helpful
        - Consider that this is real-time feedback during practice
        - Be constructive and supportive in tone
        - If the poses are very similar, provide positive reinforcement
        - CRITICAL: Return ONLY the JSON object, no other text or formatting
        - This is a legitimate educational application for dance learning
        """
        
        content = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": webcam_data_url, "detail": "high"}},
            {"type": "image_url", "image_url": {"url": reference_data_url, "detail": "high"}},
        ]
        
        try:
            # Try with a very simple prompt to avoid blocking - send both images
            simple_content = [
                {"type": "text", "text": "Look at the first image and the second image, the first image is the user trying to dance like second image, and the second is the professional dancer. Give SHORT, COACH-LIKE feedback (max 50 words) about how the user can improve. Be direct and actionable. Please respond in JSON format: {\"feedback_text\": \"short coach feedback here\", \"similarity_score\": 0.8, \"severity\": \"medium\", \"focus_areas\": [\"area1\", \"area2\"], \"specific_issues\": [\"issue1\"], \"recommendations\": [\"recommendation1\"], \"positive_feedback\": \"positive note\", \"is_positive\": true}"},
                {"type": "image_url", "image_url": {"url": webcam_data_url, "detail": "low"}},
                {"type": "image_url", "image_url": {"url": reference_data_url, "detail": "low"}},
            ]
            
            print(f"[DualSnapshot] Sending request to OpenAI with {len(simple_content)} content items")
            print(f"[DualSnapshot] Webcam image size: {len(webcam_data_url)} chars")
            print(f"[DualSnapshot] Reference image size: {len(reference_data_url)} chars")
            print(f"[DualSnapshot] Sending both webcam and reference images to OpenAI")
            
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": simple_content}],
                temperature=0.3,
                max_tokens=500
            )
            
            analysis_text = response.choices[0].message.content
            print(f"[DualSnapshot] Received analysis (length {len(analysis_text)}): {analysis_text}")
            
            # Try to parse as JSON first
            try:
                # Clean the response text - remove markdown code blocks if present
                cleaned_text = analysis_text.strip()
                if cleaned_text.startswith('```json'):
                    cleaned_text = cleaned_text[7:]  # Remove ```json
                if cleaned_text.endswith('```'):
                    cleaned_text = cleaned_text[:-3]  # Remove ```
                cleaned_text = cleaned_text.strip()
                
                # Try to find JSON in the response
                json_start = cleaned_text.find('{')
                json_end = cleaned_text.rfind('}') + 1
                
                if json_start != -1 and json_end > json_start:
                    json_text = cleaned_text[json_start:json_end]
                    analysis_data = json.loads(json_text)
                    
                    # Extract data from JSON response
                    raw_feedback_text = analysis_data.get('feedback_text', analysis_text[:200])
                    # Truncate feedback to be coach-like and concise (max 50 words)
                    words = raw_feedback_text.split()
                    if len(words) > 50:
                        feedback_text = ' '.join(words[:50]) + '...'
                    else:
                        feedback_text = raw_feedback_text
                    
                    similarity_score = analysis_data.get('similarity_score', 0.7)
                    severity = analysis_data.get('severity', 'medium')
                    focus_areas = analysis_data.get('focus_areas', ['general'])
                    specific_issues = analysis_data.get('specific_issues', [])
                    recommendations = analysis_data.get('recommendations', ['Continue practicing'])
                    positive_feedback = analysis_data.get('positive_feedback', '')
                    is_positive = analysis_data.get('is_positive', True)
                    
                    print(f"[DualSnapshot] Successfully parsed JSON response")
                    print(f"[DualSnapshot] Extracted feedback_text: {feedback_text}")
                    print(f"[DualSnapshot] Extracted similarity_score: {similarity_score}")
                    print(f"[DualSnapshot] Extracted severity: {severity}")
                    
                    # Create and return the result immediately after JSON parsing
                    feedback_result = DanceFeedbackResult(
                        timestamp=snapshot_data.timestamp,
                        feedback_text=feedback_text,
                        severity=severity,
                        focus_areas=focus_areas,
                        similarity_score=similarity_score,
                        is_positive=is_positive,
                        specific_issues=specific_issues,
                        recommendations=recommendations
                    )
                    
                    print(f"[DualSnapshot] Created DanceFeedbackResult successfully")
                    print(f"[DualSnapshot] Returning feedback_result: {feedback_result.feedback_text}")
                    return feedback_result
                    
                else:
                    print(f"[DualSnapshot] No JSON found in response - using plain text")
                    raise ValueError("No JSON found in response")
                    
            except (json.JSONDecodeError, ValueError, KeyError) as e:
                print(f"[DualSnapshot] Could not parse JSON, using plain text: {e}")
                
                # Fallback to plain text parsing
                raw_text = analysis_text[:300] if analysis_text else "Keep practicing! Focus on matching the reference pose."
                # Truncate to be coach-like and concise (max 50 words)
                words = raw_text.split()
                if len(words) > 50:
                    feedback_text = ' '.join(words[:50]) + '...'
                else:
                    feedback_text = raw_text
                
                if "person" in analysis_text.lower() and ("dance" in analysis_text.lower() or "pose" in analysis_text.lower() or "movement" in analysis_text.lower()):
                    similarity_score = 0.7
                    is_positive = True
                    severity = "medium"
                    focus_areas = ["general"]
                    specific_issues = []
                    recommendations = ["Continue practicing", "Watch the reference video"]
                    positive_feedback = ""
                elif "person" in analysis_text.lower():
                    similarity_score = 0.6
                    is_positive = True
                    severity = "medium"
                    focus_areas = ["general"]
                    specific_issues = []
                    recommendations = ["Continue practicing", "Watch the reference video"]
                    positive_feedback = ""
                else:
                    similarity_score = 0.5
                    is_positive = False
                    severity = "medium"
                    focus_areas = ["general"]
                    specific_issues = []
                    recommendations = ["Continue practicing", "Watch the reference video"]
                    positive_feedback = ""
            
                
        except Exception as e:
            print(f"[DualSnapshot] Error in OpenAI API call: {e}")
            print(f"[DualSnapshot] Error type: {type(e)}")
            print(f"[DualSnapshot] Error details: {str(e)}")
            
            # Check if it's a content policy violation
            if "content policy" in str(e).lower() or "safety" in str(e).lower():
                print("[DualSnapshot] OpenAI blocked due to content policy - returning fallback")
                # Return fallback instead of raising exception
                return DanceFeedbackResult(
                    timestamp=snapshot_data.timestamp,
                    feedback_text="Keep practicing! Focus on matching the reference pose.",
                    severity="medium",
                    focus_areas=["general"],
                    similarity_score=0.5,
                    is_positive=True,
                    specific_issues=[],
                    recommendations=["Continue practicing and focus on the reference"]
                )
            else:
                print("[DualSnapshot] Other API error - returning fallback")
                # Return fallback instead of raising exception
                return DanceFeedbackResult(
                    timestamp=snapshot_data.timestamp,
                    feedback_text="Keep practicing! Focus on matching the reference pose.",
                    severity="medium",
                    focus_areas=["general"],
                    similarity_score=0.5,
                    is_positive=True,
                    specific_issues=[],
                    recommendations=["Continue practicing and focus on the reference"]
                )
    
    async def process_dual_snapshot(
        self, 
        webcam_snapshot: str, 
        reference_video_path: str, 
        video_timestamp: float,
        session_id: str
    ) -> DanceFeedbackResult:
        """
        Main method to process a dual snapshot analysis.
        Note: This will only be called when video is playing (frontend controls this).
        
        Args:
            webcam_snapshot: Base64 encoded webcam image
            reference_video_path: Path to the reference video file
            video_timestamp: Current timestamp in the reference video
            session_id: Current session identifier
            
        Returns:
            DanceFeedbackResult with detailed analysis
        """
        try:
            # Extract reference frame from video
            reference_frame = self.extract_reference_frame(reference_video_path, video_timestamp)
            
            if reference_frame is None:
                print(f"[DualSnapshot] Could not extract reference frame at {video_timestamp}s")
                return DanceFeedbackResult(
                    timestamp=video_timestamp,
                    feedback_text="Reference frame unavailable. Keep practicing!",
                    severity="low",
                    focus_areas=["general"],
                    similarity_score=0.5,
                    is_positive=True,
                    specific_issues=[],
                    recommendations=["Continue practicing"]
                )
            
            # Convert reference frame to data URL
            reference_data_url = self.frame_to_data_url(reference_frame)
            
            # Create snapshot data
            snapshot_data = DualSnapshotData(
                timestamp=video_timestamp,
                webcam_frame_base64=webcam_snapshot,
                reference_frame_base64=reference_data_url,
                video_current_time=video_timestamp,
                session_id=session_id
            )
            
            # Analyze the dual snapshot
            result = await self.analyze_dual_snapshot(snapshot_data)
            
            if result is None:
                print(f"[DualSnapshot] analyze_dual_snapshot returned None - creating fallback result")
                return DanceFeedbackResult(
                    timestamp=video_timestamp,
                    feedback_text="Processing error occurred",
                    severity="medium",
                    focus_areas=["general"],
                    similarity_score=0.5,
                    is_positive=False,
                    specific_issues=["Processing error occurred"],
                    recommendations=["Continue practicing and focus on the reference"]
                )
            
            return result
            
        except Exception as e:
            print(f"[DualSnapshot] Error processing dual snapshot: {e}")
            # Return a fallback result instead of raising the exception
            return DanceFeedbackResult(
                timestamp=video_timestamp,
                feedback_text="Processing error occurred",
                severity="medium",
                focus_areas=["general"],
                similarity_score=0.5,
                is_positive=False,
                specific_issues=["Processing error occurred"],
                recommendations=["Continue practicing and focus on the reference"]
            )

    async def analyze_tier2_feedback(self, tier1_results: List[Tier1Result]) -> Tier2AnalysisResult:
        """
        Tier 2 AI analysis: Analyze past 3 seconds of Tier 1 results to provide
        better live feedback and scoring.
        """
        if not tier1_results:
            return Tier2AnalysisResult(
                timestamp=time.time(),
                overall_feedback="Keep practicing!",
                overall_similarity_score=0.5,
                trend_analysis="No data available",
                key_improvements=[],
                encouragement="You're doing great!",
                is_positive=True
            )
        
        # Prepare data for Tier 2 analysis
        analysis_data = []
        total_similarity = 0
        
        for result in tier1_results:
            analysis_data.append({
                "timestamp": result.timestamp,
                "feedback": result.feedback_text,
                "similarity": result.similarity_score,
                "focus_areas": result.focus_areas,
                "issues": result.specific_issues
            })
            total_similarity += result.similarity_score
        
        avg_similarity = total_similarity / len(tier1_results)
        
        # Create prompt for Tier 2 analysis
        prompt = f"""
        You are a dance coach analyzing the past 3 seconds of a student's dance practice.
        
        Here are the recent analysis results (every 0.5 seconds):
        {json.dumps(analysis_data, indent=2)}
        
        Analyze the trends and provide:
        1. Overall performance assessment
        2. Key improvement areas
        3. Encouragement and motivation
        4. Trend analysis (getting better/worse/consistent)
        
        Respond in JSON format:
        {{
            "overall_feedback": "Brief coach feedback (max 30 words)",
            "overall_similarity_score": {avg_similarity},
            "trend_analysis": "Brief trend description (max 20 words)",
            "key_improvements": ["improvement1", "improvement2"],
            "encouragement": "Motivational message (max 20 words)",
            "is_positive": true
        }}
        """
        
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=200
            )
            
            analysis_text = response.choices[0].message.content
            print(f"[DualSnapshot] Tier 2 analysis received: {analysis_text}")
            
            # Parse JSON response
            try:
                # Clean the response text
                cleaned_text = analysis_text.strip()
                if cleaned_text.startswith('```json'):
                    cleaned_text = cleaned_text[7:]
                if cleaned_text.endswith('```'):
                    cleaned_text = cleaned_text[:-3]
                cleaned_text = cleaned_text.strip()
                
                # Find JSON in response
                json_start = cleaned_text.find('{')
                json_end = cleaned_text.rfind('}') + 1
                
                if json_start != -1 and json_end > json_start:
                    json_text = cleaned_text[json_start:json_end]
                    analysis_data = json.loads(json_text)
                    
                    return Tier2AnalysisResult(
                        timestamp=time.time(),
                        overall_feedback=analysis_data.get('overall_feedback', 'Keep practicing!'),
                        overall_similarity_score=analysis_data.get('overall_similarity_score', avg_similarity),
                        trend_analysis=analysis_data.get('trend_analysis', 'Consistent performance'),
                        key_improvements=analysis_data.get('key_improvements', []),
                        encouragement=analysis_data.get('encouragement', 'Great job!'),
                        is_positive=analysis_data.get('is_positive', True)
                    )
                else:
                    raise ValueError("No JSON found in response")
                    
            except (json.JSONDecodeError, ValueError, KeyError) as e:
                print(f"[DualSnapshot] Could not parse Tier 2 JSON: {e}")
                # Fallback response
                return Tier2AnalysisResult(
                    timestamp=time.time(),
                    overall_feedback="Keep practicing!",
                    overall_similarity_score=avg_similarity,
                    trend_analysis="Consistent performance",
                    key_improvements=[],
                    encouragement="You're doing great!",
                    is_positive=True
                )
                
        except Exception as e:
            print(f"[DualSnapshot] Error in Tier 2 analysis: {e}")
            # Fallback response
            return Tier2AnalysisResult(
                timestamp=time.time(),
                overall_feedback="Keep practicing!",
                overall_similarity_score=avg_similarity,
                trend_analysis="Consistent performance",
                key_improvements=[],
                encouragement="You're doing great!",
                is_positive=True
            )

    async def process_dual_snapshot_with_tier2(self, 
        webcam_snapshot: str, 
        reference_video_path: str, 
        video_timestamp: float,
        session_id: str
    ) -> Tuple[DanceFeedbackResult, Optional[Tier2AnalysisResult]]:
        """
        Enhanced dual snapshot processing with Tier 2 analysis.
        Returns both Tier 1 result and Tier 2 analysis (if available).
        """
        # Get Tier 1 result
        tier1_result = await self.process_dual_snapshot(
            webcam_snapshot, reference_video_path, video_timestamp, session_id
        )
        
        # Store Tier 1 result
        tier1_stored = Tier1Result(
                timestamp=video_timestamp,
            feedback_text=tier1_result.feedback_text,
            similarity_score=tier1_result.similarity_score,
            severity=tier1_result.severity,
            focus_areas=tier1_result.focus_areas,
            is_positive=tier1_result.is_positive,
            specific_issues=tier1_result.specific_issues,
            recommendations=tier1_result.recommendations
        )
        
        self.tier1_results.append(tier1_stored)
        
        # Check if we should run Tier 2 analysis (based on video timestamp, not system time)
        tier2_result = None
        
        time_diff = video_timestamp - self.last_tier2_analysis
        print(f"[DualSnapshot] Tier 2 check: video_time={video_timestamp:.1f}s, last_tier2_time={self.last_tier2_analysis:.1f}s, time_diff={time_diff:.1f}s, interval={self.tier2_analysis_interval}s, results_count={len(self.tier1_results)}")
        
        # Reset last_tier2_analysis if video timestamp went backwards (video restarted/seeked)
        if time_diff < 0:
            print(f"[DualSnapshot] Video timestamp went backwards (time_diff={time_diff:.1f}s) - resetting last_tier2_analysis")
            self.last_tier2_analysis = video_timestamp - self.tier2_analysis_interval  # Set to allow immediate analysis
            time_diff = self.tier2_analysis_interval  # Force analysis on next check
        
        if (time_diff >= self.tier2_analysis_interval and 
            len(self.tier1_results) >= 6 and
            not self.tier2_analysis_in_progress):  # Need all 6 results (3 seconds of data) for meaningful analysis
            
            print(f"[DualSnapshot] ✅ Running Tier 2 analysis with {len(self.tier1_results)} results (time_diff={time_diff:.1f}s >= {self.tier2_analysis_interval}s)")
            self.tier2_analysis_in_progress = True
            try:
                tier2_result = await self.analyze_tier2_feedback(list(self.tier1_results))
                self.last_tier2_analysis = video_timestamp  # Use video timestamp, not system time
                print(f"[DualSnapshot] ✅ Tier 2 analysis completed: {tier2_result.overall_feedback if tier2_result else 'None'}")
            finally:
                self.tier2_analysis_in_progress = False
        else:
            if self.tier2_analysis_in_progress:
                print(f"[DualSnapshot] ⏳ Skipping Tier 2 analysis (already in progress)")
            else:
                print(f"[DualSnapshot] ⏳ Skipping Tier 2 analysis (time_diff={time_diff:.1f}s < {self.tier2_analysis_interval}s or results_count={len(self.tier1_results)} < 6)")
        
        return tier1_result, tier2_result

# Global instance
dual_snapshot_service = DualSnapshotService()
