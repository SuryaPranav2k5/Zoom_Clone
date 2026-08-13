"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface User {
  id: number;
  full_name: string;
  email: string;
  avatar_url?: string;
  provider: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (fullName: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on load
  useEffect(() => {
    const savedToken = localStorage.getItem("zoom_auth_token");
    const savedUser = localStorage.getItem("zoom_auth_user");
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (err) {
        localStorage.removeItem("zoom_auth_token");
        localStorage.removeItem("zoom_auth_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("http://127.0.0.1:8000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login failed.");
    }

    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("zoom_auth_token", data.access_token);
    localStorage.setItem("zoom_auth_user", JSON.stringify(data.user));
  };

  const signup = async (fullName: string, email: string, password: string) => {
    const res = await fetch("http://127.0.0.1:8000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Signup failed.");
    }

    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("zoom_auth_token", data.access_token);
    localStorage.setItem("zoom_auth_user", JSON.stringify(data.user));
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await fetch("http://127.0.0.1:8000/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Google Sign-In failed.");
    }

    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("zoom_auth_token", data.access_token);
    localStorage.setItem("zoom_auth_user", JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("zoom_auth_token");
    localStorage.removeItem("zoom_auth_user");
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
