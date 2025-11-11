import { AuthContext } from "@/contexts/AuthContext";
import { router } from "expo-router";
import React, { useContext, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

export default function Login() {
  const [userFocused, setUserFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const userRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const { login, isLoading } = useContext(AuthContext);

  const handleLogin = async () => {
    setErr(null);
    try {
      await login(email.trim(), password);
      router.replace("/main/(tabs)/home"); // solo después de éxito
    } catch (e: any) {
      // Mensajes típicos de Supabase: "Invalid login credentials"
      setErr(e?.message ?? "No se pudo iniciar sesión.");
    }
  };

  return (
    <View style={styles.body}>
      {/* Título con glow sutil */}
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Login
        </Text>
      </View>

      {/* Card protagonista */}
      <View style={styles.card}>
        {/* Logo */}
        <Image
          source={require("../../assets/images/betapp-mark.png")}
          style={{ width: 56, height: 56, borderRadius: 12, marginBottom: 12 }}
          resizeMode="contain"
        />

        {/* USER */}
        <Pressable
          onPress={() => userRef.current?.focus()}
          style={[styles.inputWrap, userFocused && styles.inputWrapFocused]}
          accessibilityRole="button"
          accessibilityLabel="User input"
        >
          <TextInput
            ref={userRef}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textMuted}
            onFocus={() => setUserFocused(true)}
            onBlur={() => setUserFocused(false)}
            autoCapitalize="none"
            selectionColor={COLORS.primary}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
          />
        </Pressable>

        {/* PASSWORD */}
        <Pressable
          onPress={() => passRef.current?.focus()}
          style={[styles.inputWrap, passFocused && styles.inputWrapFocused]}
          accessibilityRole="button"
          accessibilityLabel="Password input"
        >
          <TextInput
            ref={passRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
            onFocus={() => setPassFocused(true)}
            onBlur={() => setPassFocused(false)}
            autoCapitalize="none"
            selectionColor={COLORS.primary}
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
        </Pressable>

        {/* Error */}
        {err ? <Text style={{ color: "#ff6b6b", marginTop: 10 }}>{err}</Text> : null}

        {/* Forgot password */}
        <View style={styles.forgotRow}>
          <TouchableOpacity onPress={() => router.navigate("/(auth)/reset")}>
            <Text style={styles.link}>Forgot the password?</Text>
          </TouchableOpacity>
        </View>

        {/* CTA Login */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.cta, isLoading && { opacity: 0.6 }]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={styles.ctaText}>{isLoading ? "Entering..." : "Login"}</Text>
        </TouchableOpacity>
      </View>

      {/* --- NUEVA sección debajo de la card --- */}
      <View style={styles.signupRow}>
        <Text style={styles.signupText}>Do not have an account?</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.navigate("/(auth)/register")}
          activeOpacity={0.9}
          style={styles.signupBtn}
        >
          <Text style={styles.signupBtnText}>Create account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ====== Tokens de color (neón) ====== */
const COLORS = {
  bg: "#0B0F12",
  card: "#0E141A",
  text: "#F5F7FA",
  textMuted: "#9AA5B1",
  primary: "#23D6FF",
  border: "#1C2430",
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: COLORS.bg,
    flex: 1,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  header: { width: "88%", maxWidth: 420, alignItems: "center", marginBottom: 10 },
  title: {
    color: COLORS.primary,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.5,
    textShadowColor: "rgba(35,214,255,0.28)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  card: {
    width: "88%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#23D6FF26",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    alignItems: "center",
  },
  inputWrap: {
    width: "100%",
    height: 52,
    backgroundColor: "#0A1016",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginTop: 16,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  input: { color: COLORS.text, fontSize: 16, paddingVertical: 0 },
  forgotRow: { width: "100%", marginTop: 10, alignItems: "flex-end" },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
  cta: {
    marginTop: 18,
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: COLORS.bg, fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  signupRow: {
    width: "88%",
    maxWidth: 420,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  signupText: { color: COLORS.textMuted, fontSize: 14 },
  signupBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  signupBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
});