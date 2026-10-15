import { apiClient, ApiResponse } from "../api-client";
import { Doctor } from "../types";

export const doctorService = {
  async listDoctors(): Promise<ApiResponse<Doctor[]>> {
    return apiClient.get<Doctor[]>("/doctors");
  },
};
