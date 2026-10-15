# 2care — AI Healthcare Operations Command Center

An enterprise clinical command center integrating autonomous voice scheduling with an authoritative healthcare operations backend and real-time dashboard.

---

## Architecture Overview

- **Frontend:** React 19, TypeScript 5.7, Vite 8, Tailwind CSS v4, Motion, Recharts, Lucide React icons.
- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic migrations.
- **Database:** Dual-mode PostgreSQL engine with automatic asynchronous SQLite fallback (`healthcare_ops.db`) for immediate zero-config execution.
- **Voice Intelligence:** Retell AI custom functions for real-time provider search, slot availability checks, transactional booking with concurrency locks, and webhook ingestion.

---

## Quickstart

### 1. Frontend Development Server (Port 8443)
```powershell
npm install
npm run dev
```
Preview URL: [http://localhost:8443/](http://localhost:8443/)

### 2. FastAPI Backend Server (Port 8000)
```powershell
python -m venv backend\.venv
backend\.venv\Scripts\pip install -r backend\requirements.txt
backend\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation (Swagger UI): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Run Backend Test Suite
```powershell
backend\.venv\Scripts\pytest -v backend/tests
```

---

## Retell AI Voice Agent Integration Guide

Retell AI connects to 2care via **Custom Function Tools** and a **Call Webhook**.

### 1. Environment Configuration

Add the following to your `backend/.env` file:

```ini
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=your_retell_agent_id
RETELL_WEBHOOK_SECRET=your_retell_webhook_secret
RETELL_CUSTOM_TOOL_SECRET=your_custom_bearer_secret
```

> **Note:** If live Retell credentials are not set, the dashboard operates in verified **Demo/Simulation Mode**. You can execute test calls via the dashboard simulator or run automated scenario tests.

---

### 2. Custom Functions Setup in Retell Dashboard

In the Retell AI Dashboard under **Agents -> [Your Agent] -> Tools / Functions**, add these 4 Custom Tools:

#### Tool 1: `search_doctors`
- **URL:** `https://<YOUR_DEPLOYED_DOMAIN>/api/retell/tools/search-doctors`
- **Method:** `POST`
- **Description:** `Find active doctors and specialists by medical specialty.`
- **Schema:**
```json
{
  "type": "object",
  "properties": {
    "specialty": {
      "type": "string",
      "description": "Medical specialty such as Cardiology, Dermatology, General Medicine, Neurology"
    }
  }
}
```

#### Tool 2: `check_availability`
- **URL:** `https://<YOUR_DEPLOYED_DOMAIN>/api/retell/tools/check-availability`
- **Method:** `POST`
- **Description:** `Retrieve verified open slots for a doctor or specialty and date.`
- **Schema:**
```json
{
  "type": "object",
  "properties": {
    "doctor_id": {
      "type": "string",
      "description": "Assigned doctor ID if known"
    },
    "specialty": {
      "type": "string",
      "description": "Medical specialty"
    },
    "date": {
      "type": "string",
      "description": "Date in YYYY-MM-DD format (optional, defaults to upcoming slots)"
    }
  }
}
```

#### Tool 3: `book_appointment`
- **URL:** `https://<YOUR_DEPLOYED_DOMAIN>/api/retell/tools/book-appointment`
- **Method:** `POST`
- **Description:** `Atomically reserve an appointment slot. Requires explicit patient confirmation.`
- **Schema:**
```json
{
  "type": "object",
  "required": ["patient_name", "patient_phone", "doctor_id", "slot_id", "patient_confirmed"],
  "properties": {
    "patient_name": {
      "type": "string",
      "description": "Full patient name"
    },
    "patient_phone": {
      "type": "string",
      "description": "Patient contact telephone number"
    },
    "doctor_id": {
      "type": "string",
      "description": "Selected doctor ID"
    },
    "slot_id": {
      "type": "string",
      "description": "Selected slot ID"
    },
    "patient_confirmed": {
      "type": "boolean",
      "description": "Must be true. Explicit verbal confirmation from the patient is required before booking."
    },
    "notes": {
      "type": "string",
      "description": "Clinical notes or reason for visit"
    }
  }
}
```

#### Tool 4: `get_appointment`
- **URL:** `https://<YOUR_DEPLOYED_DOMAIN>/api/retell/tools/get-appointment`
- **Method:** `POST`
- **Description:** `Retrieve authoritative booking details by reference ID.`
- **Schema:**
```json
{
  "type": "object",
  "required": ["reference_id"],
  "properties": {
    "reference_id": {
      "type": "string",
      "description": "Booking reference code (e.g. 2C-10482)"
    }
  }
}
```

---

### 3. Webhook Configuration

In your Retell Agent settings:
- **Webhook URL:** `https://<YOUR_DEPLOYED_DOMAIN>/api/retell/webhook`
- **Events:** `call_started`, `call_ended`, `call_analyzed`
- **HMAC Verification:** The backend verifies incoming payloads using `x-retell-signature` and `RETELL_WEBHOOK_SECRET`.
- **Privacy Protection:** Patient phone numbers are automatically masked (`+1-***-***-2831`) before storing in the database.

---

### 4. Voice Agent System Prompt Guidance

When configuring your Retell agent prompt, include these instructions:
1. **Clarify Needs:** Ask for the patient's preferred specialty or doctor and date.
2. **Authoritative Slots:** Only offer slots returned by `check_availability`. Never invent times.
3. **Explicit Confirmation:** Read back the provider, date, time, and patient name before calling `book_appointment`. Pass `patient_confirmed: true` only after verbal agreement.
4. **Conflict Handling:** If `book_appointment` returns `status: "Conflict"`, inform the patient that the slot was just taken and offer the alternative times provided.
5. **Truthful Success:** Announce the reference number (e.g. `2C-XXXXX`) only after the tool returns `status: "Confirmed"`.
