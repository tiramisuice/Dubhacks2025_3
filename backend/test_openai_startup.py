#!/usr/bin/env python3
"""
OpenAI API Test Script for Server Startup
This script tests if OpenAI API is working correctly when the server starts.
"""

import asyncio
import base64
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv
import cv2
import numpy as np

# Load environment variables
load_dotenv()

async def test_openai_connection():
    """Test OpenAI API connection with a simple image analysis"""
    
    print("Testing OpenAI API connection...")
    
    # Check if API key exists
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not found in environment variables")
        return False
    
    if not api_key.startswith("sk-"):
        print("ERROR: OPENAI_API_KEY doesn't look like a valid key")
        return False
    
    print("SUCCESS: API key found and looks valid")
    
    try:
        # Initialize OpenAI client
        client = AsyncOpenAI(api_key=api_key)
        
        # Create a simple test image (a small colored square)
        test_image = np.ones((100, 100, 3), dtype=np.uint8) * 128  # Gray square
        test_image[20:80, 20:80] = [255, 0, 0]  # Red square in the middle
        
        # Encode as JPEG
        success, buffer = cv2.imencode(".jpg", test_image)
        if not success:
            print("ERROR: Failed to encode test image")
            return False
        
        # Convert to base64 data URL
        b64 = base64.b64encode(buffer).decode("ascii")
        data_url = f"data:image/jpeg;base64,{b64}"
        
        print("Created test image, sending to OpenAI...")
        
        # Test API call
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "What do you see in this image? Respond with just a brief description."},
                    {"type": "image_url", "image_url": {"url": data_url, "detail": "low"}}
                ]
            }],
            max_tokens=50,
            temperature=0.1
        )
        
        result = response.choices[0].message.content
        print(f"SUCCESS: OpenAI API working! Response: {result}")
        return True
        
    except Exception as e:
        print(f"ERROR: OpenAI API test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("Starting OpenAI API startup test...")
    
    success = await test_openai_connection()
    
    if success:
        print("SUCCESS: OpenAI API is ready for dual snapshot analysis!")
    else:
        print("WARNING: OpenAI API test failed - dual snapshot may not work properly")
    
    return success

if __name__ == "__main__":
    asyncio.run(main())
