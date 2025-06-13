#!/bin/bash

# Vendor Performance Choropleth Map - Setup Script
# This script helps you quickly start the application

echo "🗺️  Vendor Performance Choropleth Map Setup"
echo "=============================================="
echo

# Check if Python 3 is installed
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 found: $(python3 --version)"
else
    echo "❌ Python 3 is required but not found."
    echo "   Please install Python 3 and try again."
    exit 1
fi

# Check if required directories exist
if [ ! -d "input" ]; then
    echo "❌ 'input' directory not found."
    echo "   Please ensure your CSV and GeoJSON files are in the 'input' directory."
    exit 1
fi

echo "✅ Input directory found"

# Check for required files
required_files=("input/print_distribution.csv" "input/visitor_data.csv" "input/store_locations.csv" "input/NY_ZIP.geojson" "input/VT_ZIP.geojson")
missing_files=()

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    echo "❌ Missing required files:"
    for file in "${missing_files[@]}"; do
        echo "   - $file"
    done
    echo "   Please ensure all data files are present before starting."
    exit 1
fi

echo "✅ All required data files found"
echo

# Check if port 4001 is available
if lsof -Pi :4001 -sTCP:LISTEN -t >/dev/null; then
    echo "⚠️  Port 4001 is already in use."
    echo "   Please stop any existing server or use a different port."
    echo
    echo "   To kill existing server: sudo kill -9 \$(lsof -ti:4001)"
    echo "   To use different port: python3 -m http.server 8080"
    echo
    read -p "Would you like to try port 8080 instead? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PORT=8080
    else
        exit 1
    fi
else
    PORT=4001
fi

echo "🚀 Starting the vendor performance map..."
echo "   Server will be available at: http://localhost:$PORT"
echo "   Press Ctrl+C to stop the server"
echo

# Start the server
python3 -m http.server $PORT 