
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.backendUrl;

export const BEARER_TOKEN_KEY = "safetranscript_bearer_token";

// Platform-specific storage: localStorage for web, SecureStore for native
// Use synchronous interface as required by better-auth/expo
const storage = {
  getItem: (key: string) => {
    if (Platform.OS === "web") {
      const value = localStorage.getItem(key);
      console.log("[Auth Storage] getItem:", key, value ? "exists" : "null");
      return value;
    }
    // For native, return null synchronously (SecureStore is async-only)
    // The expoClient plugin will handle async storage operations separately
    console.log("[Auth Storage] getItem:", key, "(native - async)");
    return null;
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === "web") {
      console.log("[Auth Storage] setItem:", key);
      localStorage.setItem(key, value);
    } else {
      console.log("[Auth Storage] setItem:", key, "(native - async)");
      // Fire and forget for native async storage
      SecureStore.setItemAsync(key, value).catch((err) => {
        console.error("[Auth Storage] Failed to set item:", err);
      });
    }
  },
  deleteItem: (key: string) => {
    if (Platform.OS === "web") {
      console.log("[Auth Storage] deleteItem:", key);
      localStorage.removeItem(key);
    } else {
      console.log("[Auth Storage] deleteItem:", key, "(native - async)");
      // Fire and forget for native async storage
      SecureStore.deleteItemAsync(key).catch((err) => {
        console.error("[Auth Storage] Failed to delete item:", err);
      });
    }
  },
};

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "safetranscript",
      storagePrefix: "safetranscript",
      storage,
    }),
  ],
  // On web, use cookies (credentials: include) and fallback to bearer token
  ...(Platform.OS === "web" && {
    fetchOptions: {
      credentials: "include",
      auth: {
        type: "Bearer" as const,
        token: () => {
          const token = localStorage.getItem(BEARER_TOKEN_KEY) || "";
          console.log("[Auth Client] Getting token for request:", token ? "exists" : "null");
          return token;
        },
      },
    },
  }),
});

export async function setBearerToken(token: string) {
  console.log("[Auth] Setting bearer token");
  if (Platform.OS === "web") {
    localStorage.setItem(BEARER_TOKEN_KEY, token);
    // Verify token was persisted
    const stored = localStorage.getItem(BEARER_TOKEN_KEY);
    if (stored !== token) {
      console.error("[Auth] Failed to persist bearer token");
      throw new Error("Failed to persist bearer token");
    }
    console.log("[Auth] Bearer token stored successfully in localStorage");
  } else {
    await SecureStore.setItemAsync(BEARER_TOKEN_KEY, token);
    // Verify token was persisted
    const stored = await SecureStore.getItemAsync(BEARER_TOKEN_KEY);
    if (stored !== token) {
      console.error("[Auth] Failed to persist bearer token");
      throw new Error("Failed to persist bearer token");
    }
    console.log("[Auth] Bearer token stored successfully in SecureStore");
  }
}

export async function clearAuthTokens() {
  console.log("[Auth] Clearing auth tokens");
  if (Platform.OS === "web") {
    localStorage.removeItem(BEARER_TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(BEARER_TOKEN_KEY);
  }
  console.log("[Auth] Auth tokens cleared");
}

export { API_URL };
