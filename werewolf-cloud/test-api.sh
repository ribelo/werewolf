#!/usr/bin/env bash

# Werewolf Cloud API Test Script
# Tests all implemented endpoints to verify functionality

API_BASE="http://localhost:8787"
TEST_RESULTS=()

echo "🧪 Testing Werewolf Cloud API"
echo "================================="

# Function to make requests and check responses
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=${4:-200}
    local description=$5
    
    echo -n "Testing $description... "
    
    if [ "$method" = "POST" ] || [ "$method" = "PATCH" ] || [ "$method" = "PUT" ]; then
        response=$(curl -s -X $method -H "Content-Type: application/json" -d "$data" $API_BASE$endpoint)
        status=$(curl -s -o /dev/null -w "%{http_code}" -X $method -H "Content-Type: application/json" -d "$data" $API_BASE$endpoint)
    else
        response=$(curl -s $API_BASE$endpoint)
        status=$(curl -s -o /dev/null -w "%{http_code}" $API_BASE$endpoint)
    fi
    
    if [ "$status" = "$expected_status" ]; then
        echo "✅ PASS"
        TEST_RESULTS+=("PASS: $description")
        return 0
    else
        echo "❌ FAIL (Status: $status, Expected: $expected_status)"
        TEST_RESULTS+=("FAIL: $description (Status: $status)")
        return 1
    fi
}

# Test 1: Health Check
test_endpoint "GET" "/health" "" 200 "Health Check"

# Test 2: System Health
test_endpoint "GET" "/system/health" "" 200 "System Health"

# Test 3: List Contests (should be empty initially)
test_endpoint "GET" "/contests" "" 200 "List Contests"

# Test 4: Create Contest
CONTEST_DATA='{
  "name": "Test Competition 2025",
  "date": "2025-09-20",
  "location": "Test Gym",
  "discipline": "Powerlifting",
  "federationRules": "IPF",
  "competitionType": "Local",
  "organizer": "Test Organizer",
  "notes": "API Test Competition"
}'
test_endpoint "POST" "/contests" "$CONTEST_DATA" 201 "Create Contest"

# Test 5: Get Created Contest
test_endpoint "GET" "/contests" "" 200 "Get Contests After Creation"

# Test 6: List Competitors (should be empty initially)
test_endpoint "GET" "/competitors" "" 200 "List Competitors"

# Test 7: Create Competitor
COMPETITOR_DATA='{
  "firstName": "John",
  "lastName": "Doe",
  "birthDate": "1990-05-15",
  "gender": "Male",
  "club": "Test Club",
  "city": "Test City",
  "notes": "API Test Competitor"
}'
test_endpoint "POST" "/competitors" "$COMPETITOR_DATA" 201 "Create Competitor"

# Test 8: Get Created Competitor
test_endpoint "GET" "/competitors" "" 200 "Get Competitors After Creation"

# Test 9: Get Reference Data
test_endpoint "GET" "/reference/weight-classes" "" 200 "Get Weight Classes"
test_endpoint "GET" "/reference/age-categories" "" 200 "Get Age Categories"

# Test 10: Settings
test_endpoint "GET" "/settings" "" 200 "Get Settings"
test_endpoint "GET" "/settings/health" "" 200 "Settings Health Check"

# Test 11: Error Handling - Invalid Contest ID
test_endpoint "GET" "/contests/invalid-id" "" 404 "Invalid Contest ID"

# Test 12: Error Handling - Invalid Competitor ID
test_endpoint "GET" "/competitors/invalid-id" "" 404 "Invalid Competitor ID"

# Test 13: Database Status
test_endpoint "GET" "/system/database" "" 200 "Database Status"

echo ""
echo "📊 Test Summary"
echo "==============="
PASS_COUNT=0
FAIL_COUNT=0

for result in "${TEST_RESULTS[@]}"; do
    echo "$result"
    if [[ $result == PASS* ]]; then
        ((PASS_COUNT++))
    else
        ((FAIL_COUNT++))
    fi
done

echo ""
echo "Total Tests: $((${#TEST_RESULTS[@]}))"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"

if [ $FAIL_COUNT -eq 0 ]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "⚠️  Some tests failed. Check the output above."
    exit 1
fi