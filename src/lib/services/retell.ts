import { apiClient, ApiResponse } from "../api-client";

export interface CallLogItem {
  id: string;
  call_id: string;
  caller_phone?: string | null;
  agent_id?: string | null;
  direction: string;
  duration_seconds: number;
  status: string;
  transcript?: string | null;
  tool_calls_log?: string | null;
  dynamic_variables?: string | null;
  context_audit?: string | null;
  appointment_id?: string | null;
  created_at: string;
}

export interface SearchDoctorsToolResponse {
  success: boolean;
  doctors: Array<{
    id: string;
    name: string;
    specialty: string;
    next_available_slot?: string | null;
    open_slots_count: number;
  }>;
  message: string;
}

export interface CheckAvailabilityToolResponse {
  success: boolean;
  slots: Array<{
    slot_id: string;
    doctor_id: string;
    doctor_name: string;
    specialty: string;
    date: string;
    time: string;
    start_time_iso: string;
  }>;
  message: string;
}

export interface BookAppointmentVoiceToolResponse {
  success: boolean;
  reference_id?: string | null;
  patient_name: string;
  doctor_name: string;
  specialty: string;
  appointment_time: string;
  status: string;
  spoken_summary: string;
  message: string;
}

export const retellService = {
  async listCalls(): Promise<ApiResponse<CallLogItem[]>> {
    return apiClient.get<CallLogItem[]>("/retell/calls");
  },

  async simulateCall(scenario: "booking_success" | "inquiry_only" = "booking_success"): Promise<ApiResponse<CallLogItem>> {
    return apiClient.post<CallLogItem>(`/retell/simulate-call?scenario=${scenario}`);
  },

  async searchDoctors(specialty?: string): Promise<ApiResponse<SearchDoctorsToolResponse>> {
    return apiClient.post<SearchDoctorsToolResponse>("/retell/tools/search-doctors", { specialty });
  },

  async checkAvailability(params: { doctor_id?: string; specialty?: string; date?: string }): Promise<ApiResponse<CheckAvailabilityToolResponse>> {
    return apiClient.post<CheckAvailabilityToolResponse>("/retell/tools/check-availability", params);
  },

  async bookAppointment(params: {
    patient_name: string;
    patient_phone: string;
    doctor_id: string;
    slot_id: string;
    specialty?: string;
    patient_confirmed: boolean;
    notes?: string;
  }): Promise<ApiResponse<BookAppointmentVoiceToolResponse>> {
    return apiClient.post<BookAppointmentVoiceToolResponse>("/retell/tools/book-appointment", params);
  },

  async getAppointment(reference_id: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>("/retell/tools/get-appointment", { reference_id });
  },

  async createWebCall(context?: CreateWebCallContext): Promise<ApiResponse<{ call_id: string; access_token: string; dynamic_variables?: any }>> {
    return apiClient.post<{ call_id: string; access_token: string; dynamic_variables?: any }>("/retell/create-web-call", context || {});
  },

  async getCallAudit(call_id: string): Promise<ApiResponse<any>> {
    return apiClient.get<any>(`/retell/calls/${call_id}/audit`);
  },

  async syncCall(params: {
    call_id: string;
    transcript?: string;
    duration_seconds?: number;
    appointment_id?: string;
  }): Promise<ApiResponse<{ success: boolean; call_log: CallLogItem; appointment?: any }>> {
    return apiClient.post<{ success: boolean; call_log: CallLogItem; appointment?: any }>("/retell/sync-call", params);
  },

  async getTunnelStatus(): Promise<ApiResponse<TunnelStatusResponse>> {
    return apiClient.get<TunnelStatusResponse>("/retell/tunnel/status");
  },

  async startTunnel(): Promise<ApiResponse<TunnelStatusResponse>> {
    return apiClient.post<TunnelStatusResponse>("/retell/tunnel/start");
  },

  async syncTunnel(public_url?: string): Promise<ApiResponse<TunnelStatusResponse>> {
    return apiClient.post<TunnelStatusResponse>("/retell/tunnel/sync", { public_url });
  },
};

export interface CreateWebCallContext {
  patient_name?: string;
  patient_id?: string;
  patient_phone?: string;
  selected_doctor_id?: string;
  selected_doctor_name?: string;
  selected_slot_id?: string;
  selected_date?: string;
  clinic_name?: string;
}

export interface TunnelStatusResponse {
  is_running: boolean;
  public_url: string | null;
  is_reachable: boolean;
  synced_with_retell: boolean;
  last_synced: string | null;
  pid?: number | null;
  error?: string | null;
}

