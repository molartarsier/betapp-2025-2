// app/index.tsx
import { Redirect } from "expo-router";
import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

export default function Index() {
  const { user, isLoading } = useContext(AuthContext);
  if (isLoading) return null; // podría mostrar un splash
  return <Redirect href={user ? "/main/(tabs)/home" : "/(auth)/login"} />;
}
