
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

const API_URL = "https://bh3h8uufh9h7q9yyhywusffreh7yfdxg.app.specular.dev";

export const BEARER_TOKEN_KEY = "secure-scribe_bearer_token";

// Platform-specific storage: localStorage for web, SecureStore for native
const storage = Platform.OS === "web"
  ? {
      getItem: (key: string) => {
        const value = localStorage.getItem(key);
        console.log("[Auth Storage] getItem:", key, value ? "exists" : "null");
        return value;
      },
      setItem: (key: string, value: string) => {
        console.log("[Auth Storage] setItem:", key);
        localStorage.setItem(key, value);
      },
      deleteItem: (key: string) => {
        console.log("[Auth Storage] deleteItem:", key);
        localStorage.removeItem(key);
      },
    }
  : {
      getItem: async (key: string) => {
        const value = await SecureStore.getItemAsync(key);
        console.log("[Auth Storage] getItem:", key, value ? "exists" : "null");
        return value;
      },
      setItem: async (key: string, value: string) => {
        console.log("[Auth Storage] setItem:", key);
        await SecureStore.setItemAsync(key, value);
      },
      deleteItem: async (key: string) => {
        console.log("[Auth Storage] deleteItem:", key);
        await SecureStore.deleteItemAsync(key);
      },
    };

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "secure-scribe",
      storagePrefix: "secure-scribe",
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
