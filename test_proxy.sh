#!/bin/bash

set -e

echo "Health check:"
curl -s http://localhost:3000/health; echo

echo "Basic proxy request:"
curl -s -X POST http://localhost:3000/proxy \
  -H "Content-Type: application/json" \
  -d '{"orgId":"test-org","payload":{"foo":"bar"}}'; echo

echo "Proxy to httpbin:"
curl -s -X POST http://localhost:3000/proxy \
  -H "Content-Type: application/json" \
  -d '{"orgId":"test-org","payload":{"foo":"bar", "targetUrl":"https://httpbin.org/post"}}'; echo

echo "Metrics:"
curl -s http://localhost:3000/metrics; echo
