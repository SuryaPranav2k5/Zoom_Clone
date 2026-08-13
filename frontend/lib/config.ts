export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || (
  API_BASE_URL.startsWith("https")
    ? API_BASE_URL.replace("https://", "wss://")
    : API_BASE_URL.replace("http://", "ws://")
);
