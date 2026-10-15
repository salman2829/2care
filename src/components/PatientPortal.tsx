import React, { useState, useMemo } from "react";
import { 
  Calendar, Clock, User, Stethoscope, PhoneCall, Search, 
  CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, MapPin, 
  CalendarCheck, Sparkles, X, ChevronRight, RefreshCw, Eye,
  Bot, Zap, HeartPulse, Filter, UserCheck, Activity
} from "lucide-react";
import { Appointment, Doctor, PatientSummary } from "../lib/types";

interface PatientPortalProps {
  appointments: Appointment[];
  doctors: Doctor[];
  onStartVoiceCall: () => void;
  onRefresh: () => void;
  onCancelAppointment?: (id: string) => void;
  onSelectAppointment?: (id: string) => void;
  isLive?: boolean;
  currentPatientName?: string;
  onSwitchPatient?: (patientName: string) => void;
  availablePatients?: PatientSummary[];
}

const sparks = [
  "M1 25 C12 22 14 10 25 14 S39 21 48 9 S66 13 78 4",
  "M1 21 C10 22 15 8 25 13 S42 18 50 7 S67 5 78 3",
  "M1 23 C12 25 13 15 24 16 S38 8 49 12 S67 7 78 5",
  "M1 22 C13 17 17 21 27 12 S42 17 51 8 S68 11 78 3",
];

const toneColorMap = ["cyan", "mint", "violet", "orange"] as const;

