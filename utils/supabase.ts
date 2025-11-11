import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_API_KEY ?? "";

// Detecta entorno React Native (no web/SSR)
const isReactNative =
  typeof navigator !== "undefined" && navigator.product === "ReactNative";
// Alternativa equivalente si prefieres: const isReactNative = Platform.OS !== "web";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ Sólo usa AsyncStorage en RN; en web/SSR no pases storage
    storage: isReactNative ? AsyncStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // RN no usa URL callbacks
  },
});