"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  Plus,
  Calendar,
  Share2,
  Clock,
  Copy,
  ExternalLink,
  Search,
  Settings,
  User,
  ShieldCheck,
  Check,
  RefreshCw,
  Trash2,
  ShieldAlert,
  Info
} from "lucide-react";
import Link from "next/link";
import JoinModal from "../components/JoinModal";
import ScheduleModal from "../components/ScheduleModal";
import { useAuth } from "../context/AuthContext";

interface MeetingItem {
  id: string;
  title: string;
  description?: string;
  passcode_required: boolean;
  meeting_type: string;
  status: string;
  scheduled_start_time?: string;
  duration_minutes: number;
  created_at: string;
  ended_at?: string;
  host_name: string;
  host_email?: string;
  invitees?: string;
  invite_link?: string;
}

export default function ZoomDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"upcoming" | "recent">("upcoming");
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingItem[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<MeetingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type?: "info" | "success" | "error" } | null>(null);

  const showToast = (text: string, type: "info" | "success" | "error" = "info") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Live time clock
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchMeetings = async () => {
    setIsLoading(true);
    try {
      const [upRes, recRes] = await Promise.all([
        fetch("http://127.0.0.1:8000/api/meetings/upcoming"),
        fetch("http://127.0.0.1:8000/api/meetings/recent"),
      ]);

      if (upRes.ok) setUpcomingMeetings(await upRes.json());
      if (recRes.ok) setRecentMeetings(await recRes.json());
    } catch (err) {
      console.error("Error fetching meetings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const ensureUtcIso = (isoStr?: string) => {
    if (!isoStr) return "";
    if (isoStr.endsWith("Z") || isoStr.includes("+")) return isoStr;
    return isoStr + "Z";
  };

  // Filter meetings for authenticated users vs guest mode (evaluators)
  const displayedUpcomingMeetings = useMemo(() => {
    let list = upcomingMeetings;
    if (user) {
      const userEmail = user.email.toLowerCase().trim();
      const userName = user.full_name.toLowerCase().trim();
      list = upcomingMeetings.filter((m) => {
        const isHost = m.host_email
          ? m.host_email.toLowerCase().trim() === userEmail
          : m.host_name.toLowerCase().trim() === userName;
        const isInvited = m.invitees
          ? m.invitees.toLowerCase().includes(userEmail) || m.invitees.toLowerCase().includes(userName)
          : false;
        return isHost || isInvited;
      });
    }
    // Sort upcoming meetings chronologically by scheduled start time (earliest timing first)
    return [...list].sort((a, b) => {
      const timeA = a.scheduled_start_time ? new Date(ensureUtcIso(a.scheduled_start_time)).getTime() : 0;
      const timeB = b.scheduled_start_time ? new Date(ensureUtcIso(b.scheduled_start_time)).getTime() : 0;
      return timeA - timeB;
    });
  }, [upcomingMeetings, user]);

  const displayedRecentMeetings = useMemo(() => {
    let list = recentMeetings;
    if (user) {
      const userEmail = user.email.toLowerCase().trim();
      const userName = user.full_name.toLowerCase().trim();
      list = recentMeetings.filter((m) => {
        return m.host_email
          ? m.host_email.toLowerCase().trim() === userEmail
          : m.host_name.toLowerCase().trim() === userName;
      });
    }
    return [...list].sort(
      (a, b) => new Date(ensureUtcIso(b.ended_at || b.created_at)).getTime() - new Date(ensureUtcIso(a.ended_at || a.created_at)).getTime()
    );
  }, [recentMeetings, user]);

  const handleInstantMeeting = async () => {
    if (!user) {
      showToast("Please sign in to start a new meeting.", "info");
      router.push("/login");
      return;
    }
    try {
      const hostName = user.full_name || "Host User";
      const res = await fetch("http://127.0.0.1:8000/api/meetings/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host_name: hostName,
          host_email: user.email || null,
          title: `${hostName}'s Zoom Meeting`
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/meeting/${data.id}?host=true&name=${encodeURIComponent(hostName)}`);
      }
    } catch (err) {
      showToast("Unable to create instant meeting. Ensure backend server is running.", "error");
    }
  };

  const handleOpenSchedule = () => {
    if (!user) {
      showToast("Please sign in to schedule a meeting.", "info");
      router.push("/login");
      return;
    }
    setIsScheduleOpen(true);
  };

  const handleJoinFromModal = (
    meetingId: string,
    displayName: string,
    passcode?: string,
    micOn: boolean = true,
    videoOn: boolean = true
  ) => {
    setIsJoinOpen(false);
    const params = new URLSearchParams({
      name: displayName,
      mic: micOn ? "1" : "0",
      video: videoOn ? "1" : "0",
    });
    if (passcode) params.append("passcode", passcode);
    router.push(`/meeting/${meetingId}?${params.toString()}`);
  };

  const handleCopyLink = (meetingId: string) => {
    const fullUrl = `${window.location.origin}/meeting/${meetingId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(meetingId);
    showToast("Meeting link copied to clipboard!", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isPastScheduledTime = (isoStr?: string) => {
    if (!isoStr) return false;
    const meetingTime = new Date(ensureUtcIso(isoStr)).getTime();
    return Date.now() > meetingTime;
  };

  const handleDeleteMeeting = (meetingId: string) => {
    setDeleteTargetId(meetingId);
  };

  const confirmDeleteMeeting = async () => {
    if (!deleteTargetId) return;
    const meetingId = deleteTargetId;
    setDeleteTargetId(null);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/meetings/${meetingId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("Meeting deleted successfully.", "success");
        fetchMeetings();
      } else {
        showToast("Failed to delete meeting.", "error");
      }
    } catch (err) {
      console.error("Error deleting meeting:", err);
      showToast("Error deleting meeting.", "error");
    }
  };

  const formatTimeStr = (isoStr?: string) => {
    if (!isoStr) return "N/A";
    const d = new Date(ensureUtcIso(isoStr));
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateStr = (isoStr?: string) => {
    if (!isoStr) return "";
    const d = new Date(ensureUtcIso(isoStr));
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div className="min-h-screen bg-[#f7f9fa] flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 zoom-blue-btn rounded-xl flex items-center justify-center text-white shadow-md">
            <Video className="w-5 h-5" />
          </div>
          <span className="text-xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
            Zoom
          </span>
        </div>

        {/* User Profile / Auth Status */}
        <div className="flex items-center gap-4">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 bg-gray-100/80 hover:bg-gray-200/80 p-1.5 pr-3 rounded-full transition-all cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs overflow-hidden shadow-inner">
                  {user.avatar_url && !avatarImgError ? (
                    <img
                      src={user.avatar_url}
                      alt={user.full_name}
                      onError={() => setAvatarImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    user.full_name ? user.full_name.slice(0, 2).toUpperCase() : "U"
                  )}
                </div>
                <span className="text-xs font-semibold text-gray-800 max-w-[120px] truncate">
                  {user.full_name}
                </span>
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in duration-150">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-900 truncate">{user.full_name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                    <span className="inline-block mt-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200">
                      {user.provider} ACCOUNT
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="zoom-blue-btn px-3.5 py-1.5 text-xs font-semibold text-white rounded-xl shadow-xs transition-all"
              >
                Sign Up Free
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Hero & Action Grid (7 Columns) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Live Date/Time Clock Card */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <p className="text-4xl md:text-5xl font-black tracking-tight font-mono">
                  {currentTime ? currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
                </p>
                <p className="text-sm text-blue-200 font-medium mt-1">
                  {currentTime ? currentTime.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-xs font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-300" /> Secure Meeting Environment
              </div>
            </div>
          </div>

          {/* Core Action Buttons Grid */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* New Meeting (Orange) */}
              <button
                onClick={handleInstantMeeting}
                className="group bg-white hover:bg-orange-50/50 p-5 rounded-2xl border border-gray-200 hover:border-orange-200 zoom-card-shadow flex flex-col items-center justify-center text-center transition-all cursor-pointer"
              >
                <div className="w-14 h-14 zoom-orange-btn rounded-2xl flex items-center justify-center text-white shadow-lg mb-3 group-hover:scale-105 transition-transform">
                  <Video className="w-7 h-7" />
                </div>
                <span className="text-sm font-bold text-gray-800 group-hover:text-orange-600">
                  New Meeting
                </span>
                <span className="text-xs text-gray-400 mt-0.5">Start instantly</span>
              </button>

              {/* Join (Blue) */}
              <button
                onClick={() => {
                  setSelectedMeetingId("");
                  setIsJoinOpen(true);
                }}
                className="group bg-white hover:bg-blue-50/50 p-5 rounded-2xl border border-gray-200 hover:border-blue-200 zoom-card-shadow flex flex-col items-center justify-center text-center transition-all cursor-pointer"
              >
                <div className="w-14 h-14 zoom-blue-btn rounded-2xl flex items-center justify-center text-white shadow-lg mb-3 group-hover:scale-105 transition-transform">
                  <Plus className="w-7 h-7" />
                </div>
                <span className="text-sm font-bold text-gray-800 group-hover:text-blue-600">
                  Join
                </span>
                <span className="text-xs text-gray-400 mt-0.5">Via Meeting ID</span>
              </button>

              {/* Schedule (Blue outline) */}
              <button
                onClick={handleOpenSchedule}
                className="group bg-white hover:bg-blue-50/50 p-5 rounded-2xl border border-gray-200 hover:border-blue-200 zoom-card-shadow flex flex-col items-center justify-center text-center transition-all cursor-pointer"
              >
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-xs mb-3 group-hover:scale-105 transition-transform border border-blue-200">
                  <Calendar className="w-7 h-7" />
                </div>
                <span className="text-sm font-bold text-gray-800 group-hover:text-blue-600">
                  Schedule
                </span>
                <span className="text-xs text-gray-400 mt-0.5">Plan ahead</span>
              </button>

              {/* Share Screen (Blue Placeholder) */}
              <button
                onClick={() => showToast("Share Screen feature available inside active meetings.", "info")}
                className="group bg-white hover:bg-gray-50 p-5 rounded-2xl border border-gray-200 zoom-card-shadow flex flex-col items-center justify-center text-center transition-all opacity-80 cursor-pointer"
              >
                <div className="w-14 h-14 bg-gray-700 rounded-2xl flex items-center justify-center text-white shadow-lg mb-3 group-hover:scale-105 transition-transform">
                  <Share2 className="w-7 h-7" />
                </div>
                <span className="text-sm font-bold text-gray-800">Share Screen</span>
                <span className="text-xs text-gray-400 mt-0.5">In-meeting</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Panel: Upcoming & Recent Meetings (5 Columns) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-200 p-6 zoom-card-shadow flex flex-col h-[520px]">
          {/* Panel Header Tabs */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("upcoming")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "upcoming"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Upcoming ({displayedUpcomingMeetings.length})
              </button>
              <button
                onClick={() => setActiveTab("recent")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "recent"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Recent ({displayedRecentMeetings.length})
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-blue-500" />
                <span className="text-xs">Loading meetings...</span>
              </div>
            ) : activeTab === "upcoming" ? (
              displayedUpcomingMeetings.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No upcoming meetings scheduled.</p>
                </div>
              ) : (
                displayedUpcomingMeetings.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 bg-gray-50/80 hover:bg-blue-50/40 rounded-2xl border border-gray-200/80 transition-all space-y-2 group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600">
                          {m.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formatDateStr(m.scheduled_start_time)} at {formatTimeStr(m.scheduled_start_time)}</span>
                          <span>•</span>
                          <span>{m.duration_minutes} mins</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs bg-gray-200/80 px-2 py-0.5 rounded-md text-gray-700 font-semibold">
                        {m.id}
                      </span>
                    </div>

                    {m.invitees && (
                      <div className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60 font-medium truncate">
                        👥 Invited: {m.invitees}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-500">Host: <strong className="text-gray-700">{m.host_name}</strong></span>
                      <div className="flex items-center gap-2">
                        {isPastScheduledTime(m.scheduled_start_time) && (
                          <button
                            onClick={() => handleDeleteMeeting(m.id)}
                            title="Scheduled time has passed — Delete Meeting"
                            className="flex items-center gap-1 px-2 py-1 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 text-xs font-medium transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyLink(m.id)}
                          title="Copy Link"
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                          {copiedId === m.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedMeetingId(m.id);
                            setIsJoinOpen(true);
                          }}
                          className="zoom-blue-btn text-white px-3 py-1 rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                        >
                          Start / Join
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              displayedRecentMeetings.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No recent meeting history found.</p>
                </div>
              ) : (
                displayedRecentMeetings.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{m.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Ended at: {formatDateStr(m.ended_at)} {formatTimeStr(m.ended_at)}</p>
                      </div>
                      <span className="font-mono text-xs bg-gray-200/80 px-2 py-0.5 rounded-md text-gray-700 font-semibold">
                        {m.id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                      <span>Host: <strong className="text-gray-700">{m.host_name}</strong></span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteMeeting(m.id)}
                          title="Delete Meeting"
                          className="flex items-center gap-1 px-2 py-1 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 text-xs font-medium transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                        <span className="bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full border border-red-100">
                          Ended
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <JoinModal
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        onJoin={handleJoinFromModal}
        initialMeetingId={selectedMeetingId}
      />

      <ScheduleModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onScheduledSuccess={() => {
          fetchMeetings();
          showToast("Meeting scheduled successfully!", "success");
        }}
      />

      {/* Delete Meeting Custom Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Meeting?</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Are you sure you want to permanently delete this meeting from your schedule?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteMeeting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Popup Notification */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-2xl border border-gray-700 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
          {toastMsg.type === "error" ? (
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          ) : toastMsg.type === "success" ? (
            <Check className="w-4 h-4 text-green-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toastMsg.text}</span>
        </div>
      )}
    </div>
  );
}
