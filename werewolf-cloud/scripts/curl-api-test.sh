#!/usr/bin/env bash
#
# Werewolf Cloud API smoke test.
#
#   ADMIN_PASSWORD=... ./scripts/curl-api-test.sh [API_BASE_URL]
#
# API_BASE_URL falls back to $API_BASE and then to http://localhost:8787.
#
# Every test issues exactly one curl request and then asserts that curl
# completed, that the HTTP status is the expected one and that the body is JSON
# carrying the {data, error, requestId} envelope (non-2xx answers must carry a
# message in "error"). With ADMIN_PASSWORD set the script signs in through
# POST /auth/login and reuses the session cookie; without it the protected
# endpoints answer 401 and the run fails. The contest, competitor and
# registration it creates are deleted again on exit. The script exits non-zero
# as soon as anything above is not true.

set -uo pipefail

API_BASE="${1:-${API_BASE:-http://localhost:8787}}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if ! command -v jq >/dev/null 2>&1; then
  echo "curl-api-test.sh needs jq on PATH" >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
BODY_FILE="$TMP_DIR/body.json"
CURL_ERR="$TMP_DIR/curl.err"

TESTS_RUN=0
TESTS_FAILED=0
FAILURES=()
TRANSPORT_ERRORS=0

# Fixtures created by this run; only these are removed again.
CONTEST_ID=""
COMPETITOR_ID=""
REGISTRATION_ID=""

LAST_STATUS=""
LAST_BODY=""
LAST_EXIT=0

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo -e "  ${GREEN}PASS${NC} $1"
}

fail() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILURES+=("$1: $2")
  echo -e "  ${RED}FAIL${NC} $1: $2"
  if [ -n "$LAST_BODY" ]; then
    echo "       body: $(printf '%s' "$LAST_BODY" | tr -d '\n' | head -c 300)"
  fi
}

cleanup() {
  local exit_code=$?

  if [ -n "$REGISTRATION_ID" ]; then
    request DELETE "/registrations/$REGISTRATION_ID"
    echo "cleanup: DELETE /registrations/$REGISTRATION_ID -> ${LAST_STATUS:-no response}"
  fi
  if [ -n "$COMPETITOR_ID" ]; then
    request DELETE "/competitors/$COMPETITOR_ID"
    echo "cleanup: DELETE /competitors/$COMPETITOR_ID -> ${LAST_STATUS:-no response}"
  fi
  if [ -n "$CONTEST_ID" ]; then
    request DELETE "/contests/$CONTEST_ID"
    echo "cleanup: DELETE /contests/$CONTEST_ID -> ${LAST_STATUS:-no response}"
  fi

  rm -rf "$TMP_DIR"
  exit "$exit_code"
}

# One request: the status lands in LAST_STATUS, the body in LAST_BODY.
request() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"
  local -a args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" -b "$COOKIE_JAR" -c "$COOKIE_JAR")

  if [ -n "$data" ]; then
    args+=(-H 'Content-Type: application/json' --data "$data")
  fi

  LAST_STATUS="$(curl "${args[@]}" "$API_BASE$endpoint" 2>"$CURL_ERR")"
  LAST_EXIT=$?
  LAST_BODY=""

  if [ "$LAST_EXIT" -eq 0 ]; then
    LAST_BODY="$(cat "$BODY_FILE" 2>/dev/null || true)"
  else
    TRANSPORT_ERRORS=$((TRANSPORT_ERRORS + 1))
  fi
}

