#!/bin/sh
set -e
cd /app
PORT=3001 node backend/src/index.js &
nginx -g "daemon off;"
