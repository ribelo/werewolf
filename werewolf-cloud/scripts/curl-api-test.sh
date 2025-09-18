#!/usr/bin/env bash

# Werewolf Cloud API Curl Test Script
# Tests all major endpoints to verify API functionality
# Run with: ./scripts/curl-api-test.sh [API_BASE_URL]
# Default: http://localhost:8787

set -e

API_BASE="${1:-http://localhost:8787}"
echo "🐺 Testing Werewolf Cloud API at: $API_BASE"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0

# Helper function to make requests and check responses
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local expected_status="${3:-200}"
    local data="$4"
    local description="$5"

    echo -e "\n${YELLOW}Testing: $description${NC}"
    echo "$method $endpoint"

    TESTS_RUN=$((TESTS_RUN + 1))

    local curl_cmd="curl -s -X $method"
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    curl_cmd="$curl_cmd '$API_BASE$endpoint'"

    local response
    response=$(eval "$curl_cmd")

    # Check if response is valid JSON
    if ! echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${RED}❌ Invalid JSON response${NC}"
        echo "Response: $response"
        return 1
    fi

    # Extract status from response if it's an error
    local actual_status
    actual_status=$(echo "$response" | jq -r '.error // empty' 2>/dev/null || echo "")

    if [ -n "$actual_status" ] && [ "$actual_status" != "null" ]; then
        echo -e "${RED}❌ API returned error: $actual_status${NC}"
        return 1
    fi

    # Check for required fields
    local has_data
    has_data=$(echo "$response" | jq 'has("data")' 2>/dev/null || echo "false")

    local has_requestId
    has_requestId=$(echo "$response" | jq 'has("requestId")' 2>/dev/null || echo "false")

    if [ "$has_data" != "true" ] || [ "$has_requestId" != "true" ]; then
        echo -e "${RED}❌ Response missing required fields (data, requestId)${NC}"
        echo "Response: $response"
        return 1
    fi

    echo -e "${GREEN}✅ Success${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
}

# Test Health Check
test_endpoint "GET" "/health" 200 "" "Health check endpoint"

# Test Get Contests
test_endpoint "GET" "/contests" 200 "" "List all contests"

# Test Get Competitors
test_endpoint "GET" "/competitors" 200 "" "List all competitors"

# Test Get Settings
test_endpoint "GET" "/settings" 200 "" "Get all settings"

# Test Get Settings UI
test_endpoint "GET" "/settings/ui" 200 "" "Get UI settings"

# Test Get Settings Language
test_endpoint "GET" "/settings/language" 200 "" "Get language setting"

# Test Update Settings UI
test_endpoint "PATCH" "/settings/ui" 200 '{
  "theme": "dark",
  "showWeights": true,
  "showAttempts": false
}' "Update UI settings"

# Test Reset Settings
test_endpoint "POST" "/settings/reset" 200 "" "Reset settings to defaults"

# Test Get Age Categories
test_endpoint "GET" "/reference/age-categories" 200 "" "Get age categories"

# Test Get Weight Classes
test_endpoint "GET" "/reference/weight-classes" 200 "" "Get weight classes"

# Test System Health
test_endpoint "GET" "/system/health" 200 "" "System health check"

# Test Create Contest (if no contests exist)
echo -e "\n${YELLOW}Testing contest creation...${NC}"
CREATE_RESPONSE=$(curl -s -X POST -H 'Content-Type: application/json' -d '{
  "name": "Test Contest",
  "date": "2025-12-01",
  "location": "Test Gym",
  "discipline": "Powerlifting"
}' "$API_BASE/contests")

if echo "$CREATE_RESPONSE" | jq -e '.data.id' >/dev/null 2>&1; then
    CONTEST_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id')
    echo -e "${GREEN}✅ Contest created with ID: $CONTEST_ID${NC}"

    # Test Get Single Contest
    test_endpoint "GET" "/contests/$CONTEST_ID" 200 "" "Get single contest"

    # Test Update Contest
    test_endpoint "PATCH" "/contests/$CONTEST_ID" 200 '{
      "status": "InProgress"
    }' "Update contest status"

    # Test Create Competitor
    echo -e "\n${YELLOW}Testing competitor creation...${NC}"
    COMPETITOR_RESPONSE=$(curl -s -X POST -H 'Content-Type: application/json' -d '{
      "firstName": "Test",
      "lastName": "User",
      "birthDate": "1990-01-01",
      "gender": "Male"
    }' "$API_BASE/competitors")

    if echo "$COMPETITOR_RESPONSE" | jq -e '.data.id' >/dev/null 2>&1; then
        COMPETITOR_ID=$(echo "$COMPETITOR_RESPONSE" | jq -r '.data.id')
        echo -e "${GREEN}✅ Competitor created with ID: $COMPETITOR_ID${NC}"

        # Test Register Competitor
        test_endpoint "POST" "/contests/$CONTEST_ID/registrations" 201 "{
          \"competitorId\": \"$COMPETITOR_ID\",
          \"bodyweight\": 80.5
        }" "Register competitor for contest"

        # Test Get Registrations
        test_endpoint "GET" "/contests/$CONTEST_ID/registrations" 200 "" "Get contest registrations"
    else
        echo -e "${RED}❌ Failed to create competitor${NC}"
        echo "Response: $COMPETITOR_RESPONSE"
    fi
else
    echo -e "${YELLOW}⚠️  Contest creation failed or contest already exists${NC}"
    echo "Response: $CREATE_RESPONSE"
fi

# Cleanup demo data if we created it
if [ -n "$COMPETITOR_ID" ]; then
    curl -s -X DELETE "$API_BASE/competitors/$COMPETITOR_ID" >/dev/null 2>&1 || true
fi
if [ -n "$CONTEST_ID" ]; then
    curl -s -X DELETE "$API_BASE/contests/$CONTEST_ID" >/dev/null 2>&1 || true
fi

# Test List Backups
test_endpoint "GET" "/system/backups" 200 "" "List backups"

# Test Database Status
test_endpoint "GET" "/system/database" 200 "" "Get database status"

# Summary
echo -e "\n${YELLOW}========================================"
echo "Test Summary:"
echo "========================================"
echo "Tests run: $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $((TESTS_RUN - TESTS_PASSED))"

if [ "$TESTS_PASSED" -eq "$TESTS_RUN" ]; then
    echo -e "${GREEN}🎉 All tests passed! API is ready.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Check API implementation.${NC}"
    exit 1
fi
echo -e "${NC}"
