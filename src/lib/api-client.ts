import { API_BASE_URL } from "./config";

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
  ok: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      let responseData: any = null;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        responseData = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => "");
        responseData = text ? { message: text } : null;
      }

      if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}`;
        if (responseData?.detail) {
          if (typeof responseData.detail === "string") {
            errorMessage = responseData.detail;
          } else if (Array.isArray(responseData.detail)) {
            // Validation errors list
            errorMessage = responseData.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
          }
        } else if (responseData?.message) {
          errorMessage = responseData.message;
        }

        return {
          data: null,
          error: errorMessage,
          status: response.status,
          ok: false,
        };
      }

      return {
        data: responseData as T,
        error: null,
        status: response.status,
        ok: true,
      };
    } catch (err: any) {
      const networkMessage = err?.message || "Failed to reach backend server. Check connection.";
      return {
        data: null,
        error: networkMessage,
        status: 0,
        ok: false,
      };
    }
  }

  public async get<T>(endpoint: string, queryParams?: Record<string, any>): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (queryParams) {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          params.append(key, String(val));
        }
      });
      const qs = params.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }
    return this.request<T>(url, { method: "GET" });
  }

  public async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