# Asserts the outcome of the last request(). When id_var is given the envelope
# must carry data.id, which is stored in the named variable.
check_response() {
  local description="$1"
  local expected="$2"
  local id_var="${3:-}"

  if [ "$LAST_EXIT" -ne 0 ]; then
    fail "$description" "curl failed: $(head -n 1 "$CURL_ERR" 2>/dev/null)"
    return 1
  fi

  if [ "$LAST_STATUS" != "$expected" ]; then
    fail "$description" "expected HTTP $expected, got $LAST_STATUS"
    return 1
  fi

  if ! printf '%s' "$LAST_BODY" | jq -e . >/dev/null 2>&1; then
    fail "$description" "response is not valid JSON"
    return 1
  fi

  local envelope_error
  envelope_error="$(printf '%s' "$LAST_BODY" | jq -r 'if has("error") then (.error | tostring) else "<missing>" end')"

  if [ "$expected" -ge 400 ]; then
    if [ "$envelope_error" = "null" ] || [ "$envelope_error" = "<missing>" ] || [ -z "$envelope_error" ]; then
      fail "$description" "expected an error message in the envelope"
      return 1
    fi
  elif [ "$envelope_error" != "null" ]; then
    fail "$description" "unexpected error in envelope: $envelope_error"
    return 1
  fi

  if [ "$(printf '%s' "$LAST_BODY" | jq -r 'has("requestId")')" != "true" ]; then
    fail "$description" "response has no requestId"
    return 1
  fi

  if [ -n "$id_var" ]; then
    local id
    id="$(printf '%s' "$LAST_BODY" | jq -r 'if (.data | type) == "object" then (.data.id // empty) else empty end')"
    if [ -z "$id" ]; then
      fail "$description" "response carries no data.id"
      return 1
    fi
    printf -v "$id_var" '%s' "$id"
  fi

  pass "$description"
  return 0
}

# test_endpoint METHOD PATH EXPECTED_STATUS [JSON_BODY] DESCRIPTION [ID_VAR]
test_endpoint() {
  local method="$1"
  local endpoint="$2"
  local expected="$3"
  local data="${4:-}"
  local description="$5"
  local id_var="${6:-}"

  echo -e "${YELLOW}$method $endpoint${NC}"
  request "$method" "$endpoint" "$data"
  check_response "$description" "$expected" "$id_var"
}

sign_in() {
  if [ -z "$ADMIN_PASSWORD" ]; then
    echo -e "${YELLOW}ADMIN_PASSWORD is not set: running without a session, protected endpoints will answer 401.${NC}"
    return 0
  fi

  echo -e "${YELLOW}POST /auth/login${NC}"
  request POST /auth/login "$(jq -nc --arg password "$ADMIN_PASSWORD" '{password: $password}')"

  if [ "$LAST_EXIT" -ne 0 ] || [ "$LAST_STATUS" != "200" ] || ! grep -q 'werewolf_session' "$COOKIE_JAR" 2>/dev/null; then
    echo -e "${RED}Login failed (HTTP ${LAST_STATUS:-none})${NC}"
    if [ -n "$LAST_BODY" ]; then
      echo "body: $(printf '%s' "$LAST_BODY" | head -c 300)"
    fi
    exit 1
  fi

  echo -e "${GREEN}Signed in, session cookie stored.${NC}"
}

trap cleanup EXIT

echo "Werewolf Cloud API test"
echo "======================="
echo "Base URL: $API_BASE"

sign_in

echo -e "\n${YELLOW}Read endpoints${NC}"
test_endpoint GET /health 200 "" "API health check"
test_endpoint GET /system/health 200 "" "System health check"
test_endpoint GET /contests 200 "" "List contests"
test_endpoint GET /competitors 200 "" "List competitors"
test_endpoint GET /settings 200 "" "Get settings"
test_endpoint GET /settings/health 200 "" "Settings health check"
test_endpoint GET /settings/language 200 "" "Get language setting"
test_endpoint GET /reference/weight-classes 200 "" "Get weight classes"
test_endpoint GET /reference/age-categories 200 "" "Get age categories"
test_endpoint GET /system/database 200 "" "Database status"
test_endpoint GET /system/backups 200 "" "List backups"

echo -e "\n${YELLOW}Settings${NC}"
ORIGINAL_THEME=""
if test_endpoint GET /settings/ui 200 "" "Get UI settings"; then
  ORIGINAL_THEME="$(printf '%s' "$LAST_BODY" | jq -r 'if (.data | type) == "object" then (.data.theme // empty) else empty end')"
fi

NEW_THEME="dark"
if [ "$ORIGINAL_THEME" = "dark" ]; then
  NEW_THEME="light"
