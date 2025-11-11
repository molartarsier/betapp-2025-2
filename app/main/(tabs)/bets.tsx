import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type Bet = {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  cost: number | null;
  created_by: string;
  created_at: string;
};

export default function BetsScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Bet[]>([]);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // CREATE / EDIT modal
  const [modalVisible, setModalVisible] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formCost, setFormCost] = useState("");

  const listRef = useRef<FlatList<Bet>>(null);
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const formatMoney = (n?: number | null) => {
    if (n === null || n === undefined) return "";
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `$${n?.toFixed(0)}`;
    }
  };

  /** Chequeo robusto de admin: RPC y fallback a profiles.role */
  const fetchIsAdmin = useCallback(async (uid: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc("is_admin", { uid });
      if (!error && typeof data === "boolean") return data;
    } catch {}
    // Fallback: lee role propio (requiere policy para leer tu propio perfil)
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      return String(prof?.role ?? "").toLowerCase() === "admin";
    } catch {
      return false;
    }
  }, []);

  /** Carga perfil y apuestas */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMe(uid);

      const admin = uid ? await fetchIsAdmin(uid) : false;
      setIsAdmin(admin);

      let q = supabase
        .from("bets")
        .select("id,title,description,image_url,cost,created_by,created_at")
        .order("created_at", { ascending: false })
        .limit(150);

      if (uid && admin && showMineOnly) q = q.eq("created_by", uid);

      const { data, error } = await q;
      if (error) throw error;
      setItems((data ?? []) as Bet[]);
    } catch (e) {
      console.error("BETS LOAD ERROR:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showMineOnly, fetchIsAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!focus || !items.length) return;
    const idx = items.findIndex((b) => b.id === String(focus));
    if (idx >= 0) {
      // Intenta scroll directo (si no, espera al próximo frame)
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true });
      } catch {
        requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: idx, animated: true }));
      }
    }
  }, [focus, items]);

  // Realtime: reload on any change
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel("bets-realtime")
      .on(
        "postgres_changes",                 // <-- FALTABA ESTE ARGUMENTO
        { event: "*", schema: "public", table: "bets" },
        () => load()
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [load]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Participate (player)
  const participate = async (betId: string) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        Alert.alert("Sesión", "Debes iniciar sesión.");
        return;
      }

      const { data, error } = await supabase.rpc("participate_bet", { p_bet_id: betId });

      if (error) {
        // Si la función no existe o no hay permisos
        if (error?.code === "PGRST116" || /participate_bet/i.test(error.message)) {
          Alert.alert("Config requerida", "Debes crear el RPC participate_bet (ya te dejé el SQL).");
          return;
        }
        throw error;
      }

      const status = data?.status;
      if (status === "already") {
        Alert.alert("Ya participas", "Ya te uniste a esta apuesta.");
        return;
      }
      if (status === "insufficient_funds") {
        const bal = data?.balance ?? 0;
        const cost = data?.cost ?? 0;
        Alert.alert(
          "Saldo insuficiente",
          `Tu saldo (${bal}) no alcanza el costo de la apuesta (${cost}).`
        );
        return;
      }

      Alert.alert("¡Listo!", "Te uniste a la apuesta y se descontó de tu wallet.");
    } catch (e: any) {
      console.error("PARTICIPATE ERROR:", e);
      // fallback amable si alguien aún usa el insert directo y cae en duplicado
      if (e?.code === "23505") {
        Alert.alert("Ya participas", "Ya te uniste a esta apuesta.");
        return;
      }
      Alert.alert("No se pudo participar", e?.message ?? "Intenta de nuevo.");
    }
  };


  // Open create/edit modal
  const openCreate = () => {
    setFormId(null);
    setFormTitle("");
    setFormDesc("");
    setFormImage("");
    setFormCost("");
    setModalVisible(true);
  };
  const openEdit = (bet: Bet) => {
    setFormId(bet.id);
    setFormTitle(bet.title ?? "");
    setFormDesc(bet.description ?? "");
    setFormImage(bet.image_url ?? "");
    setFormCost(bet.cost != null ? String(bet.cost) : "");
    setModalVisible(true);
  };

  const saveBet = async () => {
    try {
      const title = formTitle.trim();
      const costNum = Number((formCost || "").replace(/,/g, "."));
      if (!title) return Alert.alert("Falta título", "Agrega un título a la apuesta.");
      if (Number.isNaN(costNum) || costNum < 0) return Alert.alert("Costo inválido", "Ingresa un costo numérico válido (≥ 0).");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return Alert.alert("Sesión", "Debes iniciar sesión.");

      setFormBusy(true);

      if (formId) {
        const { error } = await supabase
          .from("bets")
          .update({
            title,
            description: formDesc.trim() || null,
            image_url: formImage.trim() || null,
            cost: costNum,
          })
          .eq("id", formId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bets").insert({
          title,
          description: formDesc.trim() || null,
          image_url: formImage.trim() || null,
          cost: costNum,
          created_by: uid,
        });
        if (error) throw error;
      }
      setModalVisible(false);
    } catch (e: any) {
      console.error("SAVE BET ERROR:", e);
      Alert.alert("No se pudo guardar", e?.message ?? "Revisa tus permisos.");
    } finally {
      setFormBusy(false);
    }
  };

  const deleteBet = async (betId: string) => {
    Alert.alert("Eliminar apuesta", "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("bets").delete().eq("id", betId);
            if (error) throw error;
          } catch (e: any) {
            console.error("DELETE BET ERROR:", e);
            Alert.alert("No se pudo eliminar", e?.message ?? "Revisa tus permisos.");
          }
        },
      },
    ]);
  };

  // Header actions (admin)
  const HeaderActions = () =>
    isAdmin ? (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity style={styles.headerIcon} onPress={openCreate}>
          <Ionicons name="add" size={18} color={palette.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => setShowMineOnly((s) => !s)}
          onLongPress={() => setEditMode((v) => !v)}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={palette.primary} />
        </TouchableOpacity>
      </View>
    ) : null;

  const Card = ({ bet }: { bet: Bet }) => {
    const canEdit = isAdmin && editMode && me === bet.created_by;
    return (
      <View style={styles.card}>
        {bet.image_url ? (
          <Image source={{ uri: bet.image_url }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]} />
        )}

        <View style={{ padding: 12 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {bet.title || "Bet"}
          </Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {bet.description || "No description"}
          </Text>

          <View style={styles.cardBottom}>
            <Text style={styles.cardCost}>{formatMoney(bet.cost ?? 0)}</Text>

            {isAdmin ? (
              canEdit ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => openEdit(bet)}>
                    <Ionicons name="create-outline" size={16} color="#001218" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: palette.danger }]}
                    onPress={() => deleteBet(bet.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#001218" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{me === bet.created_by ? "Mine" : "Admin"}</Text>
                </View>
              )
            ) : (
              <TouchableOpacity style={styles.participateBtn} onPress={() => participate(bet.id)}>
                <Text style={styles.participateTxt}>Participate</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Bet }) => <Card bet={item} />;

  return (
    <SafeAreaView style={styles.safe}>
      {loading && items.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingTxt}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={[styles.topBar, { paddingHorizontal: 12 }]}>
              <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
                Bets
              </Text>
              <HeaderActions />
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aún no hay apuestas disponibles</Text>
              <Text style={styles.emptySub}>
                {isAdmin ? "Pulsa + para crear la primera apuesta." : "Vuelve más tarde."}
              </Text>
            </View>
          }
        />
      )}

      {/* CREATE/EDIT MODAL (Admin) - scroll seguro + teclado */}
      <Modal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle} numberOfLines={1} adjustsFontSizeToFit>
                {formId ? "Edit bet" : "New bet"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Bet title"
                placeholderTextColor={palette.muted}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 88, textAlignVertical: "top" }]}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder="What is this bet about?"
                placeholderTextColor={palette.muted}
                multiline
              />

              <Text style={styles.label}>Image URL</Text>
              <TextInput
                style={styles.input}
                value={formImage}
                onChangeText={setFormImage}
                placeholder="https://…"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Cost</Text>
              <TextInput
                style={styles.input}
                value={formCost}
                onChangeText={setFormCost}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={palette.muted}
              />
            </ScrollView>

            <TouchableOpacity style={styles.primaryBtn} onPress={saveBet} disabled={formBusy}>
              {formBusy ? (
                <ActivityIndicator color="#001218" />
              ) : (
                <Text style={styles.primaryBtnTxt}>{formId ? "Save changes" : "Create bet"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* -------------------- styles -------------------- */
const styles = StyleSheet.create({
  topBar: {
    paddingTop: Platform.OS === "android" ? 8 : 0,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: palette.text, fontSize: 22, fontWeight: "800" },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 224, 255, 0.12)",
  },

  loadingWrap: { alignItems: "center", marginTop: 40 },
  loadingTxt: { color: palette.muted, marginTop: 10 },

  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(124,77,255,0.25)",
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 140, backgroundColor: "#0f1526" },
  imagePlaceholder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(124,77,255,0.25)",
  },
  cardTitle: { color: palette.text, fontSize: 16, fontWeight: "800" },
  cardDesc: { color: palette.muted, fontSize: 13, marginTop: 4 },
  cardBottom: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardCost: { color: palette.text, fontWeight: "800" },

  participateBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  participateTxt: { color: "#001218", fontWeight: "800" },

  smallBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.glow,
  },
  badgeTxt: { color: palette.muted, fontWeight: "700" },

  empty: { alignItems: "center", marginTop: 48 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  emptySub: { color: palette.muted, fontSize: 13, marginTop: 6 },

  /* list / safe */
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingTop: Platform.OS === "android" ? 8 : 0,
  },
  listContent: { paddingHorizontal: 12, paddingBottom: 28 },

  /* modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.glow,
    maxHeight: "88%", // evita salirse en pantallas pequeñas
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: { color: palette.text, fontSize: 18, fontWeight: "800" },
  modalScroll: { paddingBottom: 8 }, // espacio para el botón de guardar
  label: { color: palette.muted, fontSize: 12, marginTop: 8 },
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
  primaryBtn: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 14,
  },
  primaryBtnTxt: { color: "#001218", fontWeight: "800" },
});