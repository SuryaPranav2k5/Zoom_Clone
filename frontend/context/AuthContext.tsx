"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/config";

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
  deleteAccount: () => Promise<void>;
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
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
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
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
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
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
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

  const deleteAccount = async () => {
    try {
      const savedToken = localStorage.getItem("zoom_auth_token");
      const savedUser = localStorage.getItem("zoom_auth_user");
      const parsedUser = savedUser ? JSON.parse(savedUser) : null;
      const emailParam = parsedUser?.email ? `?user_email=${encodeURIComponent(parsedUser.email)}` : "";

      await fetch(`${API_BASE_URL}/api/auth/account${emailParam}`, {
        method: "DELETE",
        headers: {
          ...(savedToken ? { Authorization: `Bearer ${savedToken}` } : {})
        }
      });
    } catch (err) {
      console.error("Error calling delete account endpoint:", err);
    } finally {
      logout();
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, loginWithGoogle, logout, deleteAccount }}>
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
