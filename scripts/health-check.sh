#!/bin/bash
# Chronicle Stack Health Check Validation Script
# Usage: ./scripts/health-check.sh [api_url] [sync_url]

set -e

API_URL="${1:-http://localhost:8080}"
SYNC_URL="${2:-http://localhost:8788}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

check_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $name ($url)... "
    
    if HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null); then
        if [ "$HTTP_STATUS" = "$expected_status" ]; then
            echo -e "${GREEN}✓ OK (HTTP $HTTP_STATUS)${NC}"
            return 0
        else
            echo -e "${RED}✗ FAILED (HTTP $HTTP_STATUS, expected $expected_status)${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED (Connection error)${NC}"
        return 1
    fi
}

check_json_field() {
    local name=$1
    local url=$2
    local field=$3
    local expected=$4
    
    echo -n "Checking $name ($field=$expected)... "
    
    RESPONSE=$(curl -s "$url" 2>/dev/null)
    if [ -z "$RESPONSE" ]; then
        echo -e "${RED}✗ FAILED (No response)${NC}"
        return 1
    fi
    
    VALUE=$(echo "$RESPONSE" | grep -o "\"$field\":[[:space:]]*[^,}]*" | cut -d: -f2 | tr -d ' "')
    
    if [ "$VALUE" = "$expected" ]; then
        echo -e "${GREEN}✓ OK ($field=$VALUE)${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED ($field=$VALUE, expected $expected)${NC}"
        return 1
    fi
}

echo "========================================"
echo "Chronicle Stack Health Check Validation"
echo "========================================"
echo "API URL: $API_URL"
echo "Sync URL: $SYNC_URL"
echo ""

echo "--- API Health Endpoints ---"
check_endpoint "API Health" "$API_URL/api/health" || ((FAILED++))
check_endpoint "API Ready" "$API_URL/api/ready" || ((FAILED++))
check_json_field "API Health OK" "$API_URL/api/health" "ok" "true" || ((FAILED++))

echo ""
echo "--- Sync Service Health Endpoints ---"
check_endpoint "Sync Health" "$SYNC_URL/health" || ((FAILED++))
check_endpoint "Sync Ready" "$SYNC_URL/ready" || ((FAILED++))
check_json_field "Sync Health OK" "$SYNC_URL/health" "ok" "true" || ((FAILED++))

echo ""
echo "--- Docker Compose Service Health ---"
# Check if docker compose is available and services are running
if command -v docker &> /dev/null; then
    echo "Docker compose service status:"
    docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Health}}" 2>/dev/null || \
    docker-compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Health}}" 2>/dev/null || \
    echo "  (docker compose ps not available)"
else
    echo "Docker not available, skipping container health check"
fi

echo ""
echo "========================================"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All health checks passed!${NC}"
    echo "========================================"
    exit 0
else
    echo -e "${RED}$FAILED health check(s) failed!${NC}"
    echo "========================================"
    exit 1
fi
