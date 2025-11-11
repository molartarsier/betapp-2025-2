// app/_layout.tsx
import { AuthProvider } from "@/contexts/AuthContext";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import ScreenTransitionOverlay from "@/components/ScreenTransitionOverlay";

// Carga directa del TTF de Ionicons (para evitar flashes en Android)
const ioniconsTtf = require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf");

SplashScreen.preventAutoHideAsync();

/** Wrapper que escucha cambios de ruta y muestra el overlay.
 *  Importante: este wrapper devuelve Children + Overlay, pero
 *  el _layout sigue retornando un único "nodo" (el Provider),
 *  así evitamos el warning de expo-router.
 */
function RouteTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const last = useRef(pathname);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (last.current !== pathname) {
      last.current = pathname;
      setShow(true);
    }
  }, [pathname]);

  return (
    <>
      {children}
      <ScreenTransitionOverlay visible={show} onFinished={() => setShow(false)} speed={1.6} />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Ionicons: ioniconsTtf });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded) return null;

  return (
    // El _layout devuelve **un solo nodo** (AuthProvider),
    // y dentro tenemos el wrapper que añade el overlay sin crear hijos hermanos del Stack.
    <AuthProvider>
      <RouteTransitionProvider>
        {/* ÚNICO navigator en este layout */}
        <Stack screenOptions={{ headerShown: false }} />
      </RouteTransitionProvider>
    </AuthProvider>
  );
}
