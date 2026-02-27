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
REQUIRED_SERVICES=(api sync postgres redis meilisearch minio caddy)

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

check_compose_service() {
    local service=$1
    local status_line

    status_line=$(docker compose ps "$service" --format "table {{.Service}}\t{{.Status}}\t{{.Health}}" 2>/dev/null | tail -n +2 | head -n 1)
    if [ -z "$status_line" ]; then
        status_line=$(docker-compose ps "$service" --format "table {{.Service}}\t{{.Status}}\t{{.Health}}" 2>/dev/null | tail -n +2 | head -n 1)
    fi

    echo -n "Checking compose service $service... "
    if [ -z "$status_line" ]; then
        echo -e "${RED}✗ FAILED (service not found)${NC}"
        return 1
    fi

    if echo "$status_line" | grep -Eiq 'running|up'; then
        echo -e "${GREEN}✓ OK (${status_line})${NC}"
        return 0
    fi

    echo -e "${RED}✗ FAILED (${status_line})${NC}"
    return 1
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
# Check required Compose services are present and running.
if command -v docker &> /dev/null; then
    for service in "${REQUIRED_SERVICES[@]}"; do
        check_compose_service "$service" || ((FAILED++))
    done
else
    echo -e "${RED}Docker not available; cannot verify required compose services${NC}"
    ((FAILED++))
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
