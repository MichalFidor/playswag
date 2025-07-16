#!/bin/bash

# PlaySwag Test Script
# Runs all tests and examples to verify the package works correctly

echo "🚀 PlaySwag - Comprehensive Test Suite"
echo "======================================"

echo ""
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "🧪 Running unit tests..."
npm run test:unit

if [ $? -ne 0 ]; then
    echo "❌ Unit tests failed!"
    exit 1
fi

echo ""
echo "🔗 Running integration tests..."
npm run test:integration

if [ $? -ne 0 ]; then
    echo "❌ Integration tests failed!"
    exit 1
fi

echo ""
echo "📋 Running all examples..."
cd examples
npm install --silent
npm test

if [ $? -ne 0 ]; then
    echo "❌ Examples failed!"
    exit 1
fi

cd ..

echo ""
echo "✅ All tests passed successfully!"
echo ""
echo "📊 Test Coverage Summary:"
echo "  • Unit Tests: ✅ Core functionality verified"
echo "  • Integration Tests: ✅ End-to-end workflows verified"  
echo "  • Examples: ✅ Real-world usage scenarios verified"
echo ""
echo "🎉 PlaySwag is ready for production use!"
