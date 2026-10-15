import { apiClient, ApiResponse } from "../api-client";
import { DoctorSlot } from "../types";

export interface AvailabilityFilter {
  doctor_id?: string;
  specialty?: string;
  date?: string;
  only_open?: boolean;
}

export const availabilityService = {
  async getAvailability(filters: AvailabilityFilter = {}): Promise<ApiResponse<DoctorSlot[]>> {
    return apiClient.get<DoctorSlot[]>("/availability", {
      doctor_id: filters.doctor_id,
      specialty: filters.specialty,
      date: filters.date,
      only_open: filters.only_open ?? true,
    });
  },
};
