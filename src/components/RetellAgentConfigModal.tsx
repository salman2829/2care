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
            description: "Medical specialty (Cardiology, Dermatology, General Medicine, Neurology, Pediatrics)",
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
          doctor_id: { type: "string", description: "Doctor ID or name" },
          specialty: { type: "string", description: "Medical specialty" },
          date: { type: "string", description: "Date in YYYY-MM-DD format (or 'today', 'tomorrow')" },
        },
      },
    },
    {
      name: "book_appointment",
      endpoint: `${domain}/api/retell/tools/book-appointment`,
      description: "Atomically book appointment slot. Enforces explicit patient confirmation.",
      parameters: {
        type: "object",
        required: ["patient_name", "patient_phone", "doctor_id", "slot_id", "patient_confirmed"],
        properties: {
          patient_name: { type: "string", description: "Full patient name" },
          patient_phone: { type: "string", description: "Patient telephone number" },
          doctor_id: { type: "string", description: "Selected doctor ID" },
          slot_id: { type: "string", description: "Selected slot ID" },
          patient_confirmed: { type: "boolean", description: "Explicit verbal confirmation from patient" },
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
        },
      },
    },
  ];

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
