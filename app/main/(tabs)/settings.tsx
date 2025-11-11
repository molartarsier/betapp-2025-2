import { AuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/utils/supabase";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

const COLORS = {
  bg: "#0B0F12",
  card: "#0E141A",
  text: "#F5F7FA",
  textMuted: "#9AA5B1",
  primary: "#23D6FF",
  win: "#B4F461",
  border: "#1C2430",
  error: "#FF3D8A",
};

type Profile = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  birth_date: string | null;
  phone: string | null;
  gender: string | null;
  points: number | null;
  is_verified: boolean | null;
  role: "CLIENT" | "ADMIN";
  last_active?: string | null;
};

const AVATARS_BUCKET = "avatars";

async function uploadAvatarAndSave(uri: string, userId: string) {
  // 1) infer extension & contentType
  const nameFromUri = uri.split("/").pop() ?? `avatar_${Date.now()}.jpg`;
  const ext = (nameFromUri.split(".").pop() || "jpg").toLowerCase();
  const contentType =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    "image/jpeg";

  // 2) build a path that matches the storage policy
  const path = `users/${userId}/${Date.now()}.${ext}`;

  // 3) read the file bytes
  const res = await fetch(uri);
  const bytes = await res.arrayBuffer();

  // 4) upload to storage (no upsert unless you need overwrite)
  const { error: upErr } = await supabase
    .storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { contentType /*, upsert: true*/ });
  if (upErr) throw upErr;    // <-- "new row violates row-level security policy" would appear here if policies don’t match

  // 5a) PUBLIC URL (for public buckets)
  const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // 5b) Or SIGNED URL (for private buckets) — 7 days example:
  // const { data: signed } = await supabase.storage
  //   .from(AVATARS_BUCKET)
  //   .createSignedUrl(path, 60 * 60 * 24 * 7);
  // const publicUrl = signed?.signedUrl;

  // 6) save URL into profiles
  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId)
    .select("*")
    .single();
  if (updErr) throw updErr;

  return updated; // new profile row with avatar_url set
}

