#!/bin/bash

set -e

echo "Health check:"
curl -s http://localhost:3000/health; echo

# echo "Basic proxy request:"
# curl -s -X POST http://localhost:3000/proxy \
#   -H "Content-Type: application/json" \
#   -d '{"orgId":"test-org","payload":{"foo":"bar"}}'; echo

echo "Proxy to httpbin:"
curl -s -X POST http://localhost:3000/proxy \
  -H "Content-Type: application/json" \
  -H "x-url: https://httpbin.org/post" \
  -H "x-group-by: test-group" \
  -H "x-org: test-org" \
  -d '{"foo":"bar"}'; echo

curl -s -X POST http://localhost:11007/proxy \                                                                                                             ✔  5s  
  -H "Content-Type: application/json" \
  -H "x-url: https://blackadam-backend.getnitro.co.in/error" \
  -H "x-group-by: test-group" \
  -H "x-org: test-org" \
  -d '{"foo":"bar"}'; echo

echo "Summary:"
curl -s http://localhost:3000/metrics/summary | jq; echo

echo "Groups:"
curl -s http://localhost:3000/metrics/groups | jq; echo

echo "Historical:"
curl -s http://localhost:3000/metrics/historical | jq; echo

echo "Status:"
curl -s http://localhost:3000/metrics/status | jq; echo