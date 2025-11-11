import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/utils/supabase";

/** Paleta local */
const palette = {
  bg: "#0b0f1a",
  card: "#121829",
  text: "#e6f1ff",
  muted: "#8aa0b5",
  primary: "#00e0ff",
  accent: "#7c4dff",
  glow: "rgba(0, 224, 255, 0.35)",
  glowAccent: "rgba(124, 77, 255, 0.35)",
};

type Message = {
  id: string;
  chat_id: string;
  sent_by: string;
  text: string;
  created_at: string;
};

export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = String(id); // normaliza
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  // Carga inicial y quién soy
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (mounted) setMe(auth.user?.id ?? null);

        if (!chatId) return;
        const { data, error } = await supabase
          .from("messages")
          .select("id, chat_id, sent_by, text, created_at")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true });
        if (error) throw error;

        if (mounted) setMsgs(data ?? []);
      } catch (e) {
        console.error("CHAT LOAD ERROR:", e);
        Alert.alert("Error", "No se pudieron cargar los mensajes.");
      } finally {
        if (mounted) setLoading(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 30);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [chatId]);

  // Realtime: INSERT en messages del chat actual
  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel(`room-${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMsgs((prev) => [...prev, payload.new as Message]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        }
      )
      .subscribe((s) => {
        // console.log("Realtime status:", s);
        return s;
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  const send = async () => {
    try {
      const text = input.trim();
      if (!text) return;
      if (!me) {
        Alert.alert("Sesión", "Debes iniciar sesión.");
        return;
      }
      setSending(true);
      // INSERT con columnas correctas
      const { error } = await supabase
        .from("messages")
        .insert({ chat_id: chatId, sent_by: me, text });
      if (error) {
        console.error("CHAT SEND ERROR:", error);
        Alert.alert("No se pudo enviar", error.message ?? "Error al enviar el mensaje.");
        return;
      }
      setInput("");
      // El append lo hace Realtime; si quieres optimismo instantáneo, descomenta:
      // setMsgs((prev) => [...prev, { id: crypto.randomUUID(), chat_id: chatId, sent_by: me, text, created_at: new Date().toISOString() } as Message]);
    } catch (e: any) {
      console.error("CHAT SEND FATAL:", e);
      Alert.alert("Error", e?.message ?? "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item.sent_by === me;
    return (
      <View style={[styles.row, mine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
        <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
          <Text style={styles.msgText}>{item.text}</Text>
          <Text style={styles.time}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  if (!chatId) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: palette.muted }}>Missing chat id</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 76 : 0}
    >
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingTxt}>Loading messages…</Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />

          {/* Input */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message…"
              placeholderTextColor={palette.muted}
              multiline
            />
            <TouchableOpacity onPress={send} style={styles.sendBtn} disabled={sending}>
              <Text style={styles.sendTxt}>{sending ? "..." : "Send"}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingTxt: { color: palette.muted, marginTop: 10 },

  row: { width: "100%", marginVertical: 6, paddingHorizontal: 12 },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  mine: { backgroundColor: palette.accent, borderColor: palette.glowAccent },
  theirs: { backgroundColor: palette.card, borderColor: palette.glow },
  msgText: { color: palette.text, fontSize: 15 },
  time: { color: "#001218", opacity: 0.75, fontSize: 10, alignSelf: "flex-end", marginTop: 4 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(124,77,255,0.25)",
    backgroundColor: palette.card,
  },
  input: {
    flex: 1,
    color: palette.text,
    backgroundColor: "#0f1526",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.glow,
    maxHeight: 120,
  },
  sendBtn: {
    marginLeft: 10,
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  sendTxt: { color: "#001218", fontWeight: "800" },
});
