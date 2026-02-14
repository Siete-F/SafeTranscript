
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { authClient, setBearerToken, clearAuthTokens } from "@/lib/auth";
import { getBearerToken } from "@/utils/api";

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function openOAuthPopup(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popupUrl = `${window.location.origin}/auth-popup?provider=${provider}`;
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error("Failed to open popup. Please allow popups."));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success" && event.data?.token) {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        resolve(event.data.token);
      } else if (event.data?.type === "oauth-error") {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        reject(new Error(event.data.error || "OAuth failed"));
      }
    };

    window.addEventListener("message", handleMessage);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        reject(new Error("Authentication cancelled"));
      }
    }, 500);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();

    // Listen for deep links (e.g. from social auth redirects)
    const subscription = Linking.addEventListener("url", (event) => {
      console.log("[AuthContext] Deep link received, refreshing user session");
      // Allow time for the client to process the token if needed
      setTimeout(() => fetchUser(), 500);
    });

    // POLLING: Refresh session every 5 minutes to keep SecureStore token in sync
    // This prevents 401 errors when the session token rotates
    const intervalId = setInterval(() => {
      console.log("[AuthContext] Auto-refreshing user session to sync token...");
      fetchUser();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      subscription.remove();
      clearInterval(intervalId);
    };
  }, []);

  const fetchUser = async () => {
    try {
      setLoading(true);
      console.log("[AuthContext] Fetching user session...");
      
      const session = await authClient.getSession();
      console.log("[AuthContext] Session response:", JSON.stringify(session, null, 2));
      
      // Check for error in response
      if (session?.error) {
        console.error("[AuthContext] Session error:", {
          status: session.error.status,
          statusText: session.error.statusText,
          message: session.error.message,
        });
        
        // If it's a 500 error, the backend might not be ready
        if (session.error.status === 500) {
          console.error("[AuthContext] Backend returned 500 error - Better Auth may not be properly configured");
        }
        
        setUser(null);
        await clearAuthTokens();
        return;
      }
      
      if (session?.data?.user) {
        console.log("[AuthContext] User found:", session.data.user.email);
        setUser(session.data.user as User);
        
        // Sync token to SecureStore for utils/api.ts
        if (session.data.session?.token) {
          console.log("[AuthContext] Storing bearer token");
          await setBearerToken(session.data.session.token);
          
          // Verify token was stored
          const storedToken = await getBearerToken();
          if (storedToken) {
            console.log("[AuthContext] Bearer token verified in storage");
          } else {
            console.error("[AuthContext] Failed to verify bearer token in storage");
          }
        } else {
          console.warn("[AuthContext] No session token in response");
        }
      } else {
        console.log("[AuthContext] No user session found");
        setUser(null);
        await clearAuthTokens();
      }
    } catch (error: any) {
      console.error("[AuthContext] Failed to fetch user:", {
        message: error?.message || "Unknown error",
        error: error,
        stack: error?.stack,
      });
      setUser(null);
      await clearAuthTokens();
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log("[AuthContext] Signing in with email:", email);
      const result = await authClient.signIn.email({ email, password });
      console.log("[AuthContext] Sign in result:", JSON.stringify(result, null, 2));
      
      // Check for error in response
      if (result?.error) {
        const errorMessage = result.error.message || 
                           (result.error.status === 500 
                             ? "Server error. The authentication service may not be properly configured." 
                             : "Failed to sign in. Please check your credentials.");
        console.error("[AuthContext] Sign in error:", {
          status: result.error.status,
          statusText: result.error.statusText,
          message: errorMessage,
        });
        throw new Error(errorMessage);
      }
      
      if (!result?.data) {
        throw new Error("No response data from sign in");
      }
      
      await fetchUser();
    } catch (error: any) {
      console.error("[AuthContext] Email sign in failed:", {
        message: error?.message || "Unknown error",
        error: error,
      });
      throw new Error(error?.message || "Failed to sign in with email");
    }
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    try {
      console.log("[AuthContext] Signing up with email:", email);
      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });
      console.log("[AuthContext] Sign up result:", JSON.stringify(result, null, 2));
      
      // Check for error in response
      if (result?.error) {
        const errorMessage = result.error.message || 
                           (result.error.status === 500 
                             ? "Server error. The authentication service may not be properly configured." 
                             : "Failed to create account.");
        console.error("[AuthContext] Sign up error:", {
          status: result.error.status,
          statusText: result.error.statusText,
          message: errorMessage,
        });
        throw new Error(errorMessage);
      }
      
      if (!result?.data) {
        throw new Error("No response data from sign up");
      }
      
      await fetchUser();
    } catch (error: any) {
      console.error("[AuthContext] Email sign up failed:", {
        message: error?.message || "Unknown error",
        error: error,
      });
      throw new Error(error?.message || "Failed to sign up with email");
    }
  };

  const signInWithSocial = async (provider: "google" | "apple" | "github") => {
    try {
      console.log(`[AuthContext] Starting ${provider} sign in`);
      
      if (Platform.OS === "web") {
        console.log(`[AuthContext] Opening ${provider} OAuth popup`);
        const token = await openOAuthPopup(provider);
        console.log("[AuthContext] Received token from popup");
        
        await setBearerToken(token);
        
        // Verify token is retrievable before proceeding
        const storedToken = await getBearerToken();
        if (!storedToken) {
          throw new Error("Failed to persist authentication token");
        }
        console.log("[AuthContext] Token stored successfully");
        
        await fetchUser();
      } else {
        // Native: Use expo-linking to generate a proper deep link
        const callbackURL = Linking.createURL("/");
        console.log(`[AuthContext] Native ${provider} sign in with callback:`, callbackURL);
        
        const result = await authClient.signIn.social({
          provider,
          callbackURL,
        });
        
        console.log(`[AuthContext] ${provider} sign in result:`, JSON.stringify(result, null, 2));
        
        // Check for error in response
        if (result?.error) {
          const errorMessage = result.error.message || 
                             (result.error.status === 500 
                               ? "Server error. OAuth may not be properly configured." 
                               : `Failed to sign in with ${provider}.`);
          console.error(`[AuthContext] ${provider} sign in error:`, {
            status: result.error.status,
            statusText: result.error.statusText,
            message: errorMessage,
          });
          throw new Error(errorMessage);
        }
        
        // The redirect will reload the app or be handled by deep linking
        // fetchUser will be called on mount or via event listener
        await fetchUser();
      }
    } catch (error: any) {
      console.error(`[AuthContext] ${provider} sign in failed:`, {
        message: error?.message || "Unknown error",
        error: error,
        stack: error?.stack,
      });
      throw new Error(error?.message || `Failed to sign in with ${provider}`);
    }
  };

  const signInWithGoogle = () => signInWithSocial("google");
  const signInWithApple = () => signInWithSocial("apple");
  const signInWithGitHub = () => signInWithSocial("github");

  const signOut = async () => {
    try {
      console.log("[AuthContext] Signing out...");
      await authClient.signOut();
      console.log("[AuthContext] Sign out successful");
    } catch (error: any) {
      console.error("[AuthContext] Sign out failed (API):", {
        message: error?.message || "Unknown error",
        error: error,
      });
    } finally {
       // Always clear local state
       console.log("[AuthContext] Clearing local auth state");
       setUser(null);
       await clearAuthTokens();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        signInWithGitHub,
        signOut,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
