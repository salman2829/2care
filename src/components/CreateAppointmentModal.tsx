import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Calendar, User, Phone, Mail, FileText, Check, AlertCircle, Loader2 } from "lucide-react";
import { Doctor, DoctorSlot, Appointment } from "../lib/types";
import { doctorService } from "../lib/services/doctors";
import { availabilityService } from "../lib/services/availability";
import { appointmentService } from "../lib/services/appointments";

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (appointment: Appointment) => void;
  initialDoctorId?: string;
  initialSlotId?: string;
}

export default function CreateAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  initialDoctorId,
  initialSlotId,
}: CreateAppointmentModalProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(initialDoctorId || "");
  const [selectedSlotId, setSelectedSlotId] = useState<string>(initialSlotId || "");
  
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [notes, setNotes] = useState("");
  
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load doctors on open
  useEffect(() => {
    if (isOpen) {
      doctorService.listDoctors().then((res) => {
        if (res.ok && res.data) {
          setDoctors(res.data);
          if (!selectedDoctorId && res.data.length > 0) {
            setSelectedDoctorId(initialDoctorId || res.data[0].id);
          }
        }
      });
    }
  }, [isOpen, initialDoctorId]);

  // Load available slots when doctor changes
  useEffect(() => {
    if (isOpen && selectedDoctorId) {
      setLoadingSlots(true);
      setError(null);
      availabilityService
        .getAvailability({ doctor_id: selectedDoctorId, only_open: true })
        .then((res) => {
          setLoadingSlots(false);
          if (res.ok && res.data) {
            setSlots(res.data);
            if (initialSlotId && res.data.some((s) => s.id === initialSlotId)) {
              setSelectedSlotId(initialSlotId);
            } else if (res.data.length > 0) {
              setSelectedSlotId(res.data[0].id);
            } else {
              setSelectedSlotId("");
            }
          }
        });
    }
  }, [isOpen, selectedDoctorId, initialSlotId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!patientName.trim()) {
      setError("Please enter the patient's full name.");
      return;
    }
    if (!patientPhone.trim() || patientPhone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number (at least 7 digits).");
      return;
    }
    if (!selectedDoctorId) {
      setError("Please select a care provider.");
      return;
    }
    if (!selectedSlotId) {
      setError("Please select an open appointment slot.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const doc = doctors.find((d) => d.id === selectedDoctorId);

    const res = await appointmentService.createAppointment({
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim(),
      patient_email: patientEmail.trim() || undefined,
      doctor_id: selectedDoctorId,
      slot_id: selectedSlotId,
      specialty: doc?.specialty,
      source: "Portal",
      notes: notes.trim() || undefined,
    });

    setSubmitting(false);

    if (res.ok && res.data) {
      onSuccess(res.data);
      onClose();
      // Reset form
      setPatientName("");
      setPatientPhone("");
      setPatientEmail("");
      setNotes("");
    } else {
      setError(res.error || "Failed to book appointment. Please try again.");
    }
  };

  if (!isOpen) return null;

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
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <span className="eyebrow">NEW APPOINTMENT</span>
              <h2>Book Patient Consultation</h2>
            </div>
            <button type="button" className="button button-ghost" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && (
                <div className="error-banner">
                  <span>
                    <AlertCircle size={15} /> {error}
                  </span>
                </div>
              )}

              <div className="form-field">
                <label>Care Provider</label>
                <select
                  className="form-select"
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  disabled={submitting}
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.specialty} ({d.slots_count} slots open)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Available Appointment Slot</label>
                {loadingSlots ? (
                  <div style={{ fontSize: 11, color: "#64748b", padding: 8 }}>
                    Loading available slots...
                  </div>
                ) : slots.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#b91c1c", padding: 8 }}>
                    No open slots found for this doctor. Please choose another doctor.
                  </div>
                ) : (
                  <select
                    className="form-select"
                    value={selectedSlotId}
                    onChange={(e) => setSelectedSlotId(e.target.value)}
                    disabled={submitting}
                  >
                    {slots.map((s) => {
                      const dt = new Date(s.start_time);
                      const dateStr = dt.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      });
                      const timeStr = dt.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        <option key={s.id} value={s.id}>
                          {dateStr} at {timeStr}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Patient Full Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. John Doe"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Phone Number</label>
                  <input
                    className="form-input"
                    placeholder="+1 555-010-0000"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
              </div>

              <div className="form-field">
                <label>Email Address (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="patient@example.com"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="form-field">
                <label>Consultation Notes (Optional)</label>
                <input
                  className="form-input"
                  placeholder="Reason for visit, referral, symptoms..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting || slots.length === 0}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Confirming...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Confirm Appointment
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
