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

When configuring your Retell agent prompt, use the tightened system prompt below (also copyable directly from the admin dashboard modal):

```text
You are 2care's authoritative healthcare appointment scheduling assistant.

1. Verified Context Variables:
   - When the call starts, you may receive verified context via Retell dynamic variables:
     * {{patient_name}} - Caller's verified name (do NOT ask again if provided)
     * {{patient_phone}} - Caller's contact number
     * {{selected_doctor_id}} & {{selected_doctor_name}} - Doctor chosen in portal
     * {{selected_slot_id}} - Specific appointment slot chosen in portal
     * {{clinic_name}} - 2care Clinical Command Center
   - ALWAYS pass "call_id": "{{call_id}}" in EVERY tool call so the server maintains your conversation state.
   - If a variable is missing or unknown, ask the caller directly. NEVER guess or invent doctor IDs, slot IDs, or patient information.

2. Provider Search & Open Slot Inquiries:
   - Use search_doctors to look up verified specialists by medical specialty or symptoms.
   - Use check_availability with doctor_id or specialty to retrieve open slots.
   - ONLY offer appointment slots returned by check_availability. Never invent dates or times.

3. Mandatory Verbal Confirmation:
   - BEFORE calling book_appointment, you MUST verbally read back the complete appointment details to the caller:
     "Just to confirm, would you like me to book your appointment with Dr. [Name] on [Day, Date] at [Time] for [Patient Name]?"
   - Only call book_appointment with patient_confirmed: true AFTER the caller explicitly confirms.

4. Resilient Error Recovery:
   - If book_appointment returns status "Conflict", inform the caller that the slot was just taken and immediately offer the alternatives returned by the tool.
   - If book_appointment returns status "MissingIdentifier", ask the caller for the missing detail.
   - If the caller changes their mind mid-call (e.g. switches from Cardiology to Dermatology), acknowledge the change, call search_doctors / check_availability for the new specialty, and obtain fresh verbal confirmation.

5. Closing & Reference Code:
   - Announce the booking reference code (e.g. 2C-XXXXX) ONLY after book_appointment returns status "Confirmed".
   - Thank the patient warmly for choosing {{clinic_name}}.
```

---

## Complete Context Flow Architecture: UI -> Retell AI -> Backend -> Database

```
+--------------------------------------------------------------------------------------------------+
|                                1. PORTAL CONTEXT INITIATION                                      |
|  User selects Doctor/Slot in UI -> Frontend gathers known facts -> Calls /retell/create-web-call  |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                               2. RETELL DYNAMIC VARIABLES INJECTION                              |
|  FastAPI calls Retell API (retell_llm_dynamic_variables):                                        |
|  { patient_name, patient_phone, selected_doctor_id, selected_slot_id, clinic_name, call_id }     |
|  Simultaneously creates authoritative backend CallState record keyed by call_id                  |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                               3. DUAL-ANCHORED STATE CONVERSATION                                |
|  Retell Voice LLM engages caller. On every tool call, Retell passes call_id & validated IDs.    |
|  If LLM omits an ID, server recovers it from CallState (chosen_doctor_id, chosen_slot_id).        |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                            4. TRANSACTIONAL VALIDATION & IDEMPOTENCY                             |
|  - Validates: doctor exists, slot belongs to doctor, slot is open, patient confirmed.            |
|  - Concurrency Lock: SELECT FOR UPDATE / Atomic SQLite transactional lock.                       |
|  - Idempotency: Repeated tool calls return existing 2C-XXXXX booking without duplicate.          |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                               5. FORENSIC AUDITING & TRANSCRIPTS                                 |
|  - Every tool execution, args, response, and dynamic variables logged to CallLog & CallState.    |
|  - GET /retell/calls/{call_id}/audit inspects complete turn history for forensic debugging.       |
|  - Dashboard reflects verified database appointments in real time.                              |
+--------------------------------------------------------------------------------------------------+
```

### Dynamic Variables Contract

| Variable Key | Type | Source | Purpose |
| :--- | :--- | :--- | :--- |
| `call_id` | `string` | Retell SDK / Backend | Unique call session correlation key across all turns |
| `patient_name` | `string` | Customer Portal / Form | Pre-verified caller identity (prevents redundant asking) |
| `patient_phone` | `string` | Customer Portal / Form | Caller contact phone (masked in audit logs) |
| `patient_id` | `string` | Patient Database | Existing patient record ID if registered |
| `selected_doctor_id` | `string` | UI Selection / State | Authoritative Doctor ID (e.g. `doc_maya_chen`) |
| `selected_doctor_name` | `string` | UI Selection / State | Provider display name (e.g. `Dr. Maya Chen`) |
| `selected_slot_id` | `string` | UI Slot Grid / State | Specific slot ID chosen prior to call start |
| `clinic_name` | `string` | System Config | "2care Clinical Command Center" |

---

## Server-Side Conversation State (`CallState`)

