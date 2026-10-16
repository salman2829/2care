import os
import re
import json
import time
import logging
import asyncio
import subprocess
import urllib.request
from typing import Optional, Dict, Any
from pathlib import Path

from app.config import settings

logger = logging.getLogger("2care-tunnel-sync")

STATE_FILE = Path(__file__).resolve().parent.parent.parent / "tunnel_state.json"
CLOUDFLARED_PATH = Path(__file__).resolve().parent.parent.parent / "cloudflared.exe"

# Global reference to running subprocess if started within this Python session
_cloudflared_process: Optional[subprocess.Popen] = None


def read_tunnel_state() -> Dict[str, Any]:
    """Read the latest persisted tunnel status."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read tunnel state: {e}")
    return {
        "is_running": False,
        "public_url": None,
        "is_reachable": False,
        "synced_with_retell": False,
        "last_synced": None,
        "pid": None,
        "error": None
    }


def write_tunnel_state(state: Dict[str, Any]):
    """Persist tunnel state to JSON file."""
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to write tunnel state: {e}")


def check_url_reachability(url: str, timeout: float = 6.0) -> bool:
    """Verify that the public tunnel URL is live and serving the 2care backend."""
    if not url:
        return False
    health_url = f"{url.rstrip('/')}/api/health"
    try:
        req = urllib.request.Request(
            health_url,
            headers={"User-Agent": "2care-tunnel-verifier/1.0"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                body = resp.read().decode("utf-8")
                return "2care" in body or "healthy" in body.lower() or "ok" in body.lower()
    except Exception as e:
        logger.debug(f"Tunnel reachability check failed for {health_url}: {e}")
        return False
    return False


def sync_urls_with_retell(public_url: str) -> Dict[str, Any]:
    """
    Update Retell AI Agent webhook and Retell LLM Custom Function tools
    with the current public tunnel URL.
    """
    api_key = settings.RETELL_API_KEY
    agent_id = settings.RETELL_AGENT_ID

    if not api_key or not agent_id:
        return {
            "success": False,
            "error": "RETELL_API_KEY or RETELL_AGENT_ID is not configured in backend/.env"
        }

    clean_url = public_url.rstrip("/")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # 1. Update Agent webhook URL
    webhook_url = f"{clean_url}/api/retell/webhook"
    try:
        agent_req = urllib.request.Request(
            f"https://api.retellai.com/update-agent/{agent_id}",
            data=json.dumps({"webhook_url": webhook_url}).encode("utf-8"),
            headers=headers,
            method="PATCH"
        )
        with urllib.request.urlopen(agent_req, timeout=10) as resp:
            agent_data = json.loads(resp.read().decode("utf-8"))
            logger.info(f"Retell agent {agent_id} webhook updated to {webhook_url}")
    except Exception as e:
        logger.error(f"Failed to update Retell agent webhook: {e}")
        return {"success": False, "error": f"Failed to update agent webhook: {e}"}

    # 2. Get LLM ID from agent if not known
    llm_id = None
    response_engine = agent_data.get("response_engine", {})
    if response_engine.get("type") == "retell-llm":
        llm_id = response_engine.get("llm_id")

    if not llm_id:
        # Fallback to fetching agent
        try:
            req = urllib.request.Request(
                f"https://api.retellai.com/get-agent/{agent_id}",
                headers=headers
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                llm_id = data.get("response_engine", {}).get("llm_id")
        except Exception as e:
            return {"success": False, "error": f"Failed to resolve LLM ID: {e}"}

    if not llm_id:
        return {"success": False, "error": "No retell-llm found on this Retell agent."}

    # 3. Retrieve LLM configuration
    try:
        get_llm_req = urllib.request.Request(
            f"https://api.retellai.com/get-retell-llm/{llm_id}",
            headers=headers
        )
        with urllib.request.urlopen(get_llm_req, timeout=10) as resp:
            llm_config = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch Retell LLM configuration: {e}"}

    # 4. Update tool URLs inside LLM general_tools
    general_tools = llm_config.get("general_tools", [])
    updated_tools = []
    
    tool_endpoint_map = {
        "search_doctors": f"{clean_url}/api/retell/tools/search-doctors",
        "check_availability": f"{clean_url}/api/retell/tools/check-availability",
        "book_appointment": f"{clean_url}/api/retell/tools/book-appointment",
        "get_appointment": f"{clean_url}/api/retell/tools/get-appointment"
    }

    found_tool_names = set()
    for tool in general_tools:
        t_name = tool.get("name")
        if t_name in tool_endpoint_map:
            found_tool_names.add(t_name)
            tool["url"] = tool_endpoint_map[t_name]
            tool["timeout_ms"] = 12000  # Fast 12s timeout for responsiveness
            tool["speak_during_execution"] = True
            if not tool.get("execution_message_description"):
                if t_name == "search_doctors":
                    tool["execution_message_description"] = "Let me find available doctors for you..."
                elif t_name == "check_availability":
                    tool["execution_message_description"] = "Let me check available appointment times..."
                elif t_name == "book_appointment":
                    tool["execution_message_description"] = "Confirming your appointment in the system..."
        updated_tools.append(tool)

    # If any tools were missing, add them
    if "search_doctors" not in found_tool_names:
        updated_tools.append({
            "type": "custom",
            "name": "search_doctors",
            "url": tool_endpoint_map["search_doctors"],
            "method": "POST",
            "description": "Find active doctors and specialists by medical specialty or name.",
            "speak_during_execution": True,
            "speak_after_execution": True,
            "execution_message_type": "prompt",
            "execution_message_description": "Let me find available specialists for you...",
            "timeout_ms": 12000,
            "parameter_type": "json",
            "parameters": {
                "type": "object",
                "properties": {
                    "specialty": {
                        "type": "string",
                        "description": "Medical specialty such as Cardiology, Dermatology, General Medicine, Neurology, Pediatrics, Orthopedics"
                    },
                    "call_id": {
                        "type": "string",
                        "description": "Active Retell call ID for server context linking"
                    }
                }
            }
        })

    if "check_availability" not in found_tool_names:
        updated_tools.append({
            "type": "custom",
            "name": "check_availability",
            "url": tool_endpoint_map["check_availability"],
            "method": "POST",
            "description": "Retrieve verified open appointment slots for a doctor, specialty, or date.",
            "speak_during_execution": True,
            "speak_after_execution": True,
            "execution_message_type": "prompt",
            "execution_message_description": "Let me check available times...",
            "timeout_ms": 12000,
            "parameter_type": "json",
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor_id": {"type": "string", "description": "Authoritative doctor ID (e.g. doc_maya_chen)"},
                    "specialty": {"type": "string", "description": "Medical specialty"},
                    "date": {"type": "string", "description": "Date in YYYY-MM-DD format (or 'today', 'tomorrow')"},
                    "call_id": {"type": "string", "description": "Active Retell call ID"}
                }
            }
        })

    if "book_appointment" not in found_tool_names:
        updated_tools.append({
            "type": "custom",
            "name": "book_appointment",
            "url": tool_endpoint_map["book_appointment"],
            "method": "POST",
            "description": "Atomically book an appointment slot. Requires explicit verbal patient confirmation.",
            "speak_during_execution": True,
            "speak_after_execution": True,
            "execution_message_type": "prompt",
            "execution_message_description": "Confirming your booking right now...",
            "timeout_ms": 12000,
            "parameter_type": "json",
            "parameters": {
                "type": "object",
                "required": ["patient_name", "doctor_id", "slot_id", "patient_confirmed"],
                "properties": {
                    "patient_name": {"type": "string", "description": "Full patient name. Ask caller if not known; never guess."},
                    "patient_phone": {"type": "string", "description": "Patient callback phone number"},
                    "doctor_id": {"type": "string", "description": "Selected doctor ID from search_doctors or check_availability"},
                    "slot_id": {"type": "string", "description": "Selected slot ID from check_availability"},
                    "patient_confirmed": {"type": "boolean", "description": "Must be true after patient explicitly agrees verbally to date, time, doctor, and patient name"},
                    "call_id": {"type": "string", "description": "Active Retell call ID for idempotency and state tracking"},
                    "notes": {"type": "string", "description": "Reason for visit or clinical notes"}
                }
            }
        })

    if "get_appointment" not in found_tool_names:
        updated_tools.append({
            "type": "custom",
            "name": "get_appointment",
            "url": tool_endpoint_map["get_appointment"],
            "method": "POST",
            "description": "Retrieve authoritative booking details by reference ID.",
            "speak_during_execution": True,
            "speak_after_execution": True,
            "execution_message_type": "prompt",
            "execution_message_description": "Looking up your appointment record...",
            "timeout_ms": 12000,
            "parameter_type": "json",
            "parameters": {
                "type": "object",
                "required": ["reference_id"],
                "properties": {
                    "reference_id": {"type": "string", "description": "Booking reference code (e.g. 2C-10482)"},
                    "call_id": {"type": "string", "description": "Active Retell call ID"}
                }
            }
        })

    # 5. Send PATCH update to Retell LLM with tools and tightened prompt
    tightened_prompt = (
        "You are the autonomous clinical appointment scheduling assistant for {{clinic_name}} "
        "(default: '2care Clinical Command Center').\n\n"
        "## DYNAMIC VARIABLES\n"
        "You have access to the following dynamic variables passed at call start:\n"
        "- {{patient_name}}: Full name of the patient. If this is empty, 'Valued Patient', or unknown, "
        "you MUST ask the caller for their full legal name before booking. NEVER GUESS OR INVENT A NAME.\n"
        "- {{patient_id}}: Patient medical record identifier if known.\n"
        "- {{patient_phone}}: Verified callback phone number. If missing, ask the caller for their telephone number.\n"
        "- {{selected_doctor_id}}: Pre-selected doctor ID (e.g. doc_maya_chen) if the user initiated the call from a specific doctor in the portal.\n"
        "- {{selected_doctor_name}}: Pre-selected doctor name.\n"
        "- {{selected_slot_id}}: Pre-selected appointment slot ID if initiated from a specific calendar slot.\n"
        "- {{selected_date}}: Pre-selected date.\n"
        "- {{clinic_name}}: The official facility name ('2care Clinical Command Center').\n\n"
        "## WORKFLOW RULES\n"
        "1. Clarify Needs & Identify Provider:\n"
        "   - If {{selected_doctor_name}} is provided, greet the patient and acknowledge their preferred provider.\n"
        "   - Otherwise, ask the caller what specialty or symptoms they need help with (Cardiology, Dermatology, General Medicine, Neurology, Pediatrics, Orthopedics).\n"
        "   - Use search_doctors to find active providers. Always use the canonical doctor_id returned by the tool.\n\n"
        "2. Verify Authoritative Availability:\n"
        "   - Use check_availability with doctor_id to retrieve open slots.\n"
        "   - Offer the patient 2-3 specific openings with date and time.\n"
        "   - NEVER invent or promise a time slot that was not returned by check_availability.\n\n"
        "3. Explicit Verbal Confirmation (MANDATORY):\n"
        "   - Before invoking book_appointment, you MUST verbally read back:\n"
        "     a) Doctor's full name and specialty\n"
        "     b) Exact appointment date and time\n"
        "     c) Patient's full name\n"
        "   - Ask clearly: 'Would you like me to go ahead and book this appointment for you?'\n"
        "   - Set patient_confirmed: true ONLY after the patient answers with clear verbal confirmation (e.g. 'Yes', 'Please do', 'That works').\n"
        "   - If the patient has not confirmed, do NOT book.\n\n"
        "4. Handling Missing Variables & Errors:\n"
        "   - If any required identifier is missing, ASK the caller. Never fabricate information.\n"
        "   - If book_appointment returns status 'Conflict', inform the caller calmly that the slot was just claimed and immediately offer the alternative slots returned.\n"
        "   - If book_appointment returns status 'MissingIdentifier', ask the caller for the missing detail.\n\n"
        "5. Closing & Reference Code:\n"
        "   - Announce the booking reference code (e.g. 2C-XXXXX) ONLY after book_appointment returns status 'Confirmed'.\n"
        "   - Thank the patient warmly for choosing {{clinic_name}}."
    )

    try:
        patch_payload = {
            "general_tools": updated_tools,
            "general_prompt": tightened_prompt
        }
        patch_req = urllib.request.Request(
            f"https://api.retellai.com/update-retell-llm/{llm_id}",
            data=json.dumps(patch_payload).encode("utf-8"),
            headers=headers,
            method="PATCH"
        )
        with urllib.request.urlopen(patch_req, timeout=12) as resp:
            updated_llm_res = json.loads(resp.read().decode("utf-8"))
            logger.info(f"Retell LLM {llm_id} tools & prompt successfully synced to {clean_url}")
    except Exception as e:
        logger.error(f"Failed to update Retell LLM tools: {e}")
        return {"success": False, "error": f"Failed to update Retell LLM tools: {e}"}

    return {
        "success": True,
        "agent_id": agent_id,
        "llm_id": llm_id,
        "public_url": clean_url,
        "webhook_url": webhook_url,
        "tools_updated": list(tool_endpoint_map.keys())
    }


def start_cloudflared_tunnel(local_port: int = 8000) -> Dict[str, Any]:
    """
    Launch cloudflared tunnel pointing to local backend,
    extract assigned trycloudflare.com URL, test reachability,
    and automatically update Retell Voice Agent.
    """
    global _cloudflared_process

    # First check if existing state is already live and reachable
    current_state = read_tunnel_state()
    if current_state.get("public_url") and check_url_reachability(current_state["public_url"]):
        logger.info(f"Active tunnel already responsive at {current_state['public_url']}")
        if not current_state.get("synced_with_retell"):
            sync_res = sync_urls_with_retell(current_state["public_url"])
            current_state["synced_with_retell"] = sync_res.get("success", False)
            current_state["last_synced"] = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
            write_tunnel_state(current_state)
        return current_state

    if not CLOUDFLARED_PATH.exists():
        err_msg = f"cloudflared.exe not found at {CLOUDFLARED_PATH}"
        logger.error(err_msg)
        return {"is_running": False, "error": err_msg}

    # Start new cloudflared process
    cmd = [
        str(CLOUDFLARED_PATH),
        "tunnel",
        "--url",
        f"http://127.0.0.1:{local_port}"
    ]

    # Start cloudflared detached process logging to tunnel.log
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP

    log_path = Path(__file__).resolve().parent.parent.parent / "tunnel.log"
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("")

    try:
        log_file = open(log_path, "a", encoding="utf-8")
        proc = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=creationflags
        )
        _cloudflared_process = proc
        logger.info(f"cloudflared detached process started (PID {proc.pid})")
    except Exception as e:
        logger.error(f"Failed to spawn cloudflared: {e}")
        return {"is_running": False, "error": str(e)}

    # Read output from tunnel.log until trycloudflare.com URL is printed
    tunnel_url = None
    start_time = time.time()
    while time.time() - start_time < 20:
        time.sleep(0.5)
        try:
            log_text = log_path.read_text(encoding="utf-8")
            m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", log_text)
            if m:
                tunnel_url = m.group(0)
                break
        except Exception:
            pass

    if not tunnel_url:
        logger.error("Timed out waiting for trycloudflare.com URL from cloudflared")
        return {"is_running": False, "error": "Cloudflare tunnel URL could not be resolved"}

    logger.info(f"Captured Cloudflare tunnel URL: {tunnel_url}")

    # Wait up to 10s for DNS propagation / reachability
    is_reachable = False
    for _ in range(10):
        if check_url_reachability(tunnel_url):
            is_reachable = True
            break
        time.sleep(1.0)

    # Sync with Retell AI
    retell_res = sync_urls_with_retell(tunnel_url)
    synced = retell_res.get("success", False)

    state = {
        "is_running": True,
        "pid": proc.pid,
        "public_url": tunnel_url,
        "is_reachable": is_reachable,
        "synced_with_retell": synced,
        "last_synced": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()) if synced else None,
        "error": None if is_reachable and synced else retell_res.get("error")
    }
    write_tunnel_state(state)
    return state
