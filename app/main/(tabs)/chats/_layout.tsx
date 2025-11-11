import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/** Paleta local por archivo (neón/oscuro) */
const palette = {
  bg: "#0b0f1a",
  card: "#121829",
  text: "#e6f1ff",
  muted: "#8aa0b5",
  primary: "#00e0ff",
  accent: "#7c4dff",
  glow: "rgba(0, 224, 255, 0.35)",
};

type Profile = {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url?: string | null;
};

export default function ChatsStackLayout() {
  const router = useRouter();

  // Modal Search
  const [modalVisible, setModalVisible] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Profile[]>([]);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- SEARCH: debounce + query por username
  const runSearch = useCallback(async (term: string) => {
    try {
      setSearching(true);
      setErrorMsg(null);

      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? null;

      let query = supabase
        .from("profiles")
        .select("id,name,username,avatar_url")
        .ilike("username", `%${term}%`)
        .order("username", { ascending: true })
        .limit(25);

      if (me) query = query.neq("id", me);

      const { data, error } = await query;
      if (error) throw error;
      setResults(data ?? []);
    } catch (e) {
      console.error("search users error:", e);
      setResults([]);
      setErrorMsg("Error al buscar usuarios.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!modalVisible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const term = q.trim();
      if (term.length >= 2) runSearch(term);
      else setResults([]);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, modalVisible, runSearch]);

  const openSearchModal = useCallback(() => {
    setQ("");
    setResults([]);
    setErrorMsg(null);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    if (!creatingFor) setModalVisible(false);
  }, [creatingFor]);

  // --- Crear / abrir chat desde userId
  const openOrCreateChatWith = useCallback(
    async (otherId: string) => {
      try {
        setCreatingFor(otherId);
        setErrorMsg(null);

        const { data: auth } = await supabase.auth.getUser();
        const me = auth.user?.id;
        if (!me) {
          setErrorMsg("Inicia sesión para chatear.");
          return;
        }
        if (otherId === me) {
          setErrorMsg("No puedes chatear contigo mismo.");
          return;
        }

        let chatId: string | undefined;

        // 1) RPC recomendado (si existe)
        try {
          const { data: rpcData, error: rpcErr } = await supabase
            .rpc("get_or_create_chat", { partner: otherId });
          if (!rpcErr && rpcData?.id) {
            chatId = rpcData.id as string;
          }
        } catch {
          // si no existe RPC, seguimos al fallback
        }

        // 2) Fallback manual
        if (!chatId) {
          const pairFilter =
            `and(user_id.eq.${me},user_id2.eq.${otherId}),` +
            `and(user_id.eq.${otherId},user_id2.eq.${me})`;

          const { data: existing, error: existingErr } = await supabase
            .from("chats")
            .select("id")
            .or(pairFilter)
            .maybeSingle();
          if (existingErr) throw existingErr;

          if (existing?.id) {
            chatId = existing.id;
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from("chats")
              .insert({ user_id: me, user_id2: otherId })
              .select("id")
              .single();
            if (insertErr) throw insertErr;
            chatId = inserted.id;
          }
        }

        if (!chatId) throw new Error("No se pudo obtener el id del chat.");

        setModalVisible(false);
        router.push(`/main/chats/${chatId}`); // [id].tsx
      } catch (err: any) {
        console.error("CHAT CREATE ERROR:", err);
        const msg =
          err?.message ||
          err?.hint ||
          (typeof err === "string" ? err : "No se pudo iniciar el chat.");
        setErrorMsg(msg);
        Alert.alert("Error al crear chat", msg);
      } finally {
        setCreatingFor(null);
      }
    },
    [router]
  );

  const renderResult = useCallback(
    ({ item }: { item: Profile }) => {
      const name = item.name || item.username || "Usuario";
      const avatar = item.avatar_url || "";
      const busy = creatingFor === item.id;
      return (
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => openOrCreateChatWith(item.id)}
          disabled={!!creatingFor}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.userAvatar, { backgroundColor: palette.accent, opacity: 0.9 }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>{name}</Text>
            {item.username ? <Text style={styles.userSub}>@{item.username}</Text> : null}
          </View>
          {busy ? <ActivityIndicator size="small" color={palette.primary} /> : null}
        </TouchableOpacity>
      );
    },
    [creatingFor, openOrCreateChatWith]
  );

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.card },
          headerTitleStyle: { color: palette.text },
          headerTintColor: palette.primary,
          contentStyle: { backgroundColor: palette.bg },
          animation: Platform.select({ ios: "default", android: "fade_from_bottom" }),
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Chats",
            headerRight: () => (
              <TouchableOpacity style={styles.headerBtn} onPress={openSearchModal}>
                <Ionicons name="search" size={20} color={palette.primary} />
              </TouchableOpacity>
            ),
          }}
        />
        {/* Asegúrate que el archivo exista como [id].tsx (minúscula) */}
        <Stack.Screen name="[id]" options={{ title: "Chat" }} />
      </Stack>

      {/* SEARCH MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Buscar usuario</Text>
              <TouchableOpacity onPress={closeModal} disabled={!!creatingFor}>
                <Ionicons name="close" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="at" size={16} color={palette.muted} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="username…"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>

            {searching ? (
              <View style={styles.centerWrap}>
                <ActivityIndicator size="large" color={palette.primary} />
              </View>
            ) : results.length ? (
              <FlatList
                data={results}
                keyExtractor={(it) => it.id}
                renderItem={renderResult}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                contentContainerStyle={{ paddingVertical: 8 }}
                keyboardShouldPersistTaps="handled"
              />
            ) : q.trim().length >= 2 ? (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>No se encontraron usuarios.</Text>
              </View>
            ) : (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>Escribe al menos 2 caracteres.</Text>
              </View>
            )}

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    marginRight: 8,
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: "rgba(0, 224, 255, 0.12)",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(124,77,255,0.35)",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { color: palette.text, fontSize: 18, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f1526",
    borderWidth: 1,
    borderColor: palette.glow,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
  },
  centerWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  emptyText: { color: palette.muted },
  errorText: { color: "#ff6b6b", marginTop: 12, textAlign: "center" },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#222",
    marginRight: 10,
  },
  userName: { color: palette.text, fontSize: 16, fontWeight: "700" },
  userSub: { color: palette.muted, fontSize: 12 },

  separator: { height: 1, backgroundColor: "rgba(124,77,255,0.25)" },
});