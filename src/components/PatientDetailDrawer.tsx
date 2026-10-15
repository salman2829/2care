import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, User, Phone, Mail, Calendar, Clock, Stethoscope, Bot, Check,
  AlertCircle, Edit2, Save, FileText, ChevronRight, Sparkles, ShieldCheck,
  CalendarCheck, Headphones
} from "lucide-react";
import { patientService } from "../lib/services/patients";
import { PatientDetail } from "../lib/types";

interface PatientDetailDrawerProps {
  patientId: string | null;
  onClose: () => void;
  onPatientUpdated?: () => void;
  onSelectAppointment?: (id: string) => void;
}

export default function PatientDetailDrawer({
  patientId,
  onClose,
  onPatientUpdated,
  onSelectAppointment,
}: PatientDetailDrawerProps) {
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!patientId) {
      setPatient(null);
      setIsEditing(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);
      const res = await patientService.getPatient(patientId);
      setLoading(false);
      if (res.ok && res.data) {
        setPatient(res.data);
        setEditName(res.data.name);
        setEditPhone(res.data.phone);
        setEditEmail(res.data.email || "");
        setEditNotes(res.data.notes || "");
      } else {
        setError(res.error || "Failed to load patient record.");
      }
    };

    loadData();
  }, [patientId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;

    setSaving(true);
    setSaveSuccess(false);
    const res = await patientService.updatePatient(patient.id, {
      name: editName,
      phone: editPhone,
      email: editEmail,
      notes: editNotes,
    });
    setSaving(false);

    if (res.ok) {
      setSaveSuccess(true);
      setIsEditing(false);
      // Reload updated details
      const refreshed = await patientService.getPatient(editName || patient.id);
      if (refreshed.ok && refreshed.data) {
        setPatient(refreshed.data);
      }
      if (onPatientUpdated) onPatientUpdated();
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setError(res.error || "Failed to update patient record.");
    }
  };

  if (!patientId) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="drawer-panel"
          style={{ maxWidth: 560 }}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="drawer-head">
            <div>
              <span className="eyebrow">ELECTRONIC HEALTH RECORD</span>
              <h2>Patient Medical Chart</h2>
            </div>
            <button
              type="button"
              className="button button-ghost"
              onClick={onClose}
              aria-label="Close patient record"
            >
              <X size={18} />
            </button>
          </div>

          <div className="drawer-body">
            {loading ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
                Loading verified patient record...
              </div>
            ) : error ? (
              <div className="error-banner">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            ) : patient ? (
              <>
                {/* Hero Demographics Card */}
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 18,
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: 18,
                        }}
                      >
                        {patient.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                            {patient.name}
                          </h3>
                          <span className="badge badge-confirmed" style={{ fontSize: 10 }}>
                            <ShieldCheck size={11} /> {patient.mrn}
                          </span>
                        </div>
                        <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                          Primary Care: <strong>{patient.primary_doctor || "Dr. Maya Chen"}</strong> ({patient.primary_specialty || "Specialist"})
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      <Edit2 size={13} /> {isEditing ? "Cancel" : "Edit Details"}
                    </button>
                  </div>

                  {saveSuccess && (
                    <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#dcfce7", color: "#15803d", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      <Check size={14} /> Patient records updated successfully across all visits.
                    </div>
                  )}

                  {/* Edit Form */}
                  {isEditing ? (
                    <form onSubmit={handleSave} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Full Patient Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", marginTop: 4, fontSize: 13 }}
                          required
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Primary Phone</label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", marginTop: 4, fontSize: 13 }}
                            required
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Email Address</label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", marginTop: 4, fontSize: 13 }}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Clinical Record Notes</label>
                        <textarea
                          rows={2}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Allergies, chronic conditions, medical history..."
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", marginTop: 4, fontSize: 12 }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="button button-primary"
                        style={{ alignSelf: "flex-end", marginTop: 4 }}
                      >
                        <Save size={14} /> {saving ? "Saving Changes..." : "Save Patient Records"}
                      </button>
                    </form>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                      <div>
                        <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Phone</span>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <Phone size={12} className="text-teal-600" />
                          {patient.phone}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Email</span>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <Mail size={12} className="text-cyan-600" />
                          {patient.email || "Not specified"}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Status</span>
                        <div style={{ marginTop: 2 }}>
                          <span className="badge badge-live">
                            <i /> Active EHR
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4 Metrics Strip */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f1f5f9", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>Total Visits</span>
                    <strong style={{ display: "block", fontSize: 18, color: "#0f172a", marginTop: 4 }}>
                      {patient.total_appointments}
                    </strong>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f0fdf4", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "#15803d", textTransform: "uppercase" }}>Confirmed</span>
                    <strong style={{ display: "block", fontSize: 18, color: "#166534", marginTop: 4 }}>
                      {patient.confirmed_appointments}
                    </strong>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#fef3c7", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "#b45309", textTransform: "uppercase" }}>AI Voice</span>
                    <strong style={{ display: "block", fontSize: 18, color: "#92400e", marginTop: 4 }}>
                      {patient.voice_bookings}
                    </strong>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "#b91c1c", textTransform: "uppercase" }}>Cancelled</span>
                    <strong style={{ display: "block", fontSize: 18, color: "#991b1b", marginTop: 4 }}>
                      {patient.cancelled_appointments}
                    </strong>
                  </div>
                </div>

                {/* Patient Appointment Records */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <CalendarCheck size={16} className="text-cyan-600" />
                      Consultation History ({patient.appointments.length})
                    </h4>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {patient.appointments.map((apt) => {
                      const dt = apt.scheduled_at ? new Date(apt.scheduled_at) : null;
                      const timeStr = dt
                        ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                        : "";
                      const dateStr = dt
                        ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "TBD";

                      return (
                        <div
                          key={apt.id}
                          onClick={() => onSelectAppointment && onSelectAppointment(apt.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: "white",
                            border: "1px solid #e2e8f0",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <strong style={{ fontSize: 13, color: "#0284c7" }}>{apt.reference_id}</strong>
                              <span
                                className={`badge badge-${
                                  apt.status === "Confirmed"
                                    ? "confirmed"
                                    : apt.status === "Cancelled"
                                    ? "cancelled"
                                    : "pending"
                                }`}
                              >
                                {apt.status}
                              </span>
                              {apt.source === "AI Voice" && (
                                <span className="badge badge-ai">
                                  <Bot size={11} /> AI Voice
                                </span>
                              )}
                            </div>
                            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569" }}>
                              {apt.doctor_name || "Specialist"} · {apt.specialty}
                            </p>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <strong style={{ display: "block", fontSize: 12, color: "#0f172a" }}>
                              {dateStr}
                            </strong>
                            <small style={{ color: "#64748b", fontSize: 11 }}>{timeStr}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Linked Voice Telemetry & Calls */}
                {patient.calls && patient.calls.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <Headphones size={16} className="text-teal-600" />
                      Recorded Voice Consultations ({patient.calls.length})
                    </h4>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {patient.calls.map((c) => {
                        const dt = c.created_at ? new Date(c.created_at) : null;
                        const dateStr = dt ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                        const dur = `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s`;

                        return (
                          <div
                            key={c.id}
                            style={{
                              padding: 12,
                              borderRadius: 10,
                              background: "#0f172a",
                              color: "#f8fafc",
                              border: "1px solid #1e293b",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <strong style={{ fontSize: 12, color: "#38bdf8" }}>Call #{c.call_id}</strong>
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{dateStr} · {dur}</span>
                            </div>
                            {c.transcript && (
                              <p
                                style={{
                                  margin: "8px 0 0",
                                  fontSize: 11,
                                  color: "#cbd5e1",
                                  whiteSpace: "pre-wrap",
                                  maxHeight: 120,
                                  overflowY: "auto",
                                  lineHeight: 1.5,
                                  background: "#020617",
                                  padding: 8,
                                  borderRadius: 6,
                                }}
                              >
                                {c.transcript}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          <div className="drawer-foot">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