fi

test_endpoint PATCH /settings/ui 200 "$(jq -nc --arg theme "$NEW_THEME" '{theme: $theme}')" "Update UI settings"

if [ -n "$ORIGINAL_THEME" ]; then
  test_endpoint PUT /settings 200 "$(jq -nc --arg theme "$ORIGINAL_THEME" '{ui: {theme: $theme}}')" "Restore UI theme"
fi

echo -e "\n${YELLOW}Fixtures${NC}"
CONTEST_PAYLOAD="$(jq -nc \
  --arg name "API smoke test contest" \
  --arg date "$(date -u +%F)" \
  '{name: $name, date: $date, location: "API test gym", discipline: "Powerlifting"}')"

if test_endpoint POST /contests 201 "$CONTEST_PAYLOAD" "Create contest" CONTEST_ID; then
  test_endpoint GET "/contests/$CONTEST_ID" 200 "" "Get created contest"
  test_endpoint PATCH "/contests/$CONTEST_ID" 200 "$(jq -nc '{status: "InProgress"}')" "Update created contest"

  COMPETITOR_PAYLOAD="$(jq -nc '{firstName: "Api", lastName: "Tester", birthDate: "1990-01-01", gender: "Male"}')"
  if test_endpoint POST /competitors 201 "$COMPETITOR_PAYLOAD" "Create competitor" COMPETITOR_ID; then
    test_endpoint GET "/competitors/$COMPETITOR_ID" 200 "" "Get created competitor"

    REGISTRATION_PAYLOAD="$(jq -nc --arg competitorId "$COMPETITOR_ID" '{competitorId: $competitorId, bodyweight: 82.5}')"
    if test_endpoint POST "/contests/$CONTEST_ID/registrations" 201 "$REGISTRATION_PAYLOAD" "Register competitor" REGISTRATION_ID; then
      test_endpoint GET "/contests/$CONTEST_ID/registrations" 200 "" "List contest registrations"
    fi
  fi
else
  echo -e "${RED}Skipping the remaining fixture tests: no contest id.${NC}"
fi

echo -e "\n${YELLOW}Error handling${NC}"
test_endpoint GET /contests/invalid-id 404 "" "Unknown contest id is rejected"
test_endpoint PATCH /contests/invalid-id 404 "$(jq -nc '{status: "InProgress"}')" "Unknown contest id cannot be updated"
test_endpoint GET /competitors/invalid-id 404 "" "Unknown competitor id is rejected"
test_endpoint POST /competitors 400 "$(jq -nc '{firstName: "Api"}')" "Incomplete competitor payload is rejected"

echo -e "\n${YELLOW}Teardown (only this run's fixtures)${NC}"
if [ -n "$REGISTRATION_ID" ] && test_endpoint DELETE "/registrations/$REGISTRATION_ID" 200 "" "Delete test registration"; then
  REGISTRATION_ID=""
fi
if [ -n "$COMPETITOR_ID" ] && test_endpoint DELETE "/competitors/$COMPETITOR_ID" 200 "" "Delete test competitor"; then
  COMPETITOR_ID=""
fi
if [ -n "$CONTEST_ID" ] && test_endpoint DELETE "/contests/$CONTEST_ID" 200 "" "Delete test contest"; then
  CONTEST_ID=""
fi

echo -e "\n${YELLOW}========================================${NC}"
echo "Tests run: $TESTS_RUN"
echo "Tests passed: $((TESTS_RUN - TESTS_FAILED))"
echo "Tests failed: $TESTS_FAILED"

if [ "$TESTS_FAILED" -gt 0 ]; then
  echo "Failures:"
  for failure in "${FAILURES[@]}"; do
    echo "  - $failure"
  done
fi

if [ "$TRANSPORT_ERRORS" -gt 0 ]; then
  echo -e "${RED}$TRANSPORT_ERRORS request(s) could not reach $API_BASE - is the API running?${NC}"
fi

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}All tests passed.${NC}"
  exit 0
fi

echo -e "${RED}$TESTS_FAILED test(s) failed.${NC}"
exit 1
