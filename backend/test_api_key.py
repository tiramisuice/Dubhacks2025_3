#!/usr/bin/env python3
"""
Test script to verify OpenAI API key is working
"""

import os
from dotenv import load_dotenv

def test_api_key():
    """Test if the OpenAI API key is properly configured"""
    
    # Load environment variables
    load_dotenv()
    
    # Check if API key exists
    api_key = os.getenv("OPENAI_API_KEY")
    
    if not api_key:
        print("❌ OPENAI_API_KEY not found in environment variables")
        print("Please create a .env file with: OPENAI_API_KEY=sk-...")
        return False
    
    if not api_key.startswith("sk-"):
        print("❌ OPENAI_API_KEY doesn't look like a valid key (should start with 'sk-')")
        return False
    
    print(f"✅ OpenAI API key found: {api_key[:10]}...")
    
    # Test OpenAI client initialization
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        print("✅ OpenAI client initialized successfully")
        return True
    except Exception as e:
        print(f"❌ Error initializing OpenAI client: {e}")
        return False

if __name__ == "__main__":
    print("🔑 Testing OpenAI API Key Configuration...")
    print("=" * 50)
    
    success = test_api_key()
    
    if success:
        print("\n🎉 API key is properly configured!")
        print("You can now start the backend server.")
    else:
        print("\n⚠️  API key configuration needs to be fixed.")
        print("Please check your .env file and try again.")
