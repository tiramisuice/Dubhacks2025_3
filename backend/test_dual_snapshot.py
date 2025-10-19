#!/usr/bin/env python3
"""
Test script for the dual snapshot service

This script tests the dual snapshot functionality similar to split_video.py
but for dance pose comparison.

Author: AI Assistant
Date: 2025-01-18
"""

import asyncio
import base64
import os
import sys
from pathlib import Path

# Add the app directory to the Python path
sys.path.append(str(Path(__file__).parent / "app"))

from services.dual_snapshot_service import dual_snapshot_service, DualSnapshotData

async def test_dual_snapshot():
    """Test the dual snapshot service with sample data"""
    
    print("🧪 Testing Dual Snapshot Service...")
    
    # Create a simple test image (1x1 pixel red image)
    test_image_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    test_image_base64 = f"data:image/png;base64,{test_image_data}"
    
    # Test video path (you'll need to provide a real video file)
    test_video_path = "test_video.mp4"  # Replace with actual video path
    
    if not os.path.exists(test_video_path):
        print(f"❌ Test video not found: {test_video_path}")
        print("Please provide a test video file or update the path in this script")
        return False
    
    try:
        # Test the dual snapshot processing
        result = await dual_snapshot_service.process_dual_snapshot(
            webcam_snapshot=test_image_base64,
            reference_video_path=test_video_path,
            video_timestamp=5.0,  # 5 seconds into the video
            session_id="test_session_123"
        )
        
        print("✅ Dual snapshot processing completed!")
        print(f"📊 Results:")
        print(f"   - Timestamp: {result.timestamp}")
        print(f"   - Feedback: {result.feedback_text}")
        print(f"   - Severity: {result.severity}")
        print(f"   - Similarity Score: {result.similarity_score}")
        print(f"   - Is Positive: {result.is_positive}")
        print(f"   - Focus Areas: {result.focus_areas}")
        print(f"   - Specific Issues: {result.specific_issues}")
        print(f"   - Recommendations: {result.recommendations}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during dual snapshot processing: {e}")
        return False

async def test_image_processing():
    """Test image processing functions"""
    
    print("\n🖼️  Testing Image Processing Functions...")
    
    try:
        # Test downscaling function
        import numpy as np
        import cv2
        
        # Create a test image
        test_image = np.ones((1000, 1000, 3), dtype=np.uint8) * 255  # White image
        
        # Test downscaling
        downscaled = dual_snapshot_service.downscale_image_for_openai(test_image)
        print(f"✅ Image downscaled from {test_image.shape} to {downscaled.shape}")
        
        # Test frame to data URL conversion
        data_url = dual_snapshot_service.frame_to_data_url(test_image)
        print(f"✅ Frame converted to data URL (length: {len(data_url)})")
        
        # Test data URL downscaling
        downscaled_data_url = dual_snapshot_service.downscale_data_url(data_url)
        print(f"✅ Data URL downscaled (length: {len(downscaled_data_url)})")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during image processing: {e}")
        return False

async def main():
    """Main test function"""
    
    print("🚀 Starting Dual Snapshot Service Tests")
    print("=" * 50)
    
    # Test image processing
    image_test_passed = await test_image_processing()
    
    # Test dual snapshot (only if we have a video file)
    dual_test_passed = await test_dual_snapshot()
    
    print("\n" + "=" * 50)
    print("📋 Test Results:")
    print(f"   - Image Processing: {'✅ PASSED' if image_test_passed else '❌ FAILED'}")
    print(f"   - Dual Snapshot: {'✅ PASSED' if dual_test_passed else '❌ FAILED'}")
    
    if image_test_passed and dual_test_passed:
        print("\n🎉 All tests passed! The dual snapshot service is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Please check the errors above.")
    
    return image_test_passed and dual_test_passed

if __name__ == "__main__":
    # Run the tests
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
