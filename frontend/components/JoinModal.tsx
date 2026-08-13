"use client";

import { useState, useEffect } from "react";
import { X, Mic, MicOff, Video, VideoOff, Key, ShieldAlert } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (meetingId: string, displayName: string, passcode?: string, micOn?: boolean, videoOn?: boolean) => void;
  initialMeetingId?: string;
}

export default function JoinModal({ isOpen, onClose, onJoin, initialMeetingId = "" }: JoinModalProps) {
  const { user } = useAuth();
  const [meetingIdInput, setMeetingIdInput] = useState(initialMeetingId);
  const [displayName, setDisplayName] = useState(user?.full_name || "Guest User");

  useEffect(() => {
    if (isOpen) {
      setMeetingIdInput(initialMeetingId || "");
      if (user?.full_name) {
        setDisplayName(user.full_name);
      } else {
        setDisplayName("Guest User");
      }
    }
  }, [isOpen, initialMeetingId, user]);
  const [passcode, setPasscode] = useState("");
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const handleFormatMeetingId = (val: string) => {
    // Keep digits and hyphens
    const digits = val.replace(/\D/g, "");
    if (digits.length <= 10) {
      let formatted = digits;
      if (digits.length > 3 && digits.length <= 6) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
      } else if (digits.length > 6) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      setMeetingIdInput(formatted);
    } else {
      setMeetingIdInput(val);
    }
  };

  const handleJoinClick = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!meetingIdInput.trim()) {
      setErrorMsg("Please enter a valid Meeting ID.");
      return;
    }

    setIsValidating(true);
    try {
      // Validate meeting against FastAPI backend
      const res = await fetch(`${API_BASE_URL}/api/meetings/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: meetingIdInput.trim(),
          requester_email: user?.email || null,
        }),
      });

      const data = await res.json();
      if (!data.valid) {
        setErrorMsg(data.message || "Invalid Meeting ID.");
        setIsValidating(false);
        return;
      }

      // Check if passcode required
      if (data.passcode_required && !passcodeRequired) {
        setPasscodeRequired(true);
        setIsValidating(false);
        return;
      }

      // Validate passcode if required
      if (data.passcode_required) {
        const passRes = await fetch(`${API_BASE_URL}/api/meetings/validate-passcode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meeting_id: meetingIdInput.trim(),
            passcode: passcode.trim(),
          }),
        });

        if (!passRes.ok) {
          setErrorMsg("Incorrect meeting passcode.");
          setIsValidating(false);
          return;
        }
      }

      onJoin(meetingIdInput.trim(), displayName.trim() || "Guest User", passcode.trim(), isMicOn, isVideoOn);
    } catch (err) {
      setErrorMsg("Unable to connect to server. Please check your connection.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <h3 className="text-lg font-semibold text-gray-800">Join Meeting</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleJoinClick} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!initialMeetingId && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Meeting ID or Personal Link Name
              </label>
              <input
                type="text"
                placeholder="e.g. 845-912-3401"
                value={meetingIdInput}
                onChange={(e) => handleFormatMeetingId(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Your Display Name
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden"
              required
            />
          </div>

          {passcodeRequired && (
            <div className="animate-in fade-in duration-200">
              <label className="block text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Key className="w-3.5 h-3.5" /> Meeting Passcode Required
              </label>
              <input
                type="password"
                placeholder="Enter meeting passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-4 py-2.5 bg-blue-50/50 border border-blue-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden"
                required
                autoFocus
              />
            </div>
          )}

          {/* Audio & Video pre-join options */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Join Options
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsMicOn(!isMicOn)}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-sm font-medium transition-all ${
                  isMicOn
                    ? "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                    : "bg-red-50 border-red-200 text-red-600"
                }`}
              >
                {isMicOn ? <Mic className="w-4 h-4 text-gray-600" /> : <MicOff className="w-4 h-4 text-red-500" />}
                {isMicOn ? "Mic On" : "Muted"}
              </button>

              <button
                type="button"
                onClick={() => setIsVideoOn(!isVideoOn)}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-sm font-medium transition-all ${
                  isVideoOn
                    ? "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                    : "bg-red-50 border-red-200 text-red-600"
                }`}
              >
                {isVideoOn ? <Video className="w-4 h-4 text-gray-600" /> : <VideoOff className="w-4 h-4 text-red-500" />}
                {isVideoOn ? "Camera On" : "Video Off"}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-gray-600 font-medium hover:bg-gray-100 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isValidating}
              className="zoom-blue-btn px-6 py-2.5 rounded-xl text-white font-medium text-sm shadow-md disabled:opacity-50"
            >
              {isValidating ? "Validating..." : "Join"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
