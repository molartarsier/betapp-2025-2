// --- TransactionModal.tsx (inline en settings.tsx) ---
import React, { useState, useMemo } from "react";
import { supabase } from "@/utils/supabase";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const palette = {
  bg: "#0b0f1a",
  card: "#121829",
  text: "#e6f1ff",
  muted: "#8aa0b5",
  primary: "#00e0ff",
  accent: "#7c4dff",
  success: "#1be7a2",
  danger: "#ff6b6b",
  glow: "rgba(0, 224, 255, 0.35)",
};

type TxType = "in" | "out";

export function TransactionModal({
  visible,
  type,
  onClose,
  onCreated,
}: {
  visible: boolean;
  type: TxType;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => (type === "in" ? "Deposit" : "Withdraw"), [type]);
  const action = useMemo(() => (type === "in" ? "Add deposit" : "Add expense"), [type]);

  const save = async () => {
    try {
      const raw = amount.replace(/,/g, ".").trim();
      const n = Number(raw);
      if (!raw || Number.isNaN(n) || n <= 0) {
        Alert.alert("Monto inválido", "Ingresa un valor numérico mayor a 0.");
        return;
      }

      setBusy(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        Alert.alert("Sesión", "Debes iniciar sesión.");
        return;
      }

      const { data, error } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: uid,
          amount: n,
          type,
          description: desc?.trim() || null,
        })
        .select("id")
        .single();

      if (error) throw error;
      setAmount("");
      setDesc("");
      onCreated(data!.id);
    } catch (e: any) {
      console.error("WALLET CREATE ERROR:", e);
      Alert.alert("No se pudo guardar", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={stylesM.backdrop}
      >
        <View style={stylesM.card}>
          <Text style={stylesM.title}>{title}</Text>

          <Text style={stylesM.label}>Amount</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={palette.muted}
            style={stylesM.input}
          />

          <Text style={[stylesM.label, { marginTop: 10 }]}>Description (optional)</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder={type === "in" ? "Deposit" : "Expense"}
            placeholderTextColor={palette.muted}
            style={stylesM.input}
          />

          <View style={stylesM.row}>
            <TouchableOpacity style={[stylesM.btn, stylesM.btnGhost]} onPress={onClose} disabled={busy}>
              <Text style={stylesM.btnGhostTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[stylesM.btn, stylesM.btnPrimary]} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color="#001218" /> : <Text style={stylesM.btnPrimaryTxt}>{action}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const stylesM = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.glow,
  },
  title: { color: palette.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  label: { color: palette.muted, fontSize: 12, marginTop: 4 },
  input: {
    color: palette.text,
    backgroundColor: "#0f1526",
    borderWidth: 1,
    borderColor: palette.glow,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  row: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14, columnGap: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  btnGhost: { borderWidth: 1, borderColor: palette.glow },
  btnGhostTxt: { color: palette.text, fontWeight: "700" },
  btnPrimary: { backgroundColor: palette.primary },
  btnPrimaryTxt: { color: "#001218", fontWeight: "800" },
});