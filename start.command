#!/bin/bash

# Get the directory where this file lives
DIR="$(cd "$(dirname "$0")" && pwd)"

# Start the dev server in the background
cd "$DIR"
npm run dev &
SERVER_PID=$!

# Wait for the server to be ready
echo "Starting VAPI Campaign Dialer..."
until curl -s http://localhost:5173 > /dev/null 2>&1; do
  sleep 0.5
done

# Open the browser
open http://localhost:5173

# Keep the terminal open so the server keeps running
echo ""
echo "Dashboard is running at http://localhost:5173"
echo "Close this window to stop the server."
wait $SERVER_PID
