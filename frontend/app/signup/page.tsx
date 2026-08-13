"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Video, Mail, Lock, User, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function SignupPage() {
  const router = useRouter();
  const { signup, loginWithGoogle } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize real Google Identity Services SDK if Client ID is configured
  useEffect(() => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (googleClientId && googleClientId !== "your_google_client_id_here") {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if ((window as any).google && !(window as any)._googleGsiInitialized) {
          (window as any)._googleGsiInitialized = true;
          (window as any).google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (response: any) => {
              if (response.credential) {
                try {
                  await loginWithGoogle(response.credential);
                  router.push("/");
                } catch (err: any) {
                  setError("Google OAuth verification failed.");
                }
              }
            },
          });
        }
      };
      document.body.appendChild(script);
    }
  }, [loginWithGoogle, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await signup(fullName, email, password);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleClick = async () => {
    setError("");
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (googleClientId && googleClientId !== "your_google_client_id_here" && (window as any).google) {
      (window as any).google.accounts.id.prompt();
      return;
    }

    const userEmail = prompt("Enter your Google Account Email:", "pranavsurya321@gmail.com");
    if (!userEmail) return;
    const userName = prompt("Enter your Google Account Name:", "Surya Pranav");
    if (!userName) return;
    const photoUrl = prompt(
      "Enter your Profile Photo URL (or leave default for profile picture):",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"
    );

    setIsSubmitting(true);
    try {
      localStorage.setItem("zoom_auth_token", "google_token_" + Date.now());
      localStorage.setItem("zoom_auth_user", JSON.stringify({
        id: Date.now(),
        full_name: userName,
        email: userEmail,
        avatar_url: photoUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
        provider: "GOOGLE",
        created_at: new Date().toISOString()
      }));
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Google Sign-In failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fa] flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#0e71eb] rounded-xl flex items-center justify-center text-white shadow-md">
            <Video className="w-5 h-5 fill-current" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">zoom</span>
        </Link>
        <div className="text-xs text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 font-semibold hover:underline">
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Signup Box */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xl w-full max-w-md p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Create Free Zoom Account</h1>
            <p className="text-xs text-gray-500 mt-1">Start hosting instant and scheduled meetings</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleClick}
            className="w-full py-3 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR EMAIL</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="zoom-blue-btn w-full py-3 rounded-xl text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isSubmitting ? "Creating Account..." : "Create Account"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-400">
        By signing up, you agree to Zoom Clone Terms of Service and Privacy Policy.
      </footer>
    </div>
  );
}
