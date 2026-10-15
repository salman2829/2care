export type AppointmentStatus = "Confirmed" | "Pending" | "Cancelled" | "Failed";
export type AppointmentSource = "AI Voice" | "Portal" | "Staff";

export interface Appointment {
  id: string;
  reference_id: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string | null;
  doctor_id: string;
  doctor_name?: string | null;
  slot_id: string;
  specialty: string;
  scheduled_at: string;
  source: AppointmentSource;
  status: AppointmentStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Doctor {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  color: string;
  is_active: boolean;
  slots_count: number;
  next_slot?: string | null;
}

export interface DoctorSlot {
  id: string;
  doctor_id: string;
  doctor_name?: string | null;
  doctor_initials?: string | null;
  specialty?: string | null;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  is_held: boolean;
}

export interface KPIMetrics {
  total_appointments: number;
  today_appointments: number;
  available_slots: number;
  ai_booking_success_rate: number;
  total_change_percent: string;
  today_change_text: string;
  slots_change_text: string;
  ai_success_change_text: string;
}

export interface DailyChartPoint {
  day: string;
  confirmed: number;
  cancelled: number;
}

export interface ActivityItem {
  title: string;
  detail: string;
  time: string;
  kind: "success" | "info" | "warning" | "danger";
}

export interface OverviewData {
  kpis: KPIMetrics;
  chart_data: DailyChartPoint[];
  recent_activity: ActivityItem[];
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  environment: string;
  database: string;
  demo_mode: boolean;
  version: string;
}

export interface AppointmentCreatePayload {
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  doctor_id: string;
  slot_id: string;
  specialty?: string;
  source?: AppointmentSource;
  notes?: string;
}

export interface AppointmentCancelResponse {
  message: string;
  appointment: Appointment;
}

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isDemoFallback: boolean;
}

export interface PatientSummary {
  id: string;
  mrn: string;
  name: string;
  phone: string;
  email?: string | null;
  total_appointments: number;
  confirmed_appointments: number;
  cancelled_appointments: number;
  voice_bookings: number;
  primary_doctor?: string | null;
  primary_specialty?: string | null;
  last_scheduled_at?: string | null;
  status: string;
  notes?: string | null;
}

export interface PatientDetail extends PatientSummary {
  appointments: Array<{
    id: string;
    reference_id: string;
    scheduled_at?: string | null;
    doctor_name?: string | null;
    specialty?: string | null;
    status: string;
    source: string;
    notes?: string | null;
  }>;
  calls: Array<{
    id: string;
    call_id: string;
    caller_phone?: string | null;
    duration_seconds: number;
    status: string;
    transcript?: string | null;
    appointment_id?: string | null;
    created_at?: string | null;
  }>;
}

