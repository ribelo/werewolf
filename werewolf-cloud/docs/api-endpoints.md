# Werewolf Cloud API Documentation

## Overview

The Werewolf Cloud API provides RESTful endpoints for managing powerlifting contests, competitors, registrations, attempts, and results. All endpoints return JSON responses and use standard HTTP status codes.

**Base URL:** `https://werewolf.r-krzywaznia-2c4.workers.dev`

## Authentication

Currently, the API does not require authentication. In production, consider implementing API keys or OAuth.

## Response Format

All responses follow this structure:

```json
{
  "data": { ... },
  "error": null,
  "requestId": "uuid"
}
```

Error responses:

```json
{
  "error": "Error message",
  "requestId": "uuid"
}
```

## Core Endpoints

### Health Check

#### GET /health

Check API health status.

**Response:**
```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-09-18T08:00:00.000Z"
  },
  "error": null,
  "requestId": "uuid"
}
```

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/health
```

### System Health

#### GET /system/health

Get detailed system health information.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "stats": {
    "contests_count": 5,
    "competitors_count": 25,
    "registrations_count": 20,
    "attempts_count": 80
  },
  "timestamp": "2025-09-18T08:00:00.000Z",
  "version": "1.0.0"
}
```

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/system/health
```

## Contest Management

### List Contests

#### GET /contests

Get all contests.

**Query Parameters:**
- `status` (optional): Filter by contest status (`Setup`, `InProgress`, `Paused`, `Completed`)
- `limit` (optional): Limit results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Test Competition 2025",
    "date": "2025-09-20",
    "location": "Test Gym",
    "discipline": "Powerlifting",
    "status": "Setup",
    "federationRules": "IPF",
    "competitionType": "Local",
    "organizer": "Test Organizer",
    "notes": "API Test Competition",
    "isArchived": false,
    "createdAt": "2025-09-18T08:00:00.000Z",
    "updatedAt": "2025-09-18T08:00:00.000Z",
    "mensBarWeight": 20,
    "womensBarWeight": 15,
    "barWeight": 20
  }
]
```

**Example:**
```bash
curl -X GET "https://werewolf.r-krzywaznia-2c4.workers.dev/contests?status=Setup"
```

### Create Contest

#### POST /contests

Create a new contest.

**Request Body:**
```json
{
  "name": "Test Competition 2025",
  "date": "2025-09-20",
  "location": "Test Gym",
  "discipline": "Powerlifting",
  "federationRules": "IPF",
  "competitionType": "Local",
  "organizer": "Test Organizer",
  "notes": "API Test Competition"
}
```

**Response:** Contest object (201 Created)

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Competition 2025",
    "date": "2025-09-20",
    "location": "Test Gym",
    "discipline": "Powerlifting",
    "federationRules": "IPF",
    "competitionType": "Local",
    "organizer": "Test Organizer",
    "notes": "API Test Competition"
  }'
```

### Get Contest

#### GET /contests/{contestId}

Get a specific contest by ID.

**Response:** Contest object

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000
```

### Update Contest

#### PATCH /contests/{contestId}

Update contest details.

**Request Body:** Partial contest object

**Example:**
```bash
curl -X PATCH https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "InProgress",
    "notes": "Updated notes"
  }'
```

### Delete Contest

#### DELETE /contests/{contestId}

Delete a contest.

**Example:**
```bash
curl -X DELETE https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000
```

### Get Contest State

#### GET /contests/{contestId}/state

Get contest state information.

**Response:**
```json
{
  "contest_id": "uuid",
  "status": "InProgress",
  "current_lift": "Squat",
  "current_round": 1
}
```

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/state
```

### Update Contest State

#### PUT /contests/{contestId}/state

Update contest state.

**Request Body:**
```json
{
  "status": "InProgress",
  "currentLift": "Bench",
  "currentRound": 2
}
```

**Example:**
```bash
curl -X PUT https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/state \
  -H "Content-Type: application/json" \
  -d '{
    "status": "InProgress",
    "currentLift": "Bench",
    "currentRound": 2
  }'
```

## Competitor Management

### List Competitors

#### GET /competitors

Get all competitors.

**Query Parameters:**
- `search` (optional): Search by name
- `limit` (optional): Limit results
- `offset` (optional): Pagination offset

**Response:** Array of competitor objects

**Example:**
```bash
curl -X GET "https://werewolf.r-krzywaznia-2c4.workers.dev/competitors?search=John"
```

### Create Competitor

#### POST /competitors

Create a new competitor.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "birthDate": "1990-05-15",
  "gender": "Male",
  "club": "Test Club",
  "city": "Test City",
  "notes": "Test competitor"
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/competitors \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "birthDate": "1990-05-15",
    "gender": "Male",
    "club": "Test Club",
    "city": "Test City",
    "notes": "Test competitor"
  }'
```

### Get Competitor

#### GET /competitors/{competitorId}

Get a specific competitor.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/competitors/123e4567-e89b-12d3-a456-426614174000
```

### Update Competitor

#### PATCH /competitors/{competitorId}

Update competitor details.

**Example:**
```bash
curl -X PATCH https://werewolf.r-krzywaznia-2c4.workers.dev/competitors/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{
    "club": "Updated Club",
    "notes": "Updated notes"
  }'
