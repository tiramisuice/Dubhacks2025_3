#!/usr/bin/env python3
"""
Test script to verify the dual snapshot endpoint is working
"""

import requests
import base64
import json

def test_dual_snapshot_endpoint():
    """Test the dual snapshot endpoint with a simple request"""
    
    # Create a simple test image (1x1 pixel)
    test_image_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    test_image_base64 = f"data:image/png;base64,{test_image_data}"
    
    # Test data
    test_data = {
        "webcam_image": test_image_base64,
        "reference_video_path": "test_video.mp4",  # This will fail, but we can see the error
        "video_timestamp": 5.0,
        "session_id": "test_session_123"
    }
    
    try:
        print("🧪 Testing dual snapshot endpoint...")
        print(f"📡 Sending request to: http://localhost:8000/api/sessions/dual-snapshot")
        
        response = requests.post(
            "http://localhost:8000/api/sessions/dual-snapshot",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📊 Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Endpoint is working!")
            print(f"📝 Response: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"📝 Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend server")
        print("Make sure the backend is running on http://localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_dual_snapshot_endpoint()