export default function PatientPortal({
  appointments,
  doctors,
  onStartVoiceCall,
  onRefresh,
  onCancelAppointment,
  onSelectAppointment,
  isLive = true,
  currentPatientName = "Mohammad Salman",
  onSwitchPatient,
  availablePatients = []
}: PatientPortalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "confirmed" | "voice">("all");
  const [viewScope, setViewScope] = useState<"all" | "patient">(() => {
    if (!currentPatientName || currentPatientName.toLowerCase() === "all") return "all";
    return "patient";
  });
  const [latestBooking, setLatestBooking] = useState<any>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("2care_latest_booking");
        if (stored) return JSON.parse(stored);
      } catch (e) {}
    }
    return null;
  });

  // Listen for real-time booking events across tabs & voice call sessions
  React.useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "2care_latest_booking" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setLatestBooking(parsed);
        } catch (err) {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Filter appointments according to selected scope
  const activePatientAppointments = useMemo(() => {
    if (viewScope === "all" || !currentPatientName || currentPatientName.toLowerCase() === "all") {
      return appointments;
    }
    const target = currentPatientName.toLowerCase().trim();
    const filtered = appointments.filter((apt) => {
      const pName = apt.patient_name.toLowerCase().trim();
      return pName.includes(target) || target.includes(pName);
    });
    return filtered.length > 0 ? filtered : appointments;
  }, [appointments, currentPatientName, viewScope]);

  const patientAppointments = useMemo(() => {
    return activePatientAppointments.filter((apt) => {
      // Type filter
      if (filterType === "confirmed" && apt.status !== "Confirmed") return false;
      if (filterType === "voice" && apt.source !== "AI Voice") return false;

      // Query search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        apt.patient_name.toLowerCase().includes(q) ||
        (apt.patient_phone && apt.patient_phone.toLowerCase().includes(q)) ||
        apt.reference_id.toLowerCase().includes(q) ||
        (apt.doctor_name && apt.doctor_name.toLowerCase().includes(q)) ||
        (apt.specialty && apt.specialty.toLowerCase().includes(q))
      );
    });
  }, [activePatientAppointments, filterType, searchQuery]);

  const confirmedCount = useMemo(() => {
    return activePatientAppointments.filter((a) => a.status === "Confirmed").length;
  }, [activePatientAppointments]);

  const voiceBookedCount = useMemo(() => {
    return activePatientAppointments.filter((a) => a.source === "AI Voice").length;
  }, [activePatientAppointments]);

  return (
    <div className="page-stack">

      {/* 2. Hero Welcome */}
      <section className="welcome">
        <div>
          <span className="badge badge-live">
            <i /> 24/7 AI Autonomous Patient Care
          </span>
          <h1>Healthcare, intelligently coordinated.</h1>
          <p>
            Review your upcoming consultations, check verified EHR booking records, or talk directly with our voice agent to schedule your next visit in seconds.
          </p>
        </div>
        <div className="welcome-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={onStartVoiceCall}
          >
            <PhoneCall size={14} />
            <span>Talk to Voice Assistant</span>
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onRefresh}
          >
            <RefreshCw size={14} />
            <span>Refresh Schedule</span>
          </button>
        </div>
      </section>

      {/* 3. Standard 4-Metric Command Center Cards with Sparklines */}
      <section className="metrics-grid">
        {/* Metric 1: My Appointments */}
        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon cyan">
              <CalendarCheck size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Live data
            </span>
          </div>
          <div className="metric-body">
            <span>My appointments</span>
            <strong>{activePatientAppointments.length}</strong>
            <small>
              <b>+{activePatientAppointments.length > 0 ? "100%" : "0%"}</b> active in clinical system
            </small>
          </div>
          <svg viewBox="0 0 80 30" className="spark cyan" aria-hidden="true">
            <path d={`${sparks[0]} L78 30 L1 30 Z`} className="spark-fill" />
            <path d={sparks[0]} className="spark-line" />
          </svg>
        </article>

        {/* Metric 2: Confirmed Appointments */}
        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon mint">
              <CheckCircle2 size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Verified EHR
            </span>
          </div>
          <div className="metric-body">
            <span>Confirmed visits</span>
            <strong>{confirmedCount}</strong>
            <small>
              <b>{confirmedCount}</b> ready for consultation
            </small>
          </div>
          <svg viewBox="0 0 80 30" className="spark mint" aria-hidden="true">
            <path d={`${sparks[1]} L78 30 L1 30 Z`} className="spark-fill" />
            <path d={sparks[1]} className="spark-line" />
          </svg>
        </article>

        {/* Metric 3: Active Specialists */}
        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon violet">
              <Stethoscope size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Available
            </span>
          </div>
          <div className="metric-body">
            <span>Medical specialists</span>
            <strong>{doctors.length}</strong>
            <small>
              <b>Cardiology, Derm</b> & General
            </small>
          </div>
          <svg viewBox="0 0 80 30" className="spark violet" aria-hidden="true">
            <path d={`${sparks[2]} L78 30 L1 30 Z`} className="spark-fill" />
            <path d={sparks[2]} className="spark-line" />
          </svg>
        </article>

        {/* Metric 4: AI Voice Booking */}
        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon orange">
              <Sparkles size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Voice Agent
            </span>
          </div>
          <div className="metric-body">
            <span>AI voice bookings</span>
            <strong>{voiceBookedCount}</strong>
            <small>
              <b>24/7</b> autonomous scheduling
            </small>
          </div>
          <svg viewBox="0 0 80 30" className="spark orange" aria-hidden="true">
            <path d={`${sparks[3]} L78 30 L1 30 Z`} className="spark-fill" />
            <path d={sparks[3]} className="spark-line" />
          </svg>
        </article>
      </section>

      {/* 3. Standard Deep Navy 3D Voice Intelligence Card */}
      <section className="voice-card">
        <div className="voice-noise" />
        <div className="voice-copy">
          <div className="section-label">
            <Sparkles size={14} /> LIVE VOICE INTELLIGENCE
          </div>
          <div className="voice-title">
            <div>
              <h2>2care Scheduling Agent</h2>
              <p>Autonomous appointment coordination with Retell AI voice intelligence</p>
            </div>
            <span className="badge badge-live">
              <i /> Agent ready
            </span>
          </div>
          <div className="voice-stats">
            <div>
              <span>Available care</span>
              <strong>{doctors.length} Doctors</strong>
            </div>
            <div>
              <span>Avg. booking</span>
              <strong>45 seconds</strong>
            </div>
            <div>
              <span>Confirmation</span>
              <strong>Instant Ref #</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Online & Ready</strong>
            </div>
          </div>
          <div className="voice-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={onStartVoiceCall}
            >
              <PhoneCall size={15} />
              <span>Talk to Voice Assistant to Book</span>
            </button>
            <button
              type="button"
              className="button button-dark"
              onClick={() => {
                const el = document.getElementById("patient-appointments-panel");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <CalendarCheck size={15} />
              <span>View My Appointments</span>
            </button>
          </div>
          <p className="voice-note">
            <ShieldCheck size={13} /> Voice booking agent wired to authoritative appointment database
          </p>
        </div>

        {/* 3D Voice Bot Orb with Orbit Rings */}
        <div className="orb-wrap" aria-label="Autonomous voice assistant ready">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="orb-glow" />
          <div className="orb">
            <Bot size={32} />
          </div>
          <div className="sound-bars">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <i key={n} />
            ))}
          </div>
          <span className="float-chip chip-one">
            <Zap size={12} /> 24ms
          </span>
          <span className="float-chip chip-two">EN-US</span>
        </div>
      </section>

      {/* 4. Appointments Table Panel in Admin Theme */}
      <section id="patient-appointments-panel" className="panel table-panel">
        {/* Real-time Confirmed Booking Banner */}
        {latestBooking && (
          <div
            style={{
              margin: "16px 20px 0 20px",
              padding: "16px 20px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.1))",
              border: "1.5px solid rgba(16, 185, 129, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              boxShadow: "0 4px 16px rgba(16, 185, 129, 0.12)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "10px",
                  background: "#10b981",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)"
                }}
              >
                <CheckCircle2 size={24} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "#059669", textTransform: "uppercase" }}>
                    Verified Consultation Confirmed
                  </span>
                  <span className="badge badge-confirmed" style={{ fontSize: "11px", padding: "2px 8px" }}>
                    <CheckCircle2 size={11} /> {latestBooking.status || "Confirmed"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Booking Ref: <strong style={{ color: "var(--foreground)" }}>{latestBooking.reference_id}</strong>
                  </span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", marginTop: "3px" }}>
                  {latestBooking.patient_name} &bull; {latestBooking.doctor_name || "Specialist"} ({latestBooking.specialty || "Clinical Provider"})
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span>
                    <Clock size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
                    {latestBooking.scheduled_at
                      ? new Date(latestBooking.scheduled_at).toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "Scheduled visit"}
                  </span>
                  <span>&bull; Intake Channel: <strong style={{ color: "#0d9488" }}>{latestBooking.source || "AI Voice Assistant"}</strong></span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {onSelectAppointment && latestBooking.id && (
                <button
                  type="button"
                  className="button button-primary small-button"
                  onClick={() => onSelectAppointment(latestBooking.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Eye size={14} />
                  <span>View Booking Details</span>
                </button>
              )}
              <button
                type="button"
                className="button button-ghost small-button"
                onClick={() => {
                  setLatestBooking(null);
                  try {
                    localStorage.removeItem("2care_latest_booking");
                  } catch (e) {}
                }}
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        <div className="table-heading panel-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span className="eyebrow">YOUR SCHEDULED VISITS</span>
            <h2>Active Appointments</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                Authoritative clinic reservations synchronized in real time
              </p>
              {/* Patient Scope Selector */}
              <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.05)", borderRadius: "8px", padding: "2px" }}>
                <button
                  type="button"
                  className={`button ${viewScope === "all" ? "button-primary" : "button-ghost"} small-button`}
                  onClick={() => setViewScope("all")}
                  style={{ padding: "4px 10px", fontSize: "11px", height: "26px" }}
                >
                  <Users size={12} />
                  <span>All Clinic Bookings ({appointments.length})</span>
                </button>
                <button
                  type="button"
                  className={`button ${viewScope === "patient" ? "button-primary" : "button-ghost"} small-button`}
                  onClick={() => setViewScope("patient")}
                  style={{ padding: "4px 10px", fontSize: "11px", height: "26px" }}
                >
                  <User size={12} />
                  <span>
                    My Records ({currentPatientName && currentPatientName.toLowerCase() !== "all" ? currentPatientName : "Filtered"})
                  </span>
                </button>
              </div>

              {availablePatients && availablePatients.length > 0 && (
                <select
                  value={currentPatientName || "All"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (onSwitchPatient) onSwitchPatient(val);
                    if (val === "All") setViewScope("all");
                    else setViewScope("patient");
                  }}
                  className="patient-select-input"
                  title="Switch patient record view"
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "white",
                    color: "#0f172a",
                    height: "26px",
                    fontWeight: 600
                  }}
                >
                  <option value="All">All Patients ({appointments.length} Total Bookings)</option>
                  {availablePatients.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.total_appointments} visits)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="table-tools" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`button ${filterType === "all" ? "button-primary" : "button-secondary"} small-button`}
              >
                All ({activePatientAppointments.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("confirmed")}
                className={`button ${filterType === "confirmed" ? "button-primary" : "button-secondary"} small-button`}
              >
                Confirmed ({confirmedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("voice")}
                className={`button ${filterType === "voice" ? "button-primary" : "button-secondary"} small-button`}
              >
                AI Voice ({voiceBookedCount})
              </button>
            </div>

            {/* Table Search */}
            <div className="table-search" style={{ minWidth: "180px", flex: "1 1 auto" }}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Search by doctor, ref, patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {patientAppointments.length === 0 ? (
          <div className="empty-state">
            <Calendar size={38} className="text-slate-400" />
            <strong>No appointments found</strong>
            <span>
              {searchQuery
                ? `No bookings match "${searchQuery}". Try another keyword or clear filter.`
                : viewScope === "patient"
                ? `No appointments found for ${currentPatientName}. Switch to "All Clinic Bookings" or talk to our voice assistant.`
                : "You don't have any appointments booked yet. Talk to our voice assistant to schedule."}
            </span>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {viewScope === "patient" && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setViewScope("all")}
                >
                  <Users size={14} />
                  <span>View All Clinic Bookings</span>
                </button>
              )}
              <button
                type="button"
                className="button button-primary"
                onClick={onStartVoiceCall}
              >
                <PhoneCall size={14} />
                <span>Book Appointment via Voice</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Booking Reference</th>
                  <th>Patient Name</th>
                  <th>Doctor & Specialty</th>
                  <th>Scheduled Time</th>
                  <th>Intake Channel</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patientAppointments.map((apt) => {
                  const dt = new Date(apt.scheduled_at);
                  const dateStr = dt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });
                  const timeStr = dt.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit"
                  });
                  const initials = apt.patient_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  const isJustBooked = latestBooking && latestBooking.reference_id === apt.reference_id;

                  return (
                    <tr
                      key={apt.id}
                      style={
                        isJustBooked
                          ? { background: "rgba(16, 185, 129, 0.08)", transition: "background 0.3s ease" }
                          : undefined
                      }
                    >
                      {/* Ref */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className="reference" style={{ fontWeight: 700 }}>
                            Ref: {apt.reference_id}
                          </span>
                          {isJustBooked && (
                            <span
                              className="badge badge-confirmed"
                              style={{ fontSize: "9px", padding: "1px 5px", textTransform: "uppercase" }}
                            >
                              New
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Patient */}
                      <td>
                        <div className="patient">
                          <span>{initials}</span>
                          <div>
                            <strong style={{ color: "#0f172a", fontSize: "13px" }}>{apt.patient_name}</strong>
                            <small style={{ color: "#64748b" }}>{apt.patient_phone || "Contact on file"}</small>
                          </div>
                        </div>
                      </td>

                      {/* Doctor & Specialty */}
                      <td>
                        <div>
                          <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                            <Stethoscope size={13} className="text-teal-600 shrink-0" />
                            {apt.doctor_name || "Assigned Specialist"}
                          </strong>
                          <small style={{ color: "#64748b" }}>{apt.specialty}</small>
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td>
                        <div>
                          <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                            <Clock size={13} className="text-cyan-600 shrink-0" />
                            {dateStr}
                          </strong>
                          <small style={{ color: "#64748b" }}>{timeStr}</small>
                        </div>
                      </td>

                      {/* Source */}
                      <td>
                        <span className={`badge ${apt.source === "AI Voice" ? "badge-ai" : "badge-neutral"}`}>
                          {apt.source === "AI Voice" ? (
                            <>
                              <Sparkles size={11} className="text-teal-600" />
                              AI Voice
                            </>
                          ) : (
                            apt.source || "Clinic Intake"
                          )}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`badge ${
                            apt.status === "Confirmed"
                              ? "badge-confirmed"
                              : apt.status === "Pending"
                              ? "badge-pending"
                              : apt.status === "Cancelled"
                              ? "badge-cancelled"
                              : "badge-danger"
                          }`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontWeight: 600,
                            fontSize: "11px",
                            padding: "3px 8px"
                          }}
                        >
                          {apt.status === "Confirmed" ? (
                            <>
                              <CheckCircle2 size={12} style={{ color: "#10b981" }} />
                              Confirmed
                            </>
                          ) : apt.status === "Pending" ? (
                            <>
                              <Clock size={12} style={{ color: "#f59e0b" }} />
                              Pending
                            </>
                          ) : apt.status === "Cancelled" ? (
                            <>
                              <X size={12} style={{ color: "#64748b" }} />
                              Cancelled
                            </>
                          ) : (
                            <>
                              <AlertCircle size={12} style={{ color: "#ef4444" }} />
                              {apt.status || "Failed"}
                            </>
                          )}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          {onSelectAppointment && (
                            <button
                              type="button"
                              className="button button-ghost row-action"
                              title="View booking details"
                              onClick={() => onSelectAppointment(apt.id)}
                            >
                              <Eye size={15} />
                            </button>
                          )}
                          {onCancelAppointment && apt.status === "Confirmed" && (
                            <button
                              type="button"
                              className="button button-danger row-action"
                              title="Cancel consultation"
                              onClick={() => onCancelAppointment(apt.id)}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Medical Specialists Grid in Exact Admin Doctor-Grid Theme */}
      <section style={{ marginTop: "10px" }}>
        <div className="subpage-hero" style={{ marginBottom: "14px" }}>
          <div>
            <span className="eyebrow">CLINICAL PROVIDERS</span>
            <h2 style={{ margin: "4px 0", fontSize: "19px", fontWeight: 700, color: "#152238" }}>
              Available Medical Specialists
            </h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
              Certified healthcare physicians accepting voice and direct appointments
            </p>
          </div>
        </div>

        <div className="doctor-grid">
          {doctors.map((doc, idx) => {
            const tone = toneColorMap[idx % toneColorMap.length];
            return (
              <div key={doc.id} className="doctor-card">
                <div className="doctor-top">
                  <div className={`doctor-avatar ${tone}`}>
                    {doc.initials}
                  </div>
                  <span className="badge badge-live">
                    <i /> Active
                  </span>
                </div>

                <h2>{doc.name}</h2>
                <p>{doc.specialty}</p>

                <div className="availability-box">
                  <Clock size={16} />
                  <div>
                    <span>Earliest Opening</span>
                    <strong>{doc.next_slot || "Today / Upcoming"}</strong>
                  </div>
                </div>

                <div className="doctor-footer">
                  <span>
                    Consultations: <b>{doc.total_appointments || 0} visits</b>
                  </span>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onStartVoiceCall}
                  >
                    <PhoneCall size={14} />
                    <span>Book via Voice Agent</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