```

### Upload Competitor Photo

#### PUT /competitors/{competitorId}/photo

Upload a photo for the competitor.

**Request Body:**
```json
{
  "photoData": "base64-encoded-image-data",
  "filename": "photo.jpg"
}
```

**Example:**
```bash
curl -X PUT https://werewolf.r-krzywaznia-2c4.workers.dev/competitors/123e4567-e89b-12d3-a456-426614174000/photo \
  -H "Content-Type: application/json" \
  -d '{
    "photoData": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "filename": "john-doe.jpg"
  }'
```

### Get Competitor Photo

#### GET /competitors/{competitorId}/photo

Get competitor's photo.

**Response:**
```json
{
  "data": "base64-encoded-image-data",
  "format": "webp"
}
```

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/competitors/123e4567-e89b-12d3-a456-426614174000/photo
```

## Registration Management

### List Registrations for Contest

#### GET /contests/{contestId}/registrations

Get all registrations for a contest.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/registrations
```

### Create Registration

#### POST /contests/{contestId}/registrations

Register a competitor for a contest.

**Request Body:**
```json
{
  "competitorId": "uuid",
  "bodyweight": 82.5,
  "equipmentM": false,
  "equipmentSm": false,
  "equipmentT": false,
  "lotNumber": "001",
  "personalRecordAtEntry": 200.0
}
```

**Note:** `ageCategoryId` and `weightClassId` are optional - they will be auto-calculated if not provided.

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/registrations \
  -H "Content-Type: application/json" \
  -d '{
    "competitorId": "456e7890-e89b-12d3-a456-426614174001",
    "bodyweight": 82.5,
    "equipmentM": false,
    "equipmentSm": false,
    "equipmentT": false,
    "lotNumber": "001",
    "personalRecordAtEntry": 200.0
  }'
```

### Get Registration

#### GET /registrations/{registrationId}

Get a specific registration.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/registrations/789e0123-e89b-12d3-a456-426614174002
```

### Update Registration

#### PATCH /registrations/{registrationId}

Update registration details.

**Example:**
```bash
curl -X PATCH https://werewolf.r-krzywaznia-2c4.workers.dev/registrations/789e0123-e89b-12d3-a456-426614174002 \
  -H "Content-Type: application/json" \
  -d '{
    "bodyweight": 83.0,
    "lotNumber": "002"
  }'
```

## Attempt Management

### Upsert Attempt Weight

#### POST /contests/{contestId}/registrations/{registrationId}/attempts

Create or update an attempt weight.

**Request Body:**
```json
{
  "liftType": "Squat",
  "attemptNumber": 1,
  "weight": 200.0
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/registrations/789e0123-e89b-12d3-a456-426614174002/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "liftType": "Squat",
    "attemptNumber": 1,
    "weight": 200.0
  }'
```

### List Attempts for Registration

#### GET /contests/{contestId}/registrations/{registrationId}/attempts

Get all attempts for a registration.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/registrations/789e0123-e89b-12d3-a456-426614174002/attempts
```

### Update Attempt Result

#### PATCH /attempts/{attemptId}/result

Update attempt result (success/failure).

**Request Body:**
```json
{
  "status": "Successful",
  "judge1Decision": true,
  "judge2Decision": true,
  "judge3Decision": true,
  "notes": "Good lift"
}
```

**Example:**
```bash
curl -X PATCH https://werewolf.r-krzywaznia-2c4.workers.dev/attempts/012e3456-e89b-12d3-a456-426614174003/result \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Successful",
    "judge1Decision": true,
    "judge2Decision": true,
    "judge3Decision": true,
    "notes": "Good lift"
  }'
```

### Get Current Attempt

#### GET /contests/{contestId}/attempts/current

Get the currently active attempt.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/attempts/current
```

### Set Current Attempt

#### PUT /contests/{contestId}/attempts/current

Set the currently active attempt.

**Request Body:**
```json
{
  "attemptId": "uuid"
}
```

**Example:**
```bash
curl -X PUT https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/attempts/current \
  -H "Content-Type: application/json" \
  -d '{
    "attemptId": "012e3456-e89b-12d3-a456-426614174003"
  }'
```

## Results & Scoring

### Recalculate Results

#### POST /contests/{contestId}/results/recalculate

Recalculate all results for a contest.

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/results/recalculate
```

### Get Rankings

#### GET /contests/{contestId}/results/rankings

Get contest rankings.

**Query Parameters:**
- `type` (optional): Ranking type (`open`, `age`, `weight`) - default: `open`

**Example:**
```bash
curl -X GET "https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/results/rankings?type=age"
```

### Get Competitor Results

#### GET /registrations/{registrationId}/results

Get results for a specific competitor.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/registrations/789e0123-e89b-12d3-a456-426614174002/results
```

### Export Results

#### POST /contests/{contestId}/results/export

Export results in CSV or JSON format.

**Request Body:**
```json
{
  "format": "csv"
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/results/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "csv"
  }'
