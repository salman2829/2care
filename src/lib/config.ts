/**
 * Frontend Configuration Module
 * Strictly client-safe: no private secrets are exposed here.
 */

// Supports Next.js-style NEXT_PUBLIC_API_BASE_URL or Vite-style environment variables
const envApiUrl = 
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.NEXT_PUBLIC_API_BASE_URL) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_PUBLIC_API_BASE_URL) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
  "";

// If empty string, uses relative path "/api" which is forwarded by Vite's dev proxy
export const API_BASE_URL = envApiUrl ? envApiUrl.replace(/\/+$/, "") : "/api";

export const APP_CONFIG = {
  appName: "2care",
  tagline: "Healthcare Intelligence Command Center",
  version: "v2.8.4",
  defaultTimezone: "UTC",
  pollIntervalMs: 15000,
  enableDemoModeFallback: true,
};
