// API Configuration
// In production, VITE_API_URL should be set to your API Gateway URL
// In development, it uses the proxy configured in vite.config.ts
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Helper function for API calls
export function getApiUrl(endpoint: string): string {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

  // If API_BASE_URL already includes /api, don't duplicate it
  if (API_BASE_URL.endsWith('/api')) {
    return `${API_BASE_URL}/${cleanEndpoint}`;
  }

  return `${API_BASE_URL}/${cleanEndpoint}`;
}
