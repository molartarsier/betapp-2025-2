// app/main/(tabs)/wallet.tsx
import { supabase } from "@/utils/supabase";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/** Paleta local (oscuro/neón) */
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
  glowAccent: "rgba(124,77,255,0.35)",
};

type Tx = {
  id: string;
  user_id: string;
  amount: number;
  type: "in" | "out";
  description: string | null;
  created_at: string;
};

export default function WalletScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Tx[]>([]);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const formatMoney = useCallback((n: number) => {
    try {
      return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
    } catch {
      return `$${n.toFixed(0)}`;
    }
  }, []);

  const formatWhen = useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }, []);

  const balance = useMemo(() => {
    return items.reduce((acc, tx) => acc + (tx.type === "in" ? tx.amount : -tx.amount), 0);
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((t) => t.type === filter);
  }, [items, filter]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMe(uid);
      if (!uid) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id,user_id,amount,type,description,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setItems((data ?? []) as Tx[]);
    } catch (e) {
      console.error("WALLET LOAD ERROR:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: escucha cambios del usuario
  useEffect(() => {
    if (!me) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`wallet-${me}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${me}` },
        () => load()
      )
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [me, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const Header = () => (
    <View style={styles.headerCard}>
      <Text style={styles.cardLabel}>Current balance</Text>
      <Text style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(balance)}
      </Text>

      {/* Filtros en scroll horizontal para evitar desbordes */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <TouchableOpacity
          style={[styles.chip, filter === "all" && styles.chipActive]}
          onPress={() => setFilter("all")}
        >
          <Text style={[styles.chipText, filter === "all" && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filter === "in" && styles.chipActive]}
          onPress={() => setFilter("in")}
        >
          <Text style={[styles.chipText, filter === "in" && styles.chipTextActive]}>Income</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filter === "out" && styles.chipActive]}
          onPress={() => setFilter("out")}
        >
          <Text style={[styles.chipText, filter === "out" && styles.chipTextActive]}>Expense</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const renderItem = ({ item }: { item: Tx }) => {
    const isIn = item.type === "in";
    return (
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: isIn ? palette.success : palette.danger }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.description || (isIn ? "Income" : "Expense")}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {formatWhen(item.created_at)}
          </Text>
        </View>
        <Text
          style={[styles.rowAmt, { color: isIn ? palette.success : palette.danger }]}
          numberOfLines={1}
        >
          {isIn ? "+" : "-"}
          {formatMoney(item.amount)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {loading && items.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={styles.loadingTxt}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            ListHeaderComponent={Header}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
            }
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No movements</Text>
                <Text style={styles.emptySub}>Your transactions will appear here.</Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingTop: Platform.OS === "android" ? 8 : 0, // margen contra status bar en Android
  },
  container: { flex: 1, paddingHorizontal: 12 },
  listContent: { paddingBottom: 24 },

  headerCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.glowAccent,
    shadowColor: palette.accent,
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  cardLabel: { color: palette.muted, fontSize: 13 },
  cardValue: { color: palette.text, fontSize: 28, fontWeight: "800", marginTop: 6 },

  filters: { paddingTop: 10, paddingBottom: 2, columnGap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.glow,
    backgroundColor: "#0f1526",
  },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { color: palette.muted, fontWeight: "700" },
  chipTextActive: { color: "#001218" },

  loadingWrap: { alignItems: "center", marginTop: 40 },
  loadingTxt: { color: palette.muted, marginTop: 10 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(124,77,255,0.25)",
  },
  sep: { height: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  rowTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  rowSub: { color: palette.muted, fontSize: 12, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: "800", marginLeft: 8, maxWidth: 120, textAlign: "right" },

  empty: { alignItems: "center", marginTop: 48 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  emptySub: { color: palette.muted, fontSize: 13, marginTop: 6 },
});