# CleanSpace Pro API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
Currently, no authentication required (development mode).

---

## Health Check

### GET /health
Check API health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-17T04:24:00.000Z",
  "service": "CleanSpace Pro API"
}
```

---

## Quotes API

### POST /quotes/
Create a new quote request.

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "+15555551234",
  "service_type": "weekly" // weekly, biweekly, monthly, onetime, damage_specialist, hospital_specialist
}
```

**Response:**
```json
{
  "success": true,
  "message": "Quote request submitted successfully! We will contact you soon.",
  "data": {
    "quote_id": 1,
    "inquiry_id": 1,
    "estimated_total": 150,
    "service_type": "weekly"
  }
}
```

### GET /quotes/:id
Get quote by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "inquiry_id": 1,
    "service_type": "weekly",
    "estimated_hours": 2,
    "hourly_rate": 75,
    "total_amount": 150,
    "notes": null,
    "status": "pending",
    "created_at": "2025-10-17 04:19:25",
    "name": "Test User",
    "phone": "+15555551234",
    "email": null
  }
}
```

---

## Appointments API

### GET /appointments/
Get all appointments with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (scheduled, confirmed, completed, cancelled)
- `date` (optional): Filter by appointment date (YYYY-MM-DD)
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "customer_name": "John Doe",
      "customer_phone": "+15555551234",
      "service_type": "weekly",
      "appointment_date": "2025-10-20",
      "appointment_time": "10:00",
      "status": "scheduled"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

### GET /appointments/:id
Get appointment by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "inquiry_id": null,
    "customer_name": "John Doe",
    "customer_phone": "+15555551234",
    "customer_email": "john@example.com",
    "service_type": "weekly",
    "appointment_type": "initial_consultation",
    "appointment_date": "2025-10-20",
    "appointment_time": "10:00",
    "duration_minutes": 90,
    "status": "scheduled",
    "notes": "First floor cleaning needed",
    "property_size": "2000 sq ft",
    "special_requirements": null,
    "created_at": "2025-10-17 04:24:14",
    "updated_at": "2025-10-17 04:24:14"
  }
}
```

### POST /appointments/
Create a new appointment.

**Request Body:**
```json
{
  "customer_name": "John Doe",
  "customer_phone": "+15555551234",
  "customer_email": "john@example.com",
  "service_type": "weekly",
  "appointment_type": "initial_consultation",
  "appointment_date": "2025-10-20",
  "appointment_time": "10:00",
  "duration_minutes": 90,
  "property_size": "2000 sq ft",
  "special_requirements": "Pet-friendly products",
  "notes": "First floor cleaning needed"
}
```

**Validation Rules:**
- `customer_name`: 2-100 characters
- `customer_phone`: Valid mobile phone
- `customer_email`: Valid email (optional)
- `service_type`: One of: weekly, biweekly, monthly, onetime, damage_specialist, hospital_specialist
- `appointment_type`: One of: initial_consultation, regular_cleaning, deep_cleaning, estimate
- `appointment_date`: ISO 8601 date
- `appointment_time`: HH:MM format
- `duration_minutes`: 30-480 minutes (optional, default: 60)

**Response:**
```json
{
  "success": true,
  "message": "Appointment scheduled successfully",
  "data": {
    "id": 1,
    "appointment_date": "2025-10-20T00:00:00.000Z",
    "appointment_time": "10:00",
    "status": "scheduled"
  }
}
```

### PUT /appointments/:id
Update an existing appointment.

**Request Body (all fields optional):**
```json
{
  "appointment_date": "2025-10-21",
  "appointment_time": "14:00",
  "status": "confirmed",
  "notes": "Customer confirmed via phone",
  "special_requirements": "Use eco-friendly products",
  "cancellation_reason": "Customer request" // Only if status is 'cancelled'
}
```

**Status Options:**
- `scheduled` - Initial status
- `confirmed` - Customer confirmed (sets confirmed_at timestamp)
- `completed` - Service completed (sets completed_at timestamp)
- `cancelled` - Appointment cancelled (sets cancelled_at timestamp)

**Response:**
```json
{
  "success": true,
  "message": "Appointment updated successfully"
}
```

### DELETE /appointments/:id
Delete an appointment.

**Response:**
```json
{
  "success": true,
  "message": "Appointment deleted successfully"
}
```

---

## Inquiries API

### POST /inquiries/
Create a customer inquiry.

---

## Chat API

### POST /chat/
Send a chat message to the AI assistant.

---

## Analytics API

### GET /analytics/
Get analytics data.

---

## Other Available APIs

- `/api/reliability` - Reliability monitoring
- `/api/lifecycle` - AI model lifecycle management
- `/api/optimization` - Cost optimization metrics
- `/api/metrics` - Performance metrics
- `/api/safety` - Safety and compliance tracking
- `/api/reliability-monitoring` - Advanced reliability monitoring
- `/api/dashboard` - Dashboard data aggregation
- `/api/canary` - Canary deployment monitoring

---

## Error Responses

All endpoints return standard error format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "customer_name",
      "message": "Must be between 2 and 100 characters"
    }
  ]
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

- **Window**: 15 minutes
- **Max Requests**: 100 per IP
- **Response when exceeded**:
  ```json
  {
    "error": "Too many requests from this IP, please try again later."
  }
  ```

---

## CORS

- **Allowed Origin**: `http://localhost:3000` (development)
- **Methods**: GET, POST, PUT, DELETE
- **Headers**: Content-Type, Authorization