export default function ProfileScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // RU modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  // avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { user } = useContext(AuthContext);

  const show = (v?: string | null) => (v && String(v).trim().length ? String(v) : "To set");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const u = auth.user;
      if (!u) {
        setP(null);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.id)
        .maybeSingle();
      if (error) throw error;
      setP(data as Profile);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Could not load your profile.");
      setP(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ===== Avatar helpers =====
  const ensureMediaPermissions = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") throw new Error("Camera permission was denied.");
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") throw new Error("Library permission was denied.");
    }
  };

  const uploadToSupabase = async (uri: string, userId: string) => {
    // Infer mime/extension
    const filenameFromUri = uri.split("/").pop() ?? `image_${Date.now()}.jpg`;
    const ext = filenameFromUri.split(".").pop()?.toLowerCase() || "jpg";
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const path = `users/${userId}/${Date.now()}.${ext}`;

    // Read file -> ArrayBuffer
    const res = await fetch(uri);
    const bytes = await res.arrayBuffer();

    const { error: upErr } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;

    // Public URL
    const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  };

  const handlePickFromLibrary = async () => {
    if (!p) return;
    try {
      setUploadingAvatar(true);
      await ensureMediaPermissions(false);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const publicUrl = await uploadToSupabase(uri, p.id);

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", p.id)
        .select("*")
        .single();
      if (error) throw error;

      setP(data as Profile);
      Alert.alert("Updated", "Profile photo updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update the photo.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleTakePhoto = async () => {
    if (!p) return;
    try {
      setUploadingAvatar(true);
      await ensureMediaPermissions(true);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const publicUrl = await uploadToSupabase(uri, p.id);

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", p.id)
        .select("*")
        .single();
      if (error) throw error;

      setP(data as Profile);
      Alert.alert("Updated", "Profile photo updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not take/upload the photo.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const askAvatarSource = () => {
    Alert.alert(
      "Profile photo",
      "Choose an option",
      [
        { text: "Take photo", onPress: handleTakePhoto },
        { text: "Choose from library", onPress: handlePickFromLibrary },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  // ===== RU modal =====
  const openEditor = () => {
    if (!p) return;
    setDraft({
      name: p.name,
      username: p.username ?? "",
      website: p.website ?? "",
      location: p.location ?? "",
      phone: p.phone ?? "",
      gender: p.gender ?? "",
      birth_date: p.birth_date ?? "",
      bio: p.bio ?? "",
      avatar_url: p.avatar_url ?? "",
    });
    setEditorOpen(true);
  };

  const saveFromModal = async () => {
    if (!p) return;
    setSaving(true);
    try {
      const payload = {
        name: (draft.name ?? "").toString().trim(),
        username: (draft.username ?? "").toString().trim() || null,
        website: (draft.website ?? null) || null,
        location: (draft.location ?? null) || null,
        phone: (draft.phone ?? null) || null,
        gender: (draft.gender ?? null) || null,
        birth_date: (draft.birth_date ?? null) || null,
        bio: (draft.bio ?? null) || null,
        // avatar_url is updated from the picker handlers
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", p.id)
        .select("*")
        .single();
      if (error) throw error;

      setP(data as Profile);
      setEditorOpen(false);
      Alert.alert("Saved", "Your profile was updated successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  };

  // Visuals
  const verified = !!p?.is_verified;
  const displayName = p?.name ? p.name : (user?.email ? user.email.split("@")[0] : "User");

  if (loading) {
    return (
      <View style={[styles.body, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.underline} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Account card */}
        <View style={styles.accountCard}>
          <View style={styles.accountRowTop}>
            {/* Avatar (press to change) */}
            <Pressable style={styles.avatar} onPress={askAvatarSource} disabled={!p || uploadingAvatar}>
              {p?.avatar_url ? (
                <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={22} color={COLORS.primary} />
              )}
              <View style={styles.camBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="camera" size={12} color={COLORS.primary} />
                )}
              </View>
            </Pressable>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.userName}>{show(displayName)}</Text>
                {verified && (
                  <View style={styles.badge}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.win} />
                    <Text style={styles.badgeText}>Verified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.subtle}>
                {p?.username ? `@${p.username}` : "To set"} · {show(p?.location)}
              </Text>
            </View>

            <Pressable style={[styles.editBtn, !p && { opacity: 0.5 }]} onPress={openEditor} disabled={!p}>
              <Ionicons name="create-outline" size={18} color={COLORS.primary} />
            </Pressable>
          </View>
        </View>

        {/* Profile values */}
        {p && (
          <Section title="Profile">
            <StaticRow icon="mail-outline" label="Email" valueRight={show(p.email)} />
            <StaticRow icon="person-outline" label="Name" valueRight={show(p.name)} />
            <StaticRow icon="at-outline" label="Username" valueRight={p.username ? `@${p.username}` : "To set"} />
            <StaticRow icon="globe-outline" label="Website" valueRight={show(p.website)} />
            <StaticRow icon="location-outline" label="Location" valueRight={show(p.location)} />
            <StaticRow icon="call-outline" label="Phone" valueRight={show(p.phone)} />
            <StaticRow icon="male-female-outline" label="Gender" valueRight={show(p.gender)} />
            <StaticRow icon="calendar-outline" label="Birth date" valueRight={show(p.birth_date)} />
            <StaticRow icon="information-circle-outline" label="Bio" valueRight={show(p.bio)} />
          </Section>
        )}

        {/* Sign out */}
        <Pressable onPress={() => router.navigate("/(auth)/login")} style={styles.logoutBtn} android_ripple={{ color: "#13202B" }}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.footerNote}>18+ Play responsibly</Text>

        {/* Modal (RU) */}
        <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={() => setEditorOpen(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%", maxWidth: 520 }}>
              <View style={{ width: "100%", backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: "#23D6FF26", padding: 16 }}>
                <Text style={{ color: COLORS.primary, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Edit profile</Text>

                {/* Quick avatar change inside modal (optional shortcut) */}
                <Pressable onPress={askAvatarSource} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="camera" size={16} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: "800" }}>Change photo</Text>
                </Pressable>

                {[
                  { key: "name", label: "Name", cap: "words" as const },
                  { key: "username", label: "Username", cap: "none" as const },
                  { key: "website", label: "Website", cap: "none" as const },
                  { key: "location", label: "Location", cap: "words" as const },
                  { key: "phone", label: "Phone", cap: "none" as const },
                  { key: "gender", label: "Gender", cap: "words" as const },
                  { key: "birth_date", label: "Birth date (YYYY-MM-DD)", cap: "none" as const },
                ].map((f) => (
                  <View key={f.key} style={{ marginTop: 10 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{f.label}</Text>
                    <View style={{ width: "100%", minHeight: 48, backgroundColor: "#0A1016", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" }}>
                      <TextInput
                        value={(draft as any)[f.key] ?? ""}
                        onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                        placeholder="—"
                        placeholderTextColor={COLORS.textMuted}
                        style={{ color: COLORS.text, fontSize: 16, paddingVertical: 10 }}
                        autoCapitalize={f.cap}
                      />
                    </View>
                  </View>
                ))}

                {/* Bio */}
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Bio</Text>
                  <View style={{ width: "100%", minHeight: 92, backgroundColor: "#0A1016", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <TextInput
                      value={draft.bio ?? ""}
                      onChangeText={(v) => setDraft((d) => ({ ...d, bio: v }))}
                      placeholder="—"
                      placeholderTextColor={COLORS.textMuted}
                      style={{ color: COLORS.text, fontSize: 16 }}
                      multiline
                    />
                  </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <Pressable onPress={() => setEditorOpen(false)} style={[styles.logoutBtn, { borderColor: COLORS.border, backgroundColor: "#0B1218", flex: 1 }]} disabled={saving || uploadingAvatar}>
                    <Ionicons name="close-outline" size={18} color={COLORS.textMuted} />
                    <Text style={[styles.logoutText, { color: COLORS.textMuted }]}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={saveFromModal}
                    style={[styles.logoutBtn, { borderColor: COLORS.primary, backgroundColor: "#0B1218", flex: 1, opacity: saving ? 0.6 : 1 }]}
                    disabled={saving || uploadingAvatar}
                  >
                    {saving ? (
                      <ActivityIndicator color={COLORS.primary} />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={18} color={COLORS.primary} />
                        <Text style={[styles.logoutText, { color: COLORS.primary }]}>Save</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

/* ---------- UI subcomponents ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function StaticRow({
  icon,
  label,
  valueRight,
}: {
  icon: any;
  label: string;
  valueRight?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{valueRight ?? "To set"}</Text>
      </View>
    </View>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 16, paddingTop: 12 },

  header: { alignItems: "center", marginBottom: 8 },
  title: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: "800",
    textShadowColor: "rgba(35,214,255,0.2)",
    textShadowRadius: 5,
  },
  underline: { height: 2, width: 56, backgroundColor: COLORS.primary, borderRadius: 999, opacity: 0.45, marginTop: 4 },

  accountCard: {
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
    marginBottom: 16,
  },
  accountRowTop: { flexDirection: "row", alignItems: "center", gap: 12 },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0A1016",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  avatarImg: { width: "100%", height: "100%" },
  camBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: "#0B1218",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  userName: { color: COLORS.text, fontWeight: "800", fontSize: 16 },
  subtle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0C151D",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 999,
  },
  badgeText: { color: COLORS.win, fontSize: 11, fontWeight: "700" },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1218",
  },

  balanceBlock: { marginTop: 14 },
  balanceLabel: { color: COLORS.textMuted, fontSize: 12 },
  balanceValue: { color: COLORS.text, fontSize: 28, fontWeight: "800", marginTop: 2 },

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
  },
  quickText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },

  section: { marginTop: 8 },
  sectionTitle: { color: COLORS.text, fontWeight: "800", fontSize: 14, marginBottom: 8 },
  sectionCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },

  row: {
    minHeight: 52,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  rowValue: { color: COLORS.textMuted, fontSize: 12 },

  logoutBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: "#140D12",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutText: { color: COLORS.error, fontSize: 14, fontWeight: "800" },

  footerNote: { color: COLORS.textMuted, textAlign: "center", marginTop: 10, fontSize: 12 },
});