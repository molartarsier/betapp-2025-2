import { supabase } from "@/utils/supabase";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import LottieView from "lottie-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";



// 👇 Lottie dinámico (evita romper web)
type LottieType = React.ComponentType<{
  source: any;
  autoPlay?: boolean;
  loop?: boolean;
  style?: any;
}>;

const useLottie = () => {
  const [Comp, setComp] = useState<LottieType | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (Platform.OS === "web") return; // evita importar la lib en web
      const mod = await import("lottie-react-native");
      if (mounted) setComp(() => mod.default as unknown as LottieType);
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);
  return Comp;
};

// ⚙️ Colores del tema
const COLORS = {
  bg: "#0B0F12",
  card: "#0E141A",
  text: "#F5F7FA",
  textMuted: "#9AA5B1",
  primary: "#23D6FF",
  win: "#B4F461",
  border: "#1C2430",
};

type BetLite = {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  cost: number | null;
  created_at: string;
  status?: string | null;
  is_active?: boolean | null;
};

type StatusFilter = "all" | "active" | "inactive";

export default function HomeScreen() {
  const router = useRouter();

  /* ---------- anim micro wave ---------- */
  const wave = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wave, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [wave]);

  /* ---------- state ---------- */
  const [uid, setUid] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<BetLite[]>([]);
  const [loadingBets, setLoadingBets] = useState(true);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // deposit/withdraw modals
  const [showDeposit, setShowDeposit] = useState(false);
  const [depAmount, setDepAmount] = useState("");
  const [depBusy, setDepBusy] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wdAmount, setWdAmount] = useState("");
  const [wdBusy, setWdBusy] = useState(false);

  // search + filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minCost, setMinCost] = useState<string>("");
  const [maxCost, setMaxCost] = useState<string>("");

  // realtime channels
  const chBetsRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chWalletRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* ---------- helpers ---------- */
  const formatMoney = (n?: number | null) => {
    if (n === null || n === undefined) return "$ 0";
    try {
      return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
    } catch {
      return `$ ${Number(n).toFixed(0)}`;
    }
  };

  const parseNum = (s: string) => {
    const n = Number((s || "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : undefined;
  };

  /* ---------- load user/profile ---------- */
  const loadUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const _uid = data.user?.id ?? null;
    setUid(_uid);

    if (_uid) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("username,name")
        .eq("id", _uid)
        .maybeSingle();
      setUsername((prof?.username as string) || (prof?.name as string) || null);
    } else {
      setUsername(null);
    }
  }, []);

  /* ---------- load wallet balance ---------- */
  const computeBalance = useCallback(async (_uid: string) => {
    try {
      setLoadingWallet(true);
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("amount,type")
        .eq("user_id", _uid);
      if (error) throw error;
      const total =
        data?.reduce((acc, x) => acc + (x.type === "in" ? Number(x.amount) : -Number(x.amount)), 0) ?? 0;
      setBalance(total);
    } catch (e) {
      console.error("HOME BALANCE ERROR:", e);
      setBalance(0);
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  /* ---------- deposit/withdraw ---------- */
  const deposit = async () => {
    try {
      const amount = Number((depAmount || "").replace(/,/g, "."));
      if (Number.isNaN(amount) || amount <= 0) {
        Alert.alert("Monto inválido", "Ingresa un valor mayor que 0.");
        return;
      }
      if (!uid) {
        Alert.alert("Sesión", "Debes iniciar sesión.");
        return;
      }
      setDepBusy(true);
      const { error } = await supabase
        .from("wallet_transactions")
        .insert({ user_id: uid, amount, type: "in", description: "Deposit" });
      if (error) throw error;
      setShowDeposit(false);
      setDepAmount("");
    } catch (e: any) {
      console.error("DEPOSIT ERROR:", e);
      Alert.alert("No se pudo depositar", e?.message ?? "Revisa tus permisos.");
    } finally {
      setDepBusy(false);
    }
  };

  const withdraw = async () => {
    try {
      const amount = Number((wdAmount || "").replace(/,/g, "."));
      if (Number.isNaN(amount) || amount <= 0) {
        Alert.alert("Monto inválido", "Ingresa un valor mayor que 0.");
        return;
      }
      if (!uid) {
        Alert.alert("Sesión", "Debes iniciar sesión.");
        return;
      }
      if (amount > balance) {
        Alert.alert("Saldo insuficiente", "No puedes retirar más que tu balance disponible.");
        return;
      }
      setWdBusy(true);
      const { error } = await supabase
        .from("wallet_transactions")
        .insert({ user_id: uid, amount, type: "out", description: "Withdraw" });
      if (error) throw error;
      setShowWithdraw(false);
      setWdAmount("");
    } catch (e: any) {
      console.error("WITHDRAW ERROR:", e);
      Alert.alert("No se pudo retirar", e?.message ?? "Revisa tus permisos.");
    } finally {
      setWdBusy(false);
    }
  };

  /* ---------- search debounce ---------- */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  /* ---------- build & run bet query ---------- */
  const loadFilteredBets = useCallback(async () => {
    try {
      setLoadingBets(true);

      const like = debouncedSearch ? `%${debouncedSearch.replace(/[%_]/g, "\\$&")}%` : undefined;
      const min = parseNum(minCost);
      const max = parseNum(maxCost);

      const buildBase = () =>
        supabase
          .from("bets")
          .select("id,title,description,image_url,cost,created_at,status,is_active")
          .order("created_at", { ascending: false })
          .limit(50);

      const applyCommon = (q: any) => {
        let _q = q;
        if (like) _q = _q.or(`title.ilike.${like},description.ilike.${like}`);
        if (min !== undefined) _q = _q.gte("cost", min);
        if (max !== undefined) _q = _q.lte("cost", max);
        return _q;
      };

      let q1 = applyCommon(buildBase());
      if (statusFilter === "active") q1 = q1.eq("status", "active");
      if (statusFilter === "inactive") q1 = q1.eq("status", "inactive");

      let { data, error } = await q1;

      if (error && /status/.test(error.message || "")) {
        let q2 = applyCommon(
          supabase
            .from("bets")
            .select("id,title,description,image_url,cost,created_at,is_active")
            .order("created_at", { ascending: false })
            .limit(50)
        );
        if (statusFilter === "active") q2 = q2.eq("is_active", true);
        if (statusFilter === "inactive") q2 = q2.eq("is_active", false);

        const r2 = await q2;
        if (r2.error) {
          const q3 = applyCommon(
            supabase
              .from("bets")
              .select("id,title,description,image_url,cost,created_at")
              .order("created_at", { ascending: false })
              .limit(50)
          );
          const r3 = await q3;
          if (r3.error) throw r3.error;
          setBets((r3.data ?? []) as BetLite[]);
        } else {
          setBets((r2.data ?? []) as BetLite[]);
        }
      } else {
        setBets((data ?? []) as BetLite[]);
      }
    } catch (e) {
      console.error("HOME LOAD BETS ERROR:", e);
      setBets([]);
    } finally {
      setLoadingBets(false);
    }
  }, [debouncedSearch, statusFilter, minCost, maxCost]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadFilteredBets();
      if (uid) await computeBalance(uid);
    } finally {
      setRefreshing(false);
    }
  }, [loadFilteredBets, uid, computeBalance]);

  /* ---------- effects ---------- */
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!uid) return;
    computeBalance(uid);
  }, [uid, computeBalance]);

  useEffect(() => {
    loadFilteredBets();
  }, [loadFilteredBets]);

  useEffect(() => {
    if (chBetsRef.current) {
      supabase.removeChannel(chBetsRef.current);
      chBetsRef.current = null;
    }
    const ch = supabase
      .channel("home-bets")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, () => loadFilteredBets())
      .subscribe();
    chBetsRef.current = ch;
    return () => {
      if (chBetsRef.current) supabase.removeChannel(chBetsRef.current);
      chBetsRef.current = null;
    };
  }, [loadFilteredBets]);

  useEffect(() => {
    if (!uid) return;
    if (chWalletRef.current) {
      supabase.removeChannel(chWalletRef.current);
      chWalletRef.current = null;
    }
    const ch = supabase
      .channel("home-wallet")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${uid}` },
        () => computeBalance(uid)
      )
      .subscribe();
    chWalletRef.current = ch;
    return () => {
      if (chWalletRef.current) supabase.removeChannel(chWalletRef.current);
      chWalletRef.current = null;
    };
  }, [uid, computeBalance]);

  /* ---------- actions ---------- */
  const goToBet = (betId: string) => {
    router.push({ pathname: "/main/bets", params: { focus: betId } });
  };

  /* ---------- MINIJUEGO: Coin Flip ---------- */
  const LottieView = useLottie();
  const COIN = require("@/assets/lottie/coin.json"); // <-- ajusta si tu ruta es distinta

  // reglas del juego
  const ENTRY_COST = 200; // COP
  const REWARDS = [0, 50, 100, 200, 500, 1000]; // posibles premios
  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState<number | null>(null);

  const playMiniGame = async () => {
    try {
      if (!uid) {
        Alert.alert("Inicia sesión", "Debes iniciar sesión para jugar.");
        return;
      }
      if (balance < ENTRY_COST) {
        Alert.alert("Saldo insuficiente", `Necesitas al menos ${formatMoney(ENTRY_COST)} para jugar.`);
        return;
      }
      setSpinning(true);

      // “animación” corta simulada
      await new Promise((r) => setTimeout(r, 1200));

      // premio aleatorio (simple, puedes ponderarlo si quieres)
      const reward = REWARDS[Math.floor(Math.random() * REWARDS.length)];
      const delta = reward - ENTRY_COST;

      // registramos neto en la billetera
      const tx =
        delta >= 0
          ? { user_id: uid, amount: delta, type: "in" as const, description: `MiniGame +${reward} (cost ${ENTRY_COST})` }
          : { user_id: uid, amount: Math.abs(delta), type: "out" as const, description: `MiniGame +${reward} (cost ${ENTRY_COST})` };

      const { error } = await supabase.from("wallet_transactions").insert(tx);
      if (error) throw error;

      setLastWin(reward);
      // computeBalance se actualizará por realtime, pero por si acaso:
      // await computeBalance(uid);

      if (reward === 0) {
        Alert.alert("¡Sigue intentando!", `No ganaste esta vez. -${formatMoney(ENTRY_COST)}`);
      } else {
        Alert.alert("¡Ganaste!", `Premio: ${formatMoney(reward)} (costo ${formatMoney(ENTRY_COST)})`);
      }
    } catch (e: any) {
      console.error("MINIGAME ERROR:", e);
      Alert.alert("Error", e?.message ?? "No se pudo jugar en este momento.");
    } finally {
      setSpinning(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../../assets/images/betapp-mark.png")}
            style={{ width: 28, height: 28, borderRadius: 8, marginRight: 8 }}
          />
          <Text style={styles.brand}>BetApp</Text>
        </View>
        <Ionicons name="notifications-outline" size={22} color={COLORS.textMuted} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor="#0B1218"
          />
        }
      >
        {/* Hero Card */}
        <View style={styles.card}>
          <Text style={styles.hello}>
            Hey, <Text style={styles.helloUser}>{username || "player"}</Text> 👋
          </Text>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceValue}>
            {loadingWallet ? "…" : formatMoney(balance)}
          </Text>

          {/* wave */}
          <Animated.View
            style={[
              styles.waveBar,
              {
                transform: [
                  {
                    translateY: wave.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -4],
                    }),
                  },
                ],
                opacity: wave.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
              },
            ]}
          />

          {/* Deposit / withdraw */}
          <View style={styles.quickRow}>
            <Pressable style={styles.quickBtn} onPress={() => setShowDeposit(true)}>
              <Ionicons name="card-outline" size={18} color={COLORS.primary} />
              <Text style={styles.quickText}>Deposit</Text>
            </Pressable>

            <Pressable style={styles.quickBtn} onPress={() => setShowWithdraw(true)}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} />
              <Text style={styles.quickText}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        {/* ---------- MINIJUEGO CARD ---------- */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.sectionTitle}>Coin Flip</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="pricetag-outline" size={14} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                Costo: <Text style={{ color: COLORS.primary, fontWeight: "800" }}>{formatMoney(ENTRY_COST)}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.gameRow}>
            <View style={styles.gameAnimBox}>
              {LottieView ? (
                <LottieView source={COIN} autoPlay={spinning} loop={spinning} style={{ width: 110, height: 110 }} />
              ) : (
                // Fallback web: icono grande con pulso
                <View style={styles.coinFallback}>
                  <Ionicons name="logo-bitcoin" size={48} color={COLORS.primary} />
                </View>
              )}
            </View>

            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                Toca “Jugar” para lanzar la ficha. Puedes ganar hasta{" "}
                <Text style={{ color: COLORS.win, fontWeight: "800" }}>{formatMoney(Math.max(...REWARDS))}</Text>.
              </Text>

              {lastWin !== null && (
                <View style={[styles.oddPill, { alignSelf: "flex-start", marginTop: 10 }]}>
                  <Ionicons name="trophy-outline" size={14} color={COLORS.win} />
                  <Text style={styles.oddKey}>Último premio</Text>
                  <Text style={styles.oddVal}>{formatMoney(lastWin)}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, spinning && { opacity: 0.6 }]}
                onPress={playMiniGame}
                disabled={spinning}
              >
                {spinning ? (
                  <ActivityIndicator color="#001218" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>Jugar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Search + Filters */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bets…"
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} style={{ padding: 6 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>

          <Pressable style={styles.filterBtn} onPress={() => setFilterVisible(true)}>
            <Ionicons name="options-outline" size={16} color={COLORS.primary} />
            <Text style={styles.filterTxt}>Filter</Text>
          </Pressable>
        </View>

        {/* Active bets (filtered) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Results</Text>
          <Pressable onPress={() => router.push("/main/bets")}>
            <Text style={{ color: COLORS.primary, fontWeight: "700" }}>See all</Text>
          </Pressable>
        </View>

        {loadingBets ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : bets.length === 0 ? (
          /* ✅ Empty state con Lottie */
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>
              <LottieView
                source={
                  require("../../../assets/lottie/fall.json")
                }
                autoPlay
                loop
                style={styles.emptyLottie}
              />
              <Text style={styles.emptyTitle}>No hay apuestas activas</Text>
              <Text style={styles.emptyDesc}>
                Ajusta los filtros o prueba una nueva búsqueda. Cuando haya eventos,
                aparecerán aquí.
              </Text>

              <Pressable style={styles.emptyBtn} onPress={onRefresh}>
                <Ionicons name="refresh" size={16} color="#001218" />
                <Text style={styles.emptyBtnTxt}>Recargar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {bets.map((b) => (
              <Pressable
                key={b.id}
                style={styles.eventCard}
                android_ripple={{ color: "#13202a" }}
                onPress={() => goToBet(b.id)}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{b.title || "Bet"}</Text>
                </View>

                {b.image_url ? (
                  <Image source={{ uri: b.image_url }} style={styles.eventImage} />
                ) : null}

                <Text style={[styles.eventMarket, { marginTop: 8 }]} numberOfLines={2}>
                  {b.description || "No description"}
                </Text>

                <View style={styles.oddsRow}>
                  <View style={styles.oddPill}>
                    <Ionicons name="cash-outline" size={14} color={COLORS.win} />
                    <Text style={styles.oddKey}>Cost</Text>
                    <Text style={styles.oddVal}>{formatMoney(b.cost ?? 0)}</Text>
                  </View>
                  <View style={[styles.oddPill, { borderColor: "#1a2a36" }]}>
                    <Ionicons name="arrow-forward-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.oddKey}>Tap to open</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Deposit modal */}
      <Modal
        visible={showDeposit}
        onRequestClose={() => setShowDeposit(false)}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Deposit</Text>
              <TouchableOpacity onPress={() => setShowDeposit(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={depAmount}
              onChangeText={setDepAmount}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={deposit} disabled={depBusy}>
              {depBusy ? <ActivityIndicator color="#001218" /> : <Text style={styles.primaryBtnTxt}>Confirm deposit</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Withdraw modal */}
      <Modal
        visible={showWithdraw}
        onRequestClose={() => setShowWithdraw(false)}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Withdraw</Text>
              <TouchableOpacity onPress={() => setShowWithdraw(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={wdAmount}
              onChangeText={setWdAmount}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={withdraw} disabled={wdBusy}>
              {wdBusy ? <ActivityIndicator color="#001218" /> : <Text style={styles.primaryBtnTxt}>Confirm withdraw</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter modal */}
      <Modal
        visible={filterVisible}
        onRequestClose={() => setFilterVisible(false)}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filter bets</Text>
              <TouchableOpacity onPress={() => setFilterVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Status chips */}
            <Text style={styles.label}>Status</Text>
            <View style={styles.chipsRow}>
              {(["all", "active", "inactive"] as StatusFilter[]).map((s) => {
                const active = statusFilter === s;
                return (
                  <Pressable
                    key={s}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setStatusFilter(s)}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Cost range */}
            <Text style={styles.label}>Cost range (COP)</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={minCost}
                onChangeText={setMinCost}
                placeholder="Min"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={maxCost}
                onChangeText={setMaxCost}
                placeholder="Max"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 16 }]}
              onPress={() => setFilterVisible(false)}
            >
              <Text style={styles.primaryBtnTxt}>Apply</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg, paddingTop: Platform.OS === "android" ? 8 : 0 },
  header: { height: 48, alignItems: "center", justifyContent: "space-between", flexDirection: "row", paddingHorizontal: 16 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brand: { color: COLORS.text, fontWeight: "800", letterSpacing: 0.4, fontSize: 16 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },

  // Hero card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#23D6FF26",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    marginTop: 12,
  },
  hello: { color: COLORS.textMuted, fontSize: 13, marginBottom: 2 },
  helloUser: { color: COLORS.text, fontWeight: "800" },
  balanceLabel: { color: COLORS.textMuted, fontSize: 12 },
  balanceValue: { color: COLORS.text, fontSize: 28, fontWeight: "800", marginTop: 2 },

  waveBar: { marginTop: 12, height: 6, width: "100%", backgroundColor: COLORS.primary, borderRadius: 999, opacity: 0.5 },

  quickRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  quickBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "#0B1218",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexDirection: "row",
  },
  quickText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },

  // Search + filter
  searchRow: { flexDirection: "row", gap: 10, marginTop: 16, alignItems: "center" },
  searchBox: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0B1218",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { color: COLORS.text, flex: 1, fontSize: 14 },
  filterBtn: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "#0B1218",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  filterTxt: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 6 },
  sectionTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16 },

  eventCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  eventTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  eventMarket: { color: COLORS.textMuted, fontSize: 12 },
  eventImage: { width: "100%", height: 120, borderRadius: 10, marginTop: 8 },

  oddsRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  oddPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0A1016",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  oddKey: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  oddVal: { color: COLORS.win, fontSize: 13, fontWeight: "800" },

  // modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 18 },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#23D6FF26",
    maxHeight: "86%",
  },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  label: { color: COLORS.textMuted, fontSize: 12, marginTop: 8 },
  input: {
    color: COLORS.text,
    backgroundColor: "#0B1218",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  primaryBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 14 },
  primaryBtnTxt: { color: "#001218", fontWeight: "800" },

  // chips
  chipsRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0B1218",
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: "#0F141B" },
  chipTxt: { color: COLORS.textMuted, fontWeight: "700", fontSize: 12 },
  chipTxtActive: { color: COLORS.primary },

  // MiniGame
  gameRow: { flexDirection: "row", gap: 14, alignItems: "center", marginTop: 10 },
  gameAnimBox: {
    width: 120,
    height: 120,
    borderRadius: 14,
    backgroundColor: "#0B1218",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  coinFallback: {
    width: 110,
    height: 110,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A1016",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyWrap: {
    paddingVertical: 18,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyLottie: {
    width: 180,
    height: 180,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 6,
  },
  emptyDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyBtnTxt: {
    color: "#001218",
    fontWeight: "800",
    fontSize: 12,
  },
});
