// app/(auth)/register.tsx
import React, { useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/utils/supabase";

const COLORS = {
  bg: "#0B0F12",
  card: "#0E141A",
  text: "#F5F7FA",
  textMuted: "#9AA5B1",
  primary: "#23D6FF",
  border: "#1C2430",
};

export default function Register() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState(""); // opcional
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleRegister = async () => {
    setErr(null);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();

    if (!trimmedName) return setErr("Por favor ingresa tu nombre.");
    if (!trimmedEmail) return setErr("Por favor ingresa tu email.");
    if (!password) return setErr("Por favor ingresa una contraseña.");
    if (password.length < 6) return setErr("La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) return setErr("Las contraseñas no coinciden.");

    try {
      setIsLoading(true);

      // 1) Crear usuario en AUTH con metadata (name/username)
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { name: trimmedName, username: trimmedUsername || trimmedName },
        },
      });
      if (error) throw error;

      // 2) Intentar guardar también en la tabla `profiles`
      //    - Si tu proyecto obliga verificación por correo (sin sesión),
      //      este paso puede fallar por RLS. Lo capturamos y seguimos.
      const authUser = data.user; // puede venir definido incluso si session es null
      if (authUser?.id) {
        // upsert asegura que si el trigger ya creó la fila, solo actualizamos campos
        const { error: upsertErr } = await supabase.from("profiles").upsert(
          {
            id: authUser.id,
            email: trimmedEmail,
            name: trimmedName,
            username: trimmedUsername || null,
            role: "CLIENT", // si tu enum/columna lo permite; si no, quítalo
          },
          { onConflict: "id", ignoreDuplicates: false }
        );

        // Si hay RLS y no hay sesión, esto podría fallar (lo avisamos de forma amable)
        if (upsertErr) {
          // console.log("profiles upsert (post-signup) falló:", upsertErr.message);
        }
      }

      // 3) Mensaje final y navegación
      //    Si tu proyecto requiere verificación por correo, aquí avisamos.
      Alert.alert(
        "Cuenta creada",
        "Revisa tu correo para verificar tu cuenta. Luego podrás iniciar sesión."
      );
      router.replace("/(auth)/login");
    } catch (e: any) {
      setErr(e?.message ?? "No fue posible crear la cuenta.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Create account
        </Text>
      </View>

      <View style={styles.card}>
        <Image
          source={require("../../assets/images/betapp-mark.png")}
          style={{ width: 56, height: 56, borderRadius: 12, marginBottom: 12 }}
          resizeMode="contain"
        />

        {/* NAME */}
        <Pressable style={styles.inputWrap} onPress={() => emailRef.current?.blur()}>
          <TextInput
            style={styles.input}
            placeholder="Nombre"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </Pressable>

        {/* USERNAME (opcional) */}
        <Pressable style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Username (opcional)"
            placeholderTextColor={COLORS.textMuted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </Pressable>

        {/* EMAIL */}
        <Pressable style={styles.inputWrap} onPress={() => emailRef.current?.focus()}>
          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
          />
        </Pressable>

        {/* PASSWORD */}
        <Pressable style={styles.inputWrap} onPress={() => passRef.current?.focus()}>
          <TextInput
            ref={passRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
        </Pressable>

        {/* CONFIRM PASSWORD */}
        <Pressable style={styles.inputWrap} onPress={() => confirmRef.current?.focus()}>
          <TextInput
            ref={confirmRef}
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
            autoCapitalize="none"
            value={confirm}
            onChangeText={setConfirm}
            returnKeyType="go"
            onSubmitEditing={handleRegister}
          />
        </Pressable>

        {/* Error */}
        {err ? <Text style={{ color: "#ff6b6b", marginTop: 10 }}>{err}</Text> : null}

        {/* CTA */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.cta, isLoading && { opacity: 0.6 }]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          <Text style={styles.ctaText}>{isLoading ? "Creando..." : "Crear cuenta"}</Text>
        </TouchableOpacity>
      </View>

      {/* Link a Login */}
      <View style={styles.signupRow}>
        <Text style={styles.signupText}>¿Ya tienes cuenta?</Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          activeOpacity={0.9}
          style={styles.signupBtn}
        >
          <Text style={styles.signupBtnText}>Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  input: { color: COLORS.text, fontSize: 16, paddingVertical: 0 },
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