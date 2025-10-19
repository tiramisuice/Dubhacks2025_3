#!/usr/bin/env python3
"""
Quick OpenAI API Test
Run this script to quickly test if OpenAI API is working.
"""

import asyncio
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

from test_openai_startup import main

if __name__ == "__main__":
    print("Quick OpenAI API Test")
    print("=" * 40)
    
    try:
        result = asyncio.run(main())
        if result:
            print("\nSUCCESS: OpenAI API is working!")
            sys.exit(0)
        else:
            print("\nFAILED: OpenAI API is not working")
            sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
