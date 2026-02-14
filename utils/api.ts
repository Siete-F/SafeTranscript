
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { BEARER_TOKEN_KEY } from "@/lib/auth";

/**
 * Backend URL is configured in app.json under expo.extra.backendUrl
 * It is set automatically when the backend is deployed
 */
export const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || "";

/**
 * Check if backend is properly configured
 */
export const isBackendConfigured = (): boolean => {
  return !!BACKEND_URL && BACKEND_URL.length > 0;
};

/**
 * Get bearer token from platform-specific storage
 * Web: localStorage
 * Native: SecureStore
 *
 * @returns Bearer token or null if not found
 */
export const getBearerToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") {
      const token = localStorage.getItem(BEARER_TOKEN_KEY);
      console.log("[API] Retrieved token from localStorage:", token ? "exists" : "null");
      return token;
    } else {
      const token = await SecureStore.getItemAsync(BEARER_TOKEN_KEY);
      console.log("[API] Retrieved token from SecureStore:", token ? "exists" : "null");
      return token;
    }
  } catch (error: any) {
    console.error("[API] Error retrieving bearer token:", {
      message: error?.message || "Unknown error",
      error: error,
    });
    return null;
  }
};

/**
 * Generic API call helper with error handling
 *
 * @param endpoint - API endpoint path (e.g., '/users', '/auth/login')
 * @param options - Fetch options (method, headers, body, etc.)
 * @param responseType - Expected response type: 'json' (default) or 'text'
 * @returns Parsed JSON response or text
 * @throws Error if backend is not configured or request fails
 */
export const apiCall = async <T = any>(
  endpoint: string,
  options?: RequestInit,
  responseType: 'json' | 'text' = 'json'
): Promise<T> => {
  if (!isBackendConfigured()) {
    const error = new Error("Backend URL not configured. Please rebuild the app.");
    console.error("[API] Backend not configured");
    throw error;
  }

  const url = `${BACKEND_URL}${endpoint}`;
  console.log("[API] Calling:", url, options?.method || "GET");

  try {
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    };

    // Always send the token if we have it (needed for cross-domain/iframe support)
    const token = await getBearerToken();
    if (token) {
      console.log("[API] Adding Authorization header");
      fetchOptions.headers = {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      };
    } else {
      console.log("[API] No token available");
    }

    console.log("[API] Request headers:", fetchOptions.headers);

    const response = await fetch(url, fetchOptions);

    console.log("[API] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const text = await response.text();
      console.error("[API] Error response:", {
        status: response.status,
        statusText: response.statusText,
        body: text,
      });
      throw new Error(`API error: ${response.status} - ${text || response.statusText}`);
    }

    const data = responseType === 'text' ? await response.text() : await response.json();
    if (responseType === 'text') {
      console.log("[API] Success: Text response received, length:", (data as string).length);
    } else {
      console.log("[API] Success: JSON response received");
    }
    return data as T;
  } catch (error: any) {
    console.error("[API] Request failed:", {
      message: error?.message || "Unknown error",
      error: error,
      stack: error?.stack,
    });
    throw error;
  }
};

/**
 * GET request helper
 */
export const apiGet = async <T = any>(endpoint: string): Promise<T> => {
  return apiCall<T>(endpoint, { method: "GET" });
};

/**
 * POST request helper
 */
export const apiPost = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * PUT request helper
 */
export const apiPut = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * PATCH request helper
 */
export const apiPatch = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

/**
 * DELETE request helper
 * Always sends a body to avoid FST_ERR_CTP_EMPTY_JSON_BODY errors
 */
export const apiDelete = async <T = any>(endpoint: string, data: any = {}): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "DELETE",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated API call helper
 * Automatically retrieves bearer token from storage and adds to Authorization header
 *
 * @param endpoint - API endpoint path
 * @param options - Fetch options (method, headers, body, etc.)
 * @param responseType - Expected response type: 'json' (default) or 'text'
 * @returns Parsed JSON response or text
 * @throws Error if token not found or request fails
 */
export const authenticatedApiCall = async <T = any>(
  endpoint: string,
  options?: RequestInit,
  responseType: 'json' | 'text' = 'json'
): Promise<T> => {
  console.log("[API] Authenticated call to:", endpoint);
  const token = await getBearerToken();

  if (!token) {
    const error = new Error("Authentication token not found. Please sign in.");
    console.error("[API] No authentication token found");
    throw error;
  }

  console.log("[API] Token found, proceeding with authenticated request");

  return apiCall<T>(endpoint, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  }, responseType);
};

/**
 * Authenticated GET request
 */
export const authenticatedGet = async <T = any>(endpoint: string): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, { method: "GET" });
};

/**
 * Authenticated GET request for text response (e.g., CSV files)
 */
export const authenticatedGetText = async (endpoint: string): Promise<string> => {
  return authenticatedApiCall<string>(endpoint, { method: "GET" }, 'text');
};

/**
 * Authenticated POST request
 */
export const authenticatedPost = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated PUT request
 */
export const authenticatedPut = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated PATCH request
 */
export const authenticatedPatch = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated DELETE request
 * Always sends a body to avoid FST_ERR_CTP_EMPTY_JSON_BODY errors
 */
export const authenticatedDelete = async <T = any>(endpoint: string, data: any = {}): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "DELETE",
    body: JSON.stringify(data),
  });
};
