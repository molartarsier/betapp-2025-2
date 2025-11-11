import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/** ====== Tokens de color (neón) ====== */
const COLORS = {
  bg: "#0B0F12",
  card: "#0E141A",
  text: "#F5F7FA",
  textMuted: "#9AA5B1",
  primary: "#23D6FF", // cian neón
  border: "#1C2430",
  error: "#FF3D8A",
};

type Mode = "email" | "phone";
export default function Reset({
  onSubmit,
  onBackToLogin,
}: {
  onSubmit?: (payload: { mode: Mode; email?: string; phone?: string }) => Promise<void> | void;
  onBackToLogin?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [focused, setFocused] = useState<"email" | "phone" | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
  const onlyDigits = (v: string) => v.replace(/\D+/g, "");

  const errors = useMemo(() => {
    const e: { email?: string; phone?: string } = {};
    if (mode === "email" && email.length > 0 && !isEmail(email)) e.email = "Formato de correo inválido";
    if (mode === "phone") {
      const d = onlyDigits(phone);
      if (phone.length > 0 && d.length < 9) e.phone = "Mínimo 9 dígitos";
    }
    return e;
  }, [mode, email, phone]);

  const valid = useMemo(() => {
    if (mode === "email") return isEmail(email);
    return onlyDigits(phone).length >= 9;
  }, [mode, email, phone]);

  const handleSubmit = async () => {
    if (!valid || loading) return;
    try {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 800)); // simula request
      onSubmit?.({
        mode,
        email: mode === "email" ? email.trim() : undefined,
        phone: mode === "phone" ? onlyDigits(phone) : undefined,
      });
      Alert.alert(
        "Reset enviado",
        mode === "email"
          ? "Te enviamos un enlace a tu correo."
          : "Te enviamos un código por SMS.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.body}>
      {/* Título con glow sutil (la card es la protagonista) */}
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Forgot password
        </Text>
        <View style={styles.titleGlow} />
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.helper}>
          Enter your email or phone number to regain access.
        </Text>

        {/* Tabs simples */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, mode === "email" ? styles.tabActive : null]}
            onPress={() => setMode("email")}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabText, mode === "email" ? styles.tabTextActive : styles.tabTextInactive]}>
              Email
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === "phone" ? styles.tabActive : null]}
            onPress={() => setMode("phone")}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabText, mode === "phone" ? styles.tabTextActive : styles.tabTextInactive]}>
              Phone Number
            </Text>
          </TouchableOpacity>
        </View>

        {/* INPUT: Email */}
        {mode === "email" && (
          <Pressable
            onPress={() => emailRef.current?.focus()}
            style={[styles.inputWrap, focused === "email" && styles.inputWrapFocused, errors.email && styles.inputWrapError]}
            accessibilityRole="button"
            accessibilityLabel="Email input"
          >
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              selectionColor={COLORS.primary}
              value={email}
              onChangeText={setEmail}
            />
          </Pressable>
        )}

        {/* INPUT: Phone */}
        {mode === "phone" && (
          <Pressable
            onPress={() => phoneRef.current?.focus()}
            style={[styles.inputWrap, focused === "phone" && styles.inputWrapFocused, errors.phone && styles.inputWrapError]}
            accessibilityRole="button"
            accessibilityLabel="Phone input"
          >
            <TextInput
              ref={phoneRef}
              style={styles.input}
              placeholder="+57 300 000 0000"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
              autoCapitalize="none"
              onFocus={() => setFocused("phone")}
              onBlur={() => setFocused(null)}
              selectionColor={COLORS.primary}
              value={phone}
              onChangeText={setPhone}
            />
          </Pressable>
        )}

        {/* Errores */}
        {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        {!!errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

        {/* CTA enviar */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.cta, (!valid || loading) && styles.ctaDisabled]}
          disabled={!valid || loading}
          onPress={handleSubmit}
        >
          <Text style={styles.ctaText}>{loading ? "Enviando..." : mode === "email" ? "Send Link" : "Send Code"}</Text>
        </TouchableOpacity>
      </View>

      {/* Debajo de la card: volver al login */}
      <View style={styles.bottomRow}>
        <Text style={styles.bottomText}>Remember your password?</Text>
        <TouchableOpacity
          onPress={() => router.navigate("/(auth)/login")}
          activeOpacity={0.9}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: COLORS.bg,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  header: {
    width: "88%",
    maxWidth: 420,
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.5,
    textShadowColor: "rgba(35,214,255,0.22)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  titleGlow: {
    marginTop: 4,
    height: 2,
    width: 64,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    opacity: 0.45,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
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
  },

  helper: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: 12,
  },

  tabsRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#0B1218",
    borderRadius: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#13202B",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  tabText: { fontSize: 14, fontWeight: "700" },
  tabTextActive: { color: COLORS.text },
  tabTextInactive: { color: COLORS.textMuted },

  inputWrap: {
    width: "100%",
    height: 52,
    backgroundColor: "#0A1016",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
    marginTop: 8,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  inputWrapError: {
    borderColor: COLORS.error,
  },
  input: {
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
  },

  cta: {
    marginTop: 16,
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: {
    backgroundColor: "#1A2A33",
  },
  ctaText: {
    color: COLORS.bg,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  bottomRow: {
    width: "88%",
    maxWidth: 420,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  bottomText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  backBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  backBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});