import { apiClient, ApiResponse } from "../api-client";
import { PatientSummary, PatientDetail } from "../types";

export const patientService = {
  async listPatients(query?: string): Promise<ApiResponse<PatientSummary[]>> {
    const params = query ? `?query=${encodeURIComponent(query)}` : "";
    return apiClient.get<PatientSummary[]>(`/patients${params}`);
  },

  async getPatient(identifier: string): Promise<ApiResponse<PatientDetail>> {
    return apiClient.get<PatientDetail>(`/patients/${encodeURIComponent(identifier)}`);
  },

  async updatePatient(
    identifier: string,
    data: { name?: string; phone?: string; email?: string; notes?: string }
  ): Promise<ApiResponse<{ success: boolean; message: string; updated_appointments_count: number }>> {
    return apiClient.put<{ success: boolean; message: string; updated_appointments_count: number }>(
      `/patients/${encodeURIComponent(identifier)}`,
      data
    );
  },
};
