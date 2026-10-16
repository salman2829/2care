import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Copy, Check, Terminal, Shield, ExternalLink, Bot, RefreshCw, Radio, CheckCircle2, AlertTriangle } from "lucide-react";
import { retellService, TunnelStatusResponse } from "../lib/services/retell";

interface RetellAgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RetellAgentConfigModal({ isOpen, onClose }: RetellAgentConfigModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [tunnel, setTunnel] = useState<TunnelStatusResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchTunnelStatus = async () => {
    try {
      const res = await retellService.getTunnelStatus();
      if (res.ok && res.data) {
        setTunnel(res.data);
      }
    } catch (e) {
      console.warn("Failed to fetch tunnel status:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTunnelStatus();
      const interval = setInterval(fetchTunnelStatus, 8000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleSyncTunnel = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await retellService.startTunnel();
      if (res.ok && res.data) {
        setTunnel(res.data);
        if (res.data.synced_with_retell) {
          setSyncMessage("Successfully synchronized all 4 tools & webhook with Retell AI!");
        } else {
          setSyncMessage(res.data.error || "Tunnel started but Retell sync reported an error.");
        }
      } else {
        setSyncMessage(res.error || "Failed to start tunnel.");
      }
    } catch (e: any) {
      setSyncMessage(e?.message || "Error syncing tunnel.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const domain = tunnel?.public_url || "https://your-domain.com";

  const schemas = [
    {
      name: "search_doctors",
      endpoint: `${domain}/api/retell/tools/search-doctors`,
      description: "Find active doctors and specialists by medical specialty or name (e.g. Cardiology, Dermatology).",
      parameters: {
        type: "object",
        properties: {
          specialty: {
            type: "string",
            description: "Medical specialty (Cardiology, Dermatology, General Medicine, Neurology, Pediatrics, Orthopedics)",
          },
          call_id: {
            type: "string",
            description: "Active Retell call ID for server context linking",
          },
        },
      },
    },
    {
      name: "check_availability",
      endpoint: `${domain}/api/retell/tools/check-availability`,
      description: "Retrieve real open slots for a doctor or specialty and date.",
      parameters: {
        type: "object",
        properties: {
          doctor_id: { type: "string", description: "Authoritative doctor ID (e.g. doc_maya_chen)" },
          specialty: { type: "string", description: "Medical specialty" },
          date: { type: "string", description: "Date in YYYY-MM-DD format (or 'today', 'tomorrow')" },
          call_id: { type: "string", description: "Active Retell call ID" },
        },
      },
    },
    {
      name: "book_appointment",
      endpoint: `${domain}/api/retell/tools/book-appointment`,
      description: "Atomically book appointment slot. Enforces explicit patient confirmation and idempotent replay.",
      parameters: {
        type: "object",
        required: ["patient_name", "doctor_id", "slot_id", "patient_confirmed"],
        properties: {
          patient_name: { type: "string", description: "Full patient name. Ask caller if not known; never guess." },
          patient_phone: { type: "string", description: "Patient contact telephone number" },
          doctor_id: { type: "string", description: "Selected doctor ID" },
          slot_id: { type: "string", description: "Selected slot ID from check_availability" },
          patient_confirmed: { type: "boolean", description: "Must be true after patient explicitly confirms verbally" },
          call_id: { type: "string", description: "Active Retell call ID for idempotency and server state" },
          notes: { type: "string", description: "Reason for visit or clinical notes" },
        },
      },
    },
    {
      name: "get_appointment",
      endpoint: `${domain}/api/retell/tools/get-appointment`,
      description: "Retrieve authoritative appointment details by reference ID.",
      parameters: {
        type: "object",
        required: ["reference_id"],
        properties: {
          reference_id: { type: "string", description: "Booking reference (e.g. 2C-10482)" },
          call_id: { type: "string", description: "Active Retell call ID" },
        },
      },
    },
  ];

  const tightenedPrompt = `You are the autonomous clinical appointment scheduling assistant for {{clinic_name}} (default: "2care Clinical Command Center").

## DYNAMIC VARIABLES
You have access to the following dynamic variables passed at call start:
- {{patient_name}}: Full name of the patient. If this is empty, "Valued Patient", or unknown, you MUST ask the caller for their full legal name before booking. NEVER GUESS OR INVENT A NAME.
- {{patient_id}}: Patient medical record identifier if known.
- {{patient_phone}}: Verified callback phone number. If missing, ask the caller for their telephone number.
- {{selected_doctor_id}}: Pre-selected doctor ID (e.g. doc_maya_chen) if the user initiated the call from a specific doctor in the portal.
- {{selected_doctor_name}}: Pre-selected doctor name.
- {{selected_slot_id}}: Pre-selected appointment slot ID if initiated from a specific calendar slot.
- {{selected_date}}: Pre-selected date.
- {{clinic_name}}: The official facility name ("2care Clinical Command Center").

## WORKFLOW RULES
1. Clarify Needs & Identify Provider:
   - If {{selected_doctor_name}} is provided, greet the patient and acknowledge their preferred provider.
   - Otherwise, ask the caller what specialty or symptoms they need help with (Cardiology, Dermatology, General Medicine, Neurology, Pediatrics, Orthopedics).
   - Use search_doctors to find active providers. Always use the canonical doctor_id returned by the tool.

2. Verify Authoritative Availability:
   - Use check_availability with doctor_id to retrieve open slots.
   - Offer the patient 2-3 specific openings with date and time.
   - NEVER invent or promise a time slot that was not returned by check_availability.

3. Explicit Verbal Confirmation (MANDATORY):
   - Before invoking book_appointment, you MUST verbally read back:
     a) Doctor's full name and specialty
     b) Exact appointment date and time
     c) Patient's full name
   - Ask clearly: "Would you like me to go ahead and book this appointment for you?"
   - Set patient_confirmed: true ONLY after the patient answers with clear verbal confirmation (e.g. "Yes", "Please do", "That works").
   - If the patient has not confirmed, do NOT book.

4. Handling Missing Variables & Errors:
   - If any required identifier is missing, ASK the caller. Never fabricate information.
   - If book_appointment returns status "Conflict", inform the caller calmly that the slot was just claimed and immediately offer the alternative slots returned.
   - If book_appointment returns status "MissingIdentifier", ask the caller for the missing detail.

5. Closing & Reference Code:
   - Announce the booking reference code (e.g. 2C-XXXXX) ONLY after book_appointment returns status "Confirmed".
   - Thank the patient warmly for choosing {{clinic_name}}.`;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal-box"
          style={{ maxWidth: 680 }}
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <span className="eyebrow">VOICE SCHEDULING INFRASTRUCTURE</span>
              <h2>Retell AI Custom Functions Integration</h2>
            </div>
            <button type="button" className="button button-ghost" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="modal-body" style={{ maxHeight: "75vh" }}>
            {/* Live Tunnel Status Card */}
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: tunnel?.synced_with_retell ? "#f0fdf4" : "#fefce8",
                border: tunnel?.synced_with_retell ? "1px solid #bbf7d0" : "1px solid #fef08a",
                color: tunnel?.synced_with_retell ? "#166534" : "#854d0e",
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  {tunnel?.synced_with_retell ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      Live Retell Voice Tunnel: Connected & Synchronized
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={16} className="text-amber-600" />
                      Retell Voice Tunnel Status: Needs Sync
                    </>
                  )}
                </strong>

                <button
                  type="button"
                  onClick={handleSyncTunnel}
                  disabled={isSyncing}
                  className="button button-secondary"
                  style={{
                    minHeight: 28,
                    padding: "0 10px",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                  {isSyncing ? "Syncing..." : "Sync Tunnel Now"}
                </button>
              </div>

              <div style={{ fontSize: 11, color: "#334155", background: "rgba(255,255,255,0.7)", padding: "8px 10px", borderRadius: 8 }}>
                <div>
                  <strong>Active Public Endpoint:</strong>{" "}
                  <code style={{ color: "#0284c7", fontWeight: 600 }}>{tunnel?.public_url || "Auto-detecting..."}</code>
                </div>
                {tunnel?.last_synced && (
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                    Last verified sync with Retell AI: {tunnel.last_synced}
                  </div>
                )}
              </div>

              {syncMessage && (
                <div style={{ fontSize: 11, fontWeight: 500, color: syncMessage.includes("Successfully") ? "#15803d" : "#b91c1c" }}>
                  {syncMessage}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {schemas.map((tool) => (
                <div
                  key={tool.name}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyItems: "space-between", justifyContent: "space-between", marginBottom: 6 }}>
                    <div>
                      <strong style={{ color: "#0284c7", fontSize: 12 }}>{tool.name}</strong>
                      <span style={{ fontSize: 9, color: "#64748b", marginLeft: 8 }}>{tool.endpoint}</span>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ minHeight: 24, padding: "0 8px", fontSize: 9 }}
                      onClick={() => copyToClipboard(JSON.stringify(tool, null, 2), tool.name)}
                    >
                      {copiedKey === tool.name ? (
                        <>
                          <Check size={11} /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={11} /> Copy Schema
                        </>
                      )}
                    </button>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 10, color: "#475569" }}>{tool.description}</p>
                  <pre
                    style={{
                      background: "#0b1320",
                      color: "#94a3b8",
                      padding: 8,
                      borderRadius: 6,
                      fontSize: 9,
                      overflowX: "auto",
                      fontFamily: "ui-monospace, monospace",
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <strong style={{ color: "#0f172a", fontSize: 12 }}>Tightened Retell System Prompt</strong>
                  <span style={{ fontSize: 9, color: "#64748b", marginLeft: 8 }}>Enforces Dynamic Variables & Verbal Confirmation</span>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ minHeight: 24, padding: "0 8px", fontSize: 9 }}
                  onClick={() => copyToClipboard(tightenedPrompt, "system_prompt")}
                >
                  {copiedKey === "system_prompt" ? (
                    <>
                      <Check size={11} /> Copied Prompt
                    </>
                  ) : (
                    <>
                      <Copy size={11} /> Copy Prompt
                    </>
                  )}
                </button>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 10, color: "#475569" }}>
                Paste into your Retell Agent's <strong>General Prompt</strong> to instruct the LLM on available dynamic variables, strict verbal confirmation, and error recovery.
              </p>
              <pre
                style={{
                  background: "#0b1320",
                  color: "#94a3b8",
                  padding: 8,
                  borderRadius: 6,
                  fontSize: 9,
                  maxHeight: 140,
                  overflowY: "auto",
                  fontFamily: "ui-monospace, monospace",
                  margin: 0,
                  whiteSpace: "pre-wrap"
                }}
              >
                {tightenedPrompt}
              </pre>
            </div>

            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#334155" }}>Webhook Endpoint</span>
              <p style={{ margin: "3px 0 0", fontSize: 10, color: "#64748b" }}>
                In Retell dashboard, set Webhook URL to: <code>https://your-domain.com/api/retell/webhook</code>
              </p>
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