Conversation state is persisted in the PostgreSQL/SQLite table `call_states` keyed by `call_id`:

- `chosen_doctor_id` & `chosen_doctor_name`: Current provider selected across turns.
- `chosen_specialty`: Current specialty (updated when caller changes their mind).
- `chosen_slot_id` & `chosen_slot_time`: Slot offered and held during availability checks.
- `booking_status`: `inquiry` -> `slot_offered` -> `pending_confirmation` -> `booked` / `conflict`.
- `booking_reference_id`: Confirmed booking reference (e.g. `2C-10482`).
- `dynamic_variables`: JSON snapshot of variables passed at call start.
- `context_history`: JSON event log of every turn transition with ISO timestamps.

---

## Concurrency Safety & Idempotent Tool Calls

1. **Transactional Slot Claiming:** Booking operations wrap slot reservation in an atomic transaction (`is_booked = True`, `Appointment` created with unique `reference_id`).
2. **Race Condition Prevention:** If two callers attempt to book the same slot simultaneously, the second transaction catches `SlotConflictError`, logs a `conflict` event, and returns actionable alternatives.
3. **Idempotency on Repeated Tool Calls:** If the voice agent retries `book_appointment` or network latency causes duplicate payloads, the backend checks if `state.booking_status == "booked"` for the same caller and slot. It returns the existing `2C-XXXXX` confirmation code without duplicate database inserts or conflicts.
4. **Verbal Confirmation Enforcement:** If `patient_confirmed: false`, booking is blocked with error code `CONFIRMATION_REQUIRED`, state transitions to `pending_confirmation`, and the LLM is instructed to obtain verbal consent.

---

## Multi-Turn Evaluation Harness (Part B)

The evaluation suite (`backend/tests/test_multi_turn_evals.py`) runs 6 deterministic, multi-turn conversational scenarios:

1. **Caller Changes Mind Mid-Call:** Starts with Cardiology (Dr. Maya Chen), checks availability, switches to Dermatology (Dr. Elias Reed), and books with the dermatologist. Asserts final booking and server state match the dermatologist.
2. **Details Given Out of Order:** Caller requests "tomorrow" before naming any doctor or symptoms. System provides openings without crashing, recovers doctor preference in turn 2, and completes booking.
3. **Interruption & Repetition:** Caller checks slots, interrupts to look up an existing reference `2C-10482`, then asks the agent to repeat available times without repeating the doctor ID. Server state seamlessly recovers `chosen_doctor_id`.
4. **Idempotency on Duplicate Booking Calls:** Agent sends identical `book_appointment` payloads twice consecutively. Both succeed with status `Confirmed` and return the same reference ID.
5. **Strict Identifier Validation & Error Recovery:** Asserts that omitting `slot_id` produces `MISSING_SLOT_ID`, doctor/slot mismatch produces `DOCTOR_SLOT_MISMATCH`, and unconfirmed requests produce `CONFIRMATION_REQUIRED`.
6. **Multi-Run Consistency Loop:** Executes 5 multi-turn booking flows sequentially, asserting 100% pass rate with zero nondeterministic flakiness.

### Running Test Suites

```powershell
# Run complete test suite (25 tests)
backend\.venv\Scripts\pytest -v backend/tests

# Run multi-turn evaluation harness specifically
backend\.venv\Scripts\pytest -v backend/tests/test_multi_turn_evals.py
```

---

## Live Technical Review: Explaining Context Flow to Reviewers

When presenting live to the reviewer, structure your explanation with these 4 pillars:

1. **Explicit Injection at Call Start:**
   *"We do not rely on the LLM to remember or guess context. When the user initiates a call from the 2care portal, `/retell/create-web-call` injects `selected_doctor_id`, `selected_slot_id`, and `patient_name` directly into Retell's `retell_llm_dynamic_variables` and simultaneously initializes a durable `CallState` in our database keyed by `call_id`."*

2. **Server-Side State Machine Keyed by `call_id`:**
   *"Every tool call carries `call_id`. Our custom service inspects `call_states` on each turn. If the LLM omits an identifier or repeats a request out-of-order, our server state recovers the authoritative doctor or slot, preventing hallucinations."*

3. **Strict Validation & Actionable Error Codes:**
   *"We enforce a strict tool contract. If a doctor or slot ID is missing, mismatched, or unconfirmed, our backend returns structured error codes (`MISSING_SLOT_ID`, `DOCTOR_SLOT_MISMATCH`, `CONFIRMATION_REQUIRED`) with natural conversational prompts that instruct the agent how to recover gracefully."*

4. **Idempotency & Forensic Auditability:**
   *"To prevent duplicate bookings from network retries or LLM re-invocations, `book_appointment` is fully idempotent. Every tool payload, response, and dynamic variable set is recorded in `call_logs` and can be inspected live via `GET /retell/calls/{call_id}/audit` or through the dashboard's audit inspector."*

