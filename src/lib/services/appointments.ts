import { apiClient, ApiResponse } from "../api-client";
import {
  Appointment,
  AppointmentCreatePayload,
  AppointmentCancelResponse,
  OverviewData,
} from "../types";

export interface AppointmentFilter {
  query?: string;
  status_filter?: string;
}

export const appointmentService = {
  async listAppointments(filter: AppointmentFilter = {}): Promise<ApiResponse<Appointment[]>> {
    return apiClient.get<Appointment[]>("/appointments", {
      query: filter.query,
      status_filter: filter.status_filter,
    });
  },

  async getAppointment(id: string): Promise<ApiResponse<Appointment>> {
    return apiClient.get<Appointment>(`/appointments/${encodeURIComponent(id)}`);
  },

  async createAppointment(payload: AppointmentCreatePayload): Promise<ApiResponse<Appointment>> {
    return apiClient.post<Appointment>("/appointments", payload);
  },

  async cancelAppointment(id: string): Promise<ApiResponse<AppointmentCancelResponse>> {
    return apiClient.post<AppointmentCancelResponse>(`/appointments/${encodeURIComponent(id)}/cancel`);
  },

  async getOverviewData(): Promise<ApiResponse<OverviewData>> {
    return apiClient.get<OverviewData>("/stats/overview");
  },
};
