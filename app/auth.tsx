
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setErrorModal({
        visible: true,
        message: "Please enter both email and password",
      });
      return;
    }

    console.log("[AuthScreen] Starting email auth:", mode);
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name);
      }
      console.log("[AuthScreen] Email auth successful");
      // Navigation is handled by _layout.tsx
    } catch (error: any) {
      console.error("[AuthScreen] Email auth failed:", error);
      
      // Extract user-friendly error message
      let errorMessage = error?.message || `Failed to ${mode === "signin" ? "sign in" : "sign up"}`;
      
      // Add helpful context for common errors
      if (errorMessage.includes("Server error") || errorMessage.includes("500")) {
        errorMessage = "The authentication service is currently unavailable. The backend may be restarting. Please try again in a moment.";
      } else if (errorMessage.includes("credentials")) {
        errorMessage = "Invalid email or password. Please check your credentials and try again.";
      } else if (errorMessage.includes("already exists")) {
        errorMessage = "An account with this email already exists. Please sign in instead.";
      }
      
      setErrorModal({
        visible: true,
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: "google" | "apple" | "github") => {
    console.log(`[AuthScreen] Starting ${provider} auth`);
    setLoading(true);
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "apple") {
        await signInWithApple();
      }
      console.log(`[AuthScreen] ${provider} auth successful`);
      // Navigation is handled by _layout.tsx
    } catch (error: any) {
      console.error(`[AuthScreen] ${provider} auth failed:`, error);
      
      // Extract user-friendly error message
      let errorMessage = error?.message || `Failed to sign in with ${provider}`;
      
      // Add helpful context for common errors
      if (errorMessage.includes("Server error") || errorMessage.includes("500")) {
        errorMessage = `${provider} sign-in is currently unavailable. The backend may be restarting. Please try again in a moment.`;
      } else if (errorMessage.includes("popup")) {
        errorMessage = "Please allow popups to sign in with " + provider;
      } else if (errorMessage.includes("cancelled")) {
        errorMessage = "Sign-in was cancelled";
      }
      
      setErrorModal({
        visible: true,
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const modeText = mode === "signin" ? "Sign In" : "Sign Up";
  const switchModeText = mode === "signin" ? "Don't have an account? Sign Up" : "Already have an account? Sign In";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>Safe Transcript</Text>
          <Text style={styles.subtitle}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </Text>

          {mode === "signup" && (
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!loading}
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{modeText}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.button, styles.socialButton]}
            onPress={() => handleSocialAuth("google")}
            disabled={loading}
          >
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={[styles.button, styles.socialButton]}
              onPress={() => handleSocialAuth("apple")}
              disabled={loading}
            >
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
            disabled={loading}
            style={styles.switchButton}
          >
            <Text style={styles.switchButtonText}>{switchModeText}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={errorModal.visible}
        title="Authentication Error"
        message={errorModal.message}
        type="error"
        onClose={() => setErrorModal({ visible: false, message: "" })}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    color: "#000",
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e0e0e0",
  },
  dividerText: {
    marginHorizontal: 16,
    color: "#999",
    fontSize: 14,
  },
  socialButton: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  socialButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  switchButton: {
    marginTop: 24,
    alignItems: "center",
  },
  switchButtonText: {
    color: "#007AFF",
    fontSize: 14,
  },
});
