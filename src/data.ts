import { Appointment, Doctor, ActivityItem, DailyChartPoint } from "./lib/types";

export const appointments: Appointment[] = [
  { id: "apt-mock-1", reference_id: "2C-10482", patient_name: "Amelia Carter", patient_phone: "+1-555-100-0001", doctor_id: "doc_maya_chen", doctor_name: "Dr. Maya Chen", slot_id: "slot-m-1", specialty: "Cardiology", scheduled_at: "2025-06-18T09:30:00Z", source: "AI Voice", status: "Confirmed" },
  { id: "apt-mock-2", reference_id: "2C-10481", patient_name: "Noah Williams", patient_phone: "+1-555-100-0002", doctor_id: "doc_elias_reed", doctor_name: "Dr. Elias Reed", slot_id: "slot-m-2", specialty: "Dermatology", scheduled_at: "2025-06-18T10:15:00Z", source: "Portal", status: "Pending" },
  { id: "apt-mock-3", reference_id: "2C-10479", patient_name: "Sophia Bennett", patient_phone: "+1-555-100-0003", doctor_id: "doc_lena_ortiz", doctor_name: "Dr. Lena Ortiz", slot_id: "slot-m-3", specialty: "General Medicine", scheduled_at: "2025-06-18T11:00:00Z", source: "AI Voice", status: "Confirmed" },
  { id: "apt-mock-4", reference_id: "2C-10476", patient_name: "James Wilson", patient_phone: "+1-555-100-0004", doctor_id: "doc_arjun_mehta", doctor_name: "Dr. Arjun Mehta", slot_id: "slot-m-4", specialty: "Neurology", scheduled_at: "2025-06-18T13:30:00Z", source: "Staff", status: "Cancelled" },
  { id: "apt-mock-5", reference_id: "2C-10474", patient_name: "Olivia Martin", patient_phone: "+1-555-100-0005", doctor_id: "doc_maya_chen", doctor_name: "Dr. Maya Chen", slot_id: "slot-m-5", specialty: "Cardiology", scheduled_at: "2025-06-18T14:15:00Z", source: "AI Voice", status: "Confirmed" },
  { id: "apt-mock-6", reference_id: "2C-10471", patient_name: "Lucas Thompson", patient_phone: "+1-555-100-0006", doctor_id: "doc_lena_ortiz", doctor_name: "Dr. Lena Ortiz", slot_id: "slot-m-6", specialty: "General Medicine", scheduled_at: "2025-06-19T08:45:00Z", source: "Portal", status: "Confirmed" },
];

export const doctors: Doctor[] = [
  { id: "doc_maya_chen", name: "Dr. Maya Chen", initials: "MC", specialty: "Cardiology", next_slot: "Today, 2:30 PM", slots_count: 8, is_active: true, color: "cyan" },
  { id: "doc_elias_reed", name: "Dr. Elias Reed", initials: "ER", specialty: "Dermatology", next_slot: "Tomorrow, 9:15 AM", slots_count: 5, is_active: true, color: "mint" },
  { id: "doc_lena_ortiz", name: "Dr. Lena Ortiz", initials: "LO", specialty: "General Medicine", next_slot: "Today, 4:00 PM", slots_count: 12, is_active: true, color: "violet" },
  { id: "doc_arjun_mehta", name: "Dr. Arjun Mehta", initials: "AM", specialty: "Neurology", next_slot: "Jun 21, 10:30 AM", slots_count: 3, is_active: false, color: "orange" },
];

export const chartData: DailyChartPoint[] = [
  { day: "Jun 12", confirmed: 38, cancelled: 5 },
  { day: "Jun 13", confirmed: 45, cancelled: 8 },
  { day: "Jun 14", confirmed: 42, cancelled: 4 },
  { day: "Jun 15", confirmed: 55, cancelled: 7 },
  { day: "Jun 16", confirmed: 48, cancelled: 5 },
  { day: "Jun 17", confirmed: 63, cancelled: 9 },
  { day: "Jun 18", confirmed: 58, cancelled: 4 },
];

export const activity: ActivityItem[] = [
  { title: "Booking confirmed", detail: "2C-10482 · Dr. Maya Chen", time: "2 min ago", kind: "success" },
  { title: "Availability checked", detail: "Cardiology · 8 slots returned", time: "5 min ago", kind: "info" },
  { title: "AI evaluation completed", detail: "Call #CA-8841 · Score 94%", time: "12 min ago", kind: "success" },
  { title: "Slot conflict detected", detail: "Fallback slot offered by agent", time: "18 min ago", kind: "warning" },
  { title: "Voice tool failed", detail: "Calendar read timed out · recovered", time: "26 min ago", kind: "danger" },
];
