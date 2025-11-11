import { createContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/utils/supabase";
import * as Linking from "expo-linking";

const redirectTo = Linking.createURL("/auth/callback");

type AuthUser = { id: string; email: string | null; name?: string | null } | null;

interface AuthContextProps {
  user: AuthUser;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext({} as AuthContextProps);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar sesión inicial y escuchar cambios de auth
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setIsLoading(true);
      const { data } = await supabase.auth.getUser();
      if (mounted) {
        const u = data.user
          ? { id: data.user.id, email: data.user.email ?? null, name: data.user.user_metadata?.name ?? null }
          : null;
        setUser(u);
        setIsLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
        ? { id: session.user.id, email: session.user.email ?? null, name: session.user.user_metadata?.name ?? null }
        : null;
      setUser(u);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      let u = data.user
        ? { id: data.user.id, email: data.user.email ?? null, name: data.user.user_metadata?.name ?? null }
        : null;
      // Cargar perfil completo
      if (u && u.id) {
        const profile = await fetchProfile(u.id);
        u = { ...u, ...profile };
      }
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name?: string, username?: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { name, username: username ?? name },
        },
      });
      if (error) throw error;
      // El trigger creará profiles con id = auth.users.id y role='CLIENT'
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};