```

### Get Scoreboard

#### GET /contests/{contestId}/scoreboard

Get scoreboard data for display.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/scoreboard
```

## Equipment Management

### List Plate Sets

#### GET /contests/{contestId}/platesets

Get plate sets for a contest.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/platesets
```

### Create Plate Set

#### POST /contests/{contestId}/platesets

Add plates to a contest.

**Request Body:**
```json
{
  "plateWeight": 25.0,
  "quantity": 4,
  "color": "#DC2626"
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/platesets \
  -H "Content-Type: application/json" \
  -d '{
    "plateWeight": 25.0,
    "quantity": 4,
    "color": "#DC2626"
  }'
```

### Calculate Plates

#### POST /contests/{contestId}/platesets/calculate

Calculate plate loading for a target weight.

**Request Body:**
```json
{
  "targetWeight": 200.0,
  "barWeight": 20.0
}
```

**Response:**
```json
{
  "plates": [
    { "plateWeight": 25, "count": 2, "color": "#DC2626" },
    { "plateWeight": 10, "count": 1, "color": "#16A34A" }
  ],
  "totalLoaded": 220.0,
  "barWeight": 20.0
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/contests/123e4567-e89b-12d3-a456-426614174000/platesets/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "targetWeight": 200.0,
    "barWeight": 20.0
  }'
```

## Reference Data

### Get Weight Classes

#### GET /reference/weight-classes

Get all weight classes.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/reference/weight-classes
```

### Get Age Categories

#### GET /reference/age-categories

Get all age categories.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/reference/age-categories
```

## Settings Management

### Get Settings

#### GET /settings

Get all application settings.

**Response:** Parsed settings object (not raw JSON string)

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/settings
```

### Update Settings

#### PUT /settings

Update all settings.

**Request Body:** Complete settings object

**Example:**
```bash
curl -X PUT https://werewolf.r-krzywaznia-2c4.workers.dev/settings \
  -H "Content-Type: application/json" \
  -d '{
    "language": "pl",
    "ui": {
      "theme": "dark",
      "showWeights": true,
      "showAttempts": true
    },
    "competition": {
      "federationRules": "IPF",
      "defaultBarWeight": 20
    },
    "database": {
      "backupEnabled": true,
      "autoBackupInterval": 24
    }
  }'
```

### Update UI Settings

#### PATCH /settings/ui

Update UI-specific settings.

**Example:**
```bash
curl -X PATCH https://werewolf.r-krzywaznia-2c4.workers.dev/settings/ui \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "dark",
    "showWeights": true
  }'
```

### Get Language Setting

#### GET /settings/language

Get current language setting.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/settings/language
```

### Set Language

#### PUT /settings/language

Set language preference.

**Example:**
```bash
curl -X PUT https://werewolf.r-krzywaznia-2c4.workers.dev/settings/language \
  -H "Content-Type: application/json" \
  -d '{
    "language": "en"
  }'
```

## System Management

### Get Database Status

#### GET /system/database

Get database statistics.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/system/database
```

### List Backups

#### GET /system/backups

List all available backups.

**Example:**
```bash
curl -X GET https://werewolf.r-krzywaznia-2c4.workers.dev/system/backups
```

### Create Backup

#### POST /system/backups

Create a new backup of all data.

**Response:**
```json
{
  "success": true,
  "backupId": "backup_1632000000000",
  "timestamp": "2025-09-18T08:00:00.000Z",
  "size": 1024,
  "recordCounts": {
    "contests": 5,
    "competitors": 25,
    "registrations": 20,
    "attempts": 80,
    "results": 20
  }
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/system/backups
```

### Restore from Backup

#### POST /system/backups/{backupId}/restore

Restore data from a backup.

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/system/backups/backup_1632000000000/restore
```

### Reset Database

#### POST /system/database/reset

Reset database (dangerous - use with caution).

**Request Body:**
```json
{
  "confirm": "YES_I_WANT_TO_RESET_THE_DATABASE"
}
```

**Example:**
```bash
curl -X POST https://werewolf.r-krzywaznia-2c4.workers.dev/system/database/reset \
  -H "Content-Type: application/json" \
  -d '{
    "confirm": "YES_I_WANT_TO_RESET_THE_DATABASE"
  }'
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `404`: Not Found
- `500`: Internal Server Error

Error responses include a descriptive message and request ID for debugging.

## Rate Limiting

Currently, no rate limiting is implemented. Consider adding rate limiting in production based on usage patterns.

## Data Types

### Common Data Types

- **UUID**: String in UUID format (e.g., `123e4567-e89b-12d3-a456-426614174000`)
- **Timestamp**: ISO 8601 string (e.g., `2025-09-18T08:00:00.000Z`)
- **Gender**: `"Male"` or `"Female"`
- **Lift Type**: `"Squat"`, `"Bench"`, or `"Deadlift"`
- **Attempt Status**: `"Pending"`, `"Successful"`, `"Failed"`, or `"Skipped"`

This documentation covers all implemented API endpoints. For the most up-to-date information, refer to the OpenAPI specification or test the endpoints directly.