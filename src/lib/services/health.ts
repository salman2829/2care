import { apiClient, ApiResponse } from "../api-client";
import { HealthStatus } from "../types";

export const healthService = {
  async checkHealth(): Promise<ApiResponse<HealthStatus>> {
    return apiClient.get<HealthStatus>("/health");
  },
};
