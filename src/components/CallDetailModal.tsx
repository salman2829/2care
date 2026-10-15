import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Phone, Clock, Bot, Check, ShieldCheck, Terminal, Calendar } from "lucide-react";
import { CallLogItem } from "../lib/services/retell";

interface CallDetailModalProps {
  call: CallLogItem | null;
  onClose: () => void;
}

export default function CallDetailModal({ call, onClose }: CallDetailModalProps) {
  if (!call) return null;

  let toolCalls: any[] = [];
  if (call.tool_calls_log) {
    try {
      toolCalls = typeof call.tool_calls_log === "string"
        ? JSON.parse(call.tool_calls_log)
        : call.tool_calls_log;
    } catch (e) {
      toolCalls = [{ raw: call.tool_calls_log }];
    }
  }

  const dt = new Date(call.created_at);
  const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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
          style={{ maxWidth: 620 }}
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <span className="eyebrow">RETELL VOICE TELEMETRY</span>
              <h2>Call #{call.call_id}</h2>
            </div>
            <button type="button" className="button button-ghost" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="modal-body" style={{ maxHeight: "75vh" }}>
            {/* Call Meta Banner */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                padding: 14,
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <div>
                <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase" }}>Caller Phone</span>
                <strong style={{ display: "block", fontSize: 11, marginTop: 3 }}>
                  {call.caller_phone || "Protected / Anonymous"}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase" }}>Duration</span>
                <strong style={{ display: "block", fontSize: 11, marginTop: 3 }}>
                  {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase" }}>Status</span>
                <span className={`badge badge-${call.status === "completed" ? "confirmed" : "pending"}`} style={{ marginTop: 3 }}>
                  <i /> {call.status}
                </span>
              </div>
            </div>

            {/* Linked Appointment */}
            {call.appointment_id && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 9,
                  background: "#e6f7fa",
                  border: "1px solid #c7f0f6",
                  color: "#0e7490",
                  fontSize: 11,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600 }}>
                  <Check size={15} /> Booked Reference: {call.appointment_id}
                </span>
                <span style={{ fontSize: 9, background: "white", padding: "3px 7px", borderRadius: 5 }}>
                  Verified in DB
                </span>
              </div>
            )}

            {/* Tool Executions */}
            {toolCalls && toolCalls.length > 0 && (
              <div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#334155",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 8,
                  }}
                >
                  <Terminal size={14} /> Backend Tool Execution Log ({toolCalls.length})
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {toolCalls.map((t, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: "#0b1320",
                        color: "#94a3b8",
                        fontSize: 10,
                        fontFamily: "ui-monospace, monospace",
                        border: "1px solid #1e293b",
                      }}
                    >
                      <div style={{ color: "#38bdf8", fontWeight: 700, marginBottom: 4 }}>
                        &gt; {t.tool || "custom_function"}({JSON.stringify(t.args || t.input || {})})
                      </div>
                      <div style={{ color: "#a7f3d0" }}>
                        &lt; {typeof t.result === "string" ? t.result : JSON.stringify(t.result || t.output || "")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full Transcript */}
            <div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#334155",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 8,
                }}
              >
                <Bot size={14} /> Voice Conversation Transcript
              </span>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: "#1e293b",
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                }}
              >
                {call.transcript || "No transcript recorded for this call."}
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
