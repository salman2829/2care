import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, RefreshCw, AlertCircle, Loader2, Bot, Calendar, Clock, MapPin, Stethoscope } from "lucide-react";
import { Appointment } from "../lib/types";
import { appointmentService } from "../lib/services/appointments";

interface AppointmentDetailDrawerProps {
  appointmentId: string | null;
  onClose: () => void;
  onCancelled: (updated: Appointment) => void;
}

export default function AppointmentDetailDrawer({
  appointmentId,
  onClose,
  onCancelled,
}: AppointmentDetailDrawerProps) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await appointmentService.getAppointment(id);
    setLoading(false);
    if (res.ok && res.data) {
      setAppointment(res.data);
    } else {
      setError(res.error || "Failed to load appointment details.");
    }
  };

  useEffect(() => {
    if (appointmentId) {
      fetchDetails(appointmentId);
    } else {
      setAppointment(null);
    }
  }, [appointmentId]);

  const handleCancel = async () => {
    if (!appointment || cancelling) return;
    setCancelling(true);
    setError(null);

    const res = await appointmentService.cancelAppointment(appointment.id);
    setCancelling(false);

    if (res.ok && res.data) {
      const updated = res.data.appointment;
      setAppointment(updated);
      onCancelled(updated);
    } else {
      setError(res.error || "Failed to cancel appointment.");
    }
  };

  if (!appointmentId) return null;

  const dt = appointment ? new Date(appointment.scheduled_at) : null;
  const dateStr = dt ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const timeStr = dt ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <AnimatePresence>
      <motion.div
        className="drawer-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        className="detail-drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">APPOINTMENT DETAILS</span>
            <h2>{appointment?.reference_id || appointmentId}</h2>
          </div>
          <button type="button" className="button button-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 12 }}>Loading appointment details from database...</p>
          </div>
        ) : error && !appointment ? (
          <div style={{ padding: 20 }}>
            <div className="error-banner">
              <span>
                <AlertCircle size={16} /> {error}
              </span>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => fetchDetails(appointmentId)}
              >
                Retry
              </button>
            </div>
          </div>
        ) : appointment ? (
          <>
            <div className="patient-profile">
              <span>
                {appointment.patient_name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </span>
              <div>
                <h3>{appointment.patient_name}</h3>
                <p>{appointment.patient_phone}</p>
                {appointment.patient_email && <small style={{ color: "#94a3b8" }}>{appointment.patient_email}</small>}
              </div>
              <span className={`badge badge-${appointment.status.toLowerCase()}`}>
                <i /> {appointment.status}
              </span>
            </div>

            {error && (
              <div className="error-banner" style={{ margin: "0 0 14px" }}>
                <span>
                  <AlertCircle size={15} /> {error}
                </span>
              </div>
            )}

            <div className="detail-grid">
              <div>
                <span><Calendar size={12} style={{ display: "inline", marginRight: 4 }} /> Date & time</span>
                <strong>{dateStr}</strong>
                <p>{timeStr}</p>
              </div>
              <div>
                <span><Stethoscope size={12} style={{ display: "inline", marginRight: 4 }} /> Provider</span>
                <strong>{appointment.doctor_name || "Assigned Specialist"}</strong>
                <p>{appointment.specialty}</p>
              </div>
              <div>
                <span><Bot size={12} style={{ display: "inline", marginRight: 4 }} /> Booking source</span>
                <strong>{appointment.source}</strong>
                <p>{appointment.source === "AI Voice" ? "Retell Voice Agent" : "Portal Intake"}</p>
              </div>
              <div>
                <span><MapPin size={12} style={{ display: "inline", marginRight: 4 }} /> Location</span>
                <strong>Main Clinic</strong>
                <p>Room 4B</p>
              </div>
            </div>

            {appointment.notes && (
              <div style={{ marginTop: 14, padding: 12, border: "1px solid #e7edf3", borderRadius: 9, background: "#f8fafc" }}>
                <span style={{ fontSize: 9, color: "#8a97a9", textTransform: "uppercase", fontWeight: 600 }}>Clinical Notes</span>
                <p style={{ margin: "5px 0 0", fontSize: 10, color: "#334155", lineHeight: 1.5 }}>{appointment.notes}</p>
              </div>
            )}

            <div className="drawer-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => fetchDetails(appointment.id)}
                disabled={cancelling}
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={handleCancel}
                disabled={cancelling || appointment.status === "Cancelled"}
              >
                {cancelling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Cancelling...
                  </>
                ) : appointment.status === "Cancelled" ? (
                  "Cancelled"
                ) : (
                  "Cancel appointment"
                )}
              </button>
            </div>
          </>
        ) : null}
      </motion.aside>
    </AnimatePresence>
  );
}
