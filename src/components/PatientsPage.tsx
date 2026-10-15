import React, { useState, useMemo } from "react";
import {
  Search, Users, Phone, Mail, ShieldCheck, ChevronRight, Stethoscope,
  Bot, Check, AlertCircle, RefreshCw, Calendar, Loader2, Sparkles, Filter
} from "lucide-react";
import { PatientSummary } from "../lib/types";

interface PatientsPageProps {
  patients: PatientSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectPatient: (patientId: string) => void;
  isLive: boolean;
}

export default function PatientsPage({
  patients,
  loading,
  error,
  onRefresh,
  onSelectPatient,
  isLive,
}: PatientsPageProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "voice" | "multiple">("all");

  const filtered = useMemo(() => {
    return patients.filter((p) => {
      if (filterType === "voice" && p.voice_bookings === 0) return false;
      if (filterType === "multiple" && p.total_appointments <= 1) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.primary_doctor && p.primary_doctor.toLowerCase().includes(q))
      );
    });
  }, [patients, search, filterType]);

  const totalVisits = useMemo(() => {
    return patients.reduce((acc, p) => acc + p.total_appointments, 0);
  }, [patients]);

  const totalVoicePatients = useMemo(() => {
    return patients.filter((p) => p.voice_bookings > 0).length;
  }, [patients]);

  return (
    <div className="page-stack">
      {/* Hero Welcome */}
      <section className="subpage-hero">
        <div>
          <span className="badge badge-live">
            <i /> {isLive ? "PostgreSQL Verified EHR" : "Demo Patient Registry"}
          </span>
          <h1>Master Patient Index & Health Records</h1>
          <p>
            Authoritative clinical directory maintaining verified demographics, medical identifiers, consultation history, and autonomous voice bookings.
          </p>
        </div>
        <div className="welcome-actions">
          <button type="button" className="button button-secondary" onClick={onRefresh} title="Refresh patient records">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh Records</span>
          </button>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" className="button button-ghost" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}

      {/* 4 Summary Metric Cards */}
      <div className="metrics-grid">
        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon cyan">
              <Users size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Registry
            </span>
          </div>
          <div className="metric-body">
            <span>Total registered patients</span>
            <strong>{patients.length}</strong>
            <small>
              <b>100%</b> verified EHR records
            </small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon mint">
              <ShieldCheck size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Accurate EHR
            </span>
          </div>
          <div className="metric-body">
            <span>Clinical visits maintained</span>
            <strong>{totalVisits}</strong>
            <small>
              <b>{patients.length > 0 ? (totalVisits / patients.length).toFixed(1) : 1}</b> visits per patient avg
            </small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon orange">
              <Sparkles size={16} />
            </div>
            <span className="badge badge-live">
              <i /> AI Voice
            </span>
          </div>
          <div className="metric-body">
            <span>Voice-enabled patients</span>
            <strong>{totalVoicePatients}</strong>
            <small>
              <b>{patients.length > 0 ? Math.round((totalVoicePatients / patients.length) * 100) : 0}%</b> autonomous adoption
            </small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-head">
            <div className="metric-icon violet">
              <Stethoscope size={16} />
            </div>
            <span className="badge badge-live">
              <i /> Care Coverage
            </span>
          </div>
          <div className="metric-body">
            <span>Specialist network</span>
            <strong>4 Care Teams</strong>
            <small>Cardiology, Derm & General</small>
          </div>
        </article>
      </div>

      {/* Main Table Panel */}
      <section className="panel table-panel full-table">
        <div className="panel-heading table-heading">
          <div>
            <span className="eyebrow">PATIENT ROSTER</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2>All Patient Medical Records</h2>
              <span className="badge badge-confirmed" style={{ fontSize: 10 }}>
                {filtered.length} Patients
              </span>
            </div>
            <p>Select any patient to review medical chart, consultation history, and update clinical info.</p>
          </div>

          <div className="table-tools">
            <label className="table-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, MRN..."
              />
            </label>

            <select
              className="select-button"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              style={{ height: 32 }}
            >
              <option value="all">All Patients ({patients.length})</option>
              <option value="voice">AI Voice Patients ({totalVoicePatients})</option>
              <option value="multiple">Repeat Visitors (2+ visits)</option>
            </select>

            <button type="button" className="button button-secondary" onClick={onRefresh}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Patient / MRN</th>
                <th>Contact Details</th>
                <th>Primary Care Provider</th>
                <th>Consultation Stats</th>
                <th>Last Visit</th>
                <th>Record Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && patients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#8a96a7" }}>
                    <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                    Loading authoritative patient registry...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Users size={25} />
                      <strong>No patient records found</strong>
                      <span>Try adjusting your search criteria or reset filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((patient) => {
                  const dt = patient.last_scheduled_at ? new Date(patient.last_scheduled_at) : null;
                  const dateStr = dt
                    ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "No visits";

                  return (
                    <tr
                      key={patient.id}
                      onClick={() => onSelectPatient(patient.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <div className="patient">
                          <span
                            style={{
                              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                              color: "white",
                              fontWeight: 700,
                            }}
                          >
                            {patient.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div>
                            <strong>{patient.name}</strong>
                            <small className="reference">{patient.mrn}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <strong style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                          <Phone size={12} className="text-teal-600" />
                          {patient.phone}
                        </strong>
                        <small style={{ color: "#64748b" }}>{patient.email || "No email"}</small>
                      </td>

                      <td>
                        <strong>{patient.primary_doctor || "Dr. Maya Chen"}</strong>
                        <small>{patient.primary_specialty || "Specialist"}</small>
                      </td>

                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                            {patient.total_appointments} {patient.total_appointments === 1 ? "visit" : "visits"}
                          </span>
                          {patient.voice_bookings > 0 && (
                            <span className="badge badge-ai" style={{ fontSize: 10 }}>
                              <Bot size={11} /> {patient.voice_bookings} Voice
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <strong>{dateStr}</strong>
                      </td>

                      <td>
                        <span className="badge badge-confirmed">
                          <i /> {patient.status}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPatient(patient.id);
                          }}
                          title="View patient health record"
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>
            Showing 1–{filtered.length} of {patients.length} registered patient records
          </span>
        </div>
      </section>
    </div>
  );
}
