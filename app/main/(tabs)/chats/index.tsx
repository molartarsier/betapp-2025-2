import { supabase } from "@/utils/supabase";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/** Paleta local (neón/oscuro) */
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

type Profile = {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Row = {
  id: string;
  user_id: string;
  user_id2: string;
  updated_at: string;
  messages?: { text: string; created_at: string; sent_by: string }[];
};

type ChatItem = {
  id: string;
  other: Profile | null;
  lastText: string | null;
  lastAt: string | null;
  updated_at: string;
};

export default function ChatsList() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const meRef = useRef<string | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const cleanupChannels = () => {
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current = [];
  };

  const timePretty = (iso?: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const hydrate = (rows: Row[], profilesMap: Record<string, Profile>, me: string): ChatItem[] => {
    return rows.map((r) => {
      const otherId = r.user_id === me ? r.user_id2 : r.user_id;
      const last = r.messages && r.messages[0] ? r.messages[0] : null;
      return {
        id: r.id,
        other: profilesMap[otherId] || null,
        lastText: last?.text ?? null,
        lastAt: last?.created_at ?? null,
        updated_at: r.updated_at,
      };
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? null;
      meRef.current = me;
      if (!me) {
        setItems([]);
        return;
      }

      // 1) Traer mis chats con ÚLTIMO mensaje embebido
      //    PostgREST: seleccionar relación messages y limitarla a 1, orden desc por created_at
      const { data: rows, error } = await supabase
        .from("chats")
        .select(
          "id,user_id,user_id2,updated_at, messages(text,created_at,sent_by)"
        )
        .or(`user_id.eq.${me},user_id2.eq.${me}`)
        .order("updated_at", { ascending: false })
        .order("created_at", { foreignTable: "messages", ascending: false })
        .limit(1, { foreignTable: "messages" });

      if (error) throw error;
      const list = (rows ?? []) as Row[];

      // 2) Traer perfiles del "otro" usuario
      const otherIds = Array.from(
        new Set(
          list.map((r) => (r.user_id === me ? r.user_id2 : r.user_id))
        )
      );
      let profilesMap: Record<string, Profile> = {};
      if (otherIds.length) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id,name,username,avatar_url")
          .in("id", otherIds);
        if (pErr) throw pErr;
        profs?.forEach((p) => (profilesMap[p.id] = p as Profile));
      }

      const hydrated = hydrate(list, profilesMap, me);
      setItems(hydrated);

      // 3) Suscripciones Realtime: mensajes por chat + nuevos chats del usuario
      cleanupChannels();

      // 3a) Nuevos mensajes en cada chat -> actualizar preview y reordenar
      hydrated.forEach((c) => {
        const ch = supabase
          .channel(`list-msg-${c.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${c.id}` },
            (payload) => {
              const m = payload.new as { text: string; created_at: string };
              setItems((prev) => {
                const copy = [...prev];
                const i = copy.findIndex((x) => x.id === c.id);
                if (i >= 0) {
                  copy[i] = {
                    ...copy[i],
                    lastText: m.text,
                    lastAt: m.created_at,
                    // updated_at se actualizará por trigger en DB; usamos lastAt para ordenar en UI de inmediato
                  };
                  // mover al tope por último mensaje
                  copy.sort((a, b) => {
                    const A = new Date(a.lastAt ?? a.updated_at).getTime();
                    const B = new Date(b.lastAt ?? b.updated_at).getTime();
                    return B - A;
                  });
                }
                return copy;
              });
            }
          )
          .subscribe();
        channelsRef.current.push(ch);
      });

      // 3b) Nuevos CHATS donde participo (user_id = me)
      const chA = supabase
        .channel(`list-chats-a-${me}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chats", filter: `user_id=eq.${me}` },
          async (payload) => {
            const row = payload.new as Row;
            const otherId = row.user_id === me ? row.user_id2 : row.user_id;
            // traer perfil del otro
            const { data: pr } = await supabase
              .from("profiles")
              .select("id,name,username,avatar_url")
              .eq("id", otherId)
              .maybeSingle();
            const other = pr as Profile | null;

            setItems((prev) => {
              // evita duplicar si ya lo tenemos
              if (prev.some((x) => x.id === row.id)) return prev;
              const next: ChatItem = {
                id: row.id,
                other,
                lastText: null,
                lastAt: null,
                updated_at: row.updated_at,
              };
              return [next, ...prev];
            });

            // abre canal para ese chat
            const ch = supabase
              .channel(`list-msg-${row.id}`)
              .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${row.id}` },
                (p2) => {
                  const m = p2.new as { text: string; created_at: string };
                  setItems((prev) => {
                    const copy = [...prev];
                    const i = copy.findIndex((x) => x.id === row.id);
                    if (i >= 0) {
                      copy[i] = { ...copy[i], lastText: m.text, lastAt: m.created_at };
                      copy.sort((a, b) => {
                        const A = new Date(a.lastAt ?? a.updated_at).getTime();
                        const B = new Date(b.lastAt ?? b.updated_at).getTime();
                        return B - A;
                      });
                    }
                    return copy;
                  });
                }
              )
              .subscribe();
            channelsRef.current.push(ch);
          }
        )
        .subscribe();
      channelsRef.current.push(chA);

      // 3c) Nuevos CHATS donde participo (user_id2 = me)
      const chB = supabase
        .channel(`list-chats-b-${me}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chats", filter: `user_id2=eq.${me}` },
          async (payload) => {
            const row = payload.new as Row;
            const otherId = row.user_id === me ? row.user_id2 : row.user_id;
            const { data: pr } = await supabase
              .from("profiles")
              .select("id,name,username,avatar_url")
              .eq("id", otherId)
              .maybeSingle();
            const other = pr as Profile | null;

            setItems((prev) => {
              if (prev.some((x) => x.id === row.id)) return prev;
              const next: ChatItem = {
                id: row.id,
                other,
                lastText: null,
                lastAt: null,
                updated_at: row.updated_at,
              };
              return [next, ...prev];
            });

            const ch = supabase
              .channel(`list-msg-${row.id}`)
              .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${row.id}` },
                (p2) => {
                  const m = p2.new as { text: string; created_at: string };
                  setItems((prev) => {
                    const copy = [...prev];
                    const i = copy.findIndex((x) => x.id === row.id);
                    if (i >= 0) {
                      copy[i] = { ...copy[i], lastText: m.text, lastAt: m.created_at };
                      copy.sort((a, b) => {
                        const A = new Date(a.lastAt ?? a.updated_at).getTime();
                        const B = new Date(b.lastAt ?? b.updated_at).getTime();
                        return B - A;
                      });
                    }
                    return copy;
                  });
                }
              )
              .subscribe();
            channelsRef.current.push(ch);
          }
        )
        .subscribe();
      channelsRef.current.push(chB);
    } catch (e) {
      console.error("Chats load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => cleanupChannels();
  }, [load]);

  const openChat = (id: string) => {
    router.push(`/main/chats/${id}`);
  };

  const renderItem = ({ item }: { item: ChatItem }) => {
    const name = item.other?.name || item.other?.username || "Usuario";
    const avatar = item.other?.avatar_url || "";
    return (
      <TouchableOpacity style={styles.item} onPress={() => openChat(item.id)}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: palette.accent, opacity: 0.9 }]} />
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.time}>{timePretty(item.lastAt ?? item.updated_at)}</Text>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {item.lastText ?? "Say hi 👋"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Chats</Text>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshTxt}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingTxt}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />
          }
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySub}>Start a new chat from + (Add).</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg, padding: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: palette.text, fontSize: 22, fontWeight: "800" },
  refreshBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: palette.primary,
  },
  refreshTxt: { color: "#001218", fontWeight: "800" },

  loadingWrap: { alignItems: "center", marginTop: 40 },
  loadingTxt: { color: palette.muted, marginTop: 10 },

  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.glowAccent,
    shadowColor: palette.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: "#222" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: palette.text, fontSize: 16, fontWeight: "700", maxWidth: "72%" },
  time: { color: palette.muted, fontSize: 12 },
  subtitle: { color: palette.muted, marginTop: 4, fontSize: 13 },

  empty: { alignItems: "center", marginTop: 48 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  emptySub: { color: palette.muted, fontSize: 13, marginTop: 6 },
});