"use client";

import { useState, useEffect } from "react";
import {
  X,
  Brain,
  Clock,
  Users,
  MessageSquare,
  Share2,
  Calendar,
  Plus,
  CheckCircle2,
  Circle,
  UserCheck,
  UserX,
  UserMinus,
  AlertCircle,
  Sparkles,
  ChevronDown,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";

interface MeetingItem {
  id: string;
  title: string;
  host_name: string;
  scheduled_start_time?: string;
  created_at?: string;
}

interface AttendanceItem {
  display_name: string;
  is_host: boolean;
  joined_at: string;
  left_at?: string;
  is_kicked: boolean;
  duration_minutes: number;
  percentage: number;
}

interface EventItem {
  id: number;
  event_type: string;
  actor_name: string;
  description: string;
  timestamp: string;
}

interface ActionItemData {
  id: number;
  task: string;
  assigned_to_user_id?: number;
  assigned_to_name?: string;
  due_date?: string;
  completed: boolean;
}

interface InsightsData {
  meeting_id: string;
  title: string;
  host_name: string;
  status: string;
  started_at?: string;
  ended_at?: string;
  total_duration_minutes: number;
  total_participants: number;
  total_chat_messages: number;
  total_screen_shares: number;
  attendance: AttendanceItem[];
  timeline: EventItem[];
  action_items: ActionItemData[];
}

interface MeetingInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentMeetings: MeetingItem[];
  upcomingMeetings?: MeetingItem[];
  initialMeetingId?: string;
}

export default function MeetingInsightsModal({
  isOpen,
  onClose,
  recentMeetings,
  upcomingMeetings = [],
  initialMeetingId
}: MeetingInsightsModalProps) {
  const { user } = useAuth();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Action item form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Combine meetings uniquely
  const allMeetings = [...recentMeetings, ...upcomingMeetings].filter(
    (m, idx, self) => idx === self.findIndex((t) => t.id === m.id)
  );

  useEffect(() => {
    if (isOpen) {
      const defaultId = initialMeetingId || (allMeetings.length > 0 ? allMeetings[0].id : "");
      setSelectedMeetingId(defaultId);
      if (defaultId) {
        fetchInsights(defaultId);
      }
    } else {
      setInsights(null);
      setErrorMsg("");
      setShowAddForm(false);
    }
  }, [isOpen, initialMeetingId, recentMeetings, upcomingMeetings]);

  const fetchInsights = async (meetingId: string) => {
    if (!meetingId) return;
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/insights`);
      if (!res.ok) {
        throw new Error("Meeting insights not available or meeting not found.");
      }
      const data = await res.json();
      setInsights(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load meeting insights.");
      setInsights(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMeeting = (id: string) => {
    setSelectedMeetingId(id);
    fetchInsights(id);
  };

  const handleToggleAction = async (itemId: number) => {
    if (!insights) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/action-items/${itemId}/toggle`, {
        method: "PATCH"
      });
      if (res.ok) {
        const updatedItem = await res.json();
        setInsights({
          ...insights,
          action_items: insights.action_items.map((ai) =>
            ai.id === itemId ? { ...ai, completed: updatedItem.completed } : ai
          )
        });
      }
    } catch (err) {
      console.error("Error toggling action item:", err);
    }
  };

  const handleAddActionItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || !selectedMeetingId) return;

    setIsSubmittingAction(true);
    try {
      const payload: any = {
        task: taskInput.trim(),
        assigned_to_name: assigneeInput.trim() || null,
        due_date: dueDateInput ? new Date(dueDateInput).toISOString() : null
      };

      // If assignee matches logged-in user, send assigned_to_user_id
      if (user && assigneeInput.trim().toLowerCase() === user.full_name.toLowerCase()) {
        payload.assigned_to_user_id = user.id;
        payload.assigned_to_name = null;
      }

      const res = await fetch(`${API_BASE_URL}/api/meetings/${selectedMeetingId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const newItem = await res.json();
        if (insights) {
          setInsights({
            ...insights,
            action_items: [...insights.action_items, newItem]
          });
        }
        setTaskInput("");
        setAssigneeInput("");
        setDueDateInput("");
        setShowAddForm(false);
      }
    } catch (err) {
      console.error("Error adding action item:", err);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const formatEventTime = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "JOIN":
        return <UserCheck className="w-4 h-4 text-emerald-500" />;
      case "LEFT":
        return <UserX className="w-4 h-4 text-gray-400" />;
      case "KICK":
        return <UserMinus className="w-4 h-4 text-red-500" />;
      case "CHAT":
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case "SCREEN_SHARE_START":
      case "SCREEN_SHARE_STOP":
        return <Share2 className="w-4 h-4 text-purple-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Meeting Insights</h3>
              <p className="text-xs text-blue-200">Post-meeting analytics, attendance breakdown & action items</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 bg-gray-50/50">
          {/* Meeting Selector Dropdown */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 zoom-card-shadow flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" /> Select a Meeting:
            </label>
            <div className="relative min-w-[260px]">
              <select
                value={selectedMeetingId}
                onChange={(e) => handleSelectMeeting(e.target.value)}
                className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
              >
                {allMeetings.length === 0 ? (
                  <option value="">No meetings found</option>
                ) : (
                  allMeetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.id})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-3 text-blue-500" />
              <p className="text-sm font-medium">Calculating meeting analytics...</p>
            </div>
          ) : errorMsg ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
              <p className="text-sm font-bold">{errorMsg}</p>
              <p className="text-xs text-red-400">Please select another meeting from your recent list.</p>
            </div>
          ) : insights ? (
            <>
              {/* Meeting Header Metadata */}
              <div className="bg-white rounded-2xl p-5 border border-gray-200 zoom-card-shadow flex items-center justify-between">
                <div>
                  <h4 className="text-base font-black text-gray-900">{insights.title}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Host: <strong className="text-gray-700">{insights.host_name}</strong> • Meeting ID: <span className="font-mono font-semibold text-blue-600">{insights.meeting_id}</span>
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  insights.status === "LIVE"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {insights.status}
                </span>
              </div>

              {/* 📊 1. Meeting Overview Cards */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
                  📊 Meeting Overview
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl p-4 border border-gray-200 zoom-card-shadow flex flex-col items-center text-center">
                    <Clock className="w-6 h-6 text-blue-600 mb-1.5" />
                    <span className="text-2xl font-black text-gray-900">{insights.total_duration_minutes} min</span>
                    <span className="text-xs font-medium text-gray-400 mt-0.5">Meeting Duration</span>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-gray-200 zoom-card-shadow flex flex-col items-center text-center">
                    <Users className="w-6 h-6 text-emerald-600 mb-1.5" />
                    <span className="text-2xl font-black text-gray-900">{insights.total_participants}</span>
                    <span className="text-xs font-medium text-gray-400 mt-0.5">Participants</span>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-gray-200 zoom-card-shadow flex flex-col items-center text-center">
                    <MessageSquare className="w-6 h-6 text-purple-600 mb-1.5" />
                    <span className="text-2xl font-black text-gray-900">{insights.total_chat_messages}</span>
                    <span className="text-xs font-medium text-gray-400 mt-0.5">Chat Messages</span>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-gray-200 zoom-card-shadow flex flex-col items-center text-center">
                    <Share2 className="w-6 h-6 text-amber-600 mb-1.5" />
                    <span className="text-2xl font-black text-gray-900">{insights.total_screen_shares}</span>
                    <span className="text-xs font-medium text-gray-400 mt-0.5">Screen Shares</span>
                  </div>
                </div>
              </div>

              {/* 👥 2. Attendance Visualizer */}
              <div className="bg-white rounded-2xl p-5 border border-gray-200 zoom-card-shadow">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                  👥 Attendance Breakdown
                </h4>

                {insights.attendance.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-xs font-medium">
                    Only the host attended this meeting.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {insights.attendance.map((att, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">{att.display_name}</span>
                            {att.is_host && (
                              <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                                HOST
                              </span>
                            )}
                            {att.is_kicked && (
                              <span className="bg-red-100 text-red-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                                KICKED
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-gray-500 font-semibold">
                            {att.duration_minutes} min ({att.percentage}%)
                          </span>
                        </div>
                        {/* Visual Animated Progress Bar */}
                        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              att.is_kicked ? "bg-red-500" : "bg-blue-600"
                            }`}
                            style={{ width: `${att.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grid 2-Columns: Activity Timeline & Action Items */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 💬 3. Meeting Activity Timeline */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200 zoom-card-shadow flex flex-col h-[320px]">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    💬 Activity Timeline
                  </h4>
                  <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                    {insights.timeline.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 text-xs font-medium">
                        No meeting activity logged.
                      </div>
                    ) : (
                      insights.timeline.map((ev) => (
                        <div key={ev.id} className="flex items-start gap-3 text-xs border-b border-gray-50 pb-2">
                          <div className="mt-0.5 p-1 rounded-lg bg-gray-50 border border-gray-100">
                            {getEventIcon(ev.event_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 leading-tight">{ev.description}</p>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {formatEventTime(ev.timestamp)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 📋 4. Action Items System */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200 zoom-card-shadow flex flex-col h-[320px]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      📋 Action Items ({insights.action_items.length})
                    </h4>
                    <button
                      onClick={() => setShowAddForm(!showAddForm)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                  </div>

                  {/* Add Action Item Form Drawer */}
                  {showAddForm && (
                    <form onSubmit={handleAddActionItem} className="bg-blue-50/60 p-3 rounded-xl border border-blue-200 mb-3 space-y-2 text-xs">
                      <input
                        type="text"
                        placeholder="Task description (e.g. Update API docs)"
                        value={taskInput}
                        onChange={(e) => setTaskInput(e.target.value)}
                        required
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-blue-500"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={assigneeInput}
                          onChange={(e) => setAssigneeInput(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-medium focus:outline-none"
                        >
                          <option value="">Unassigned</option>
                          {insights.attendance.map((att, i) => (
                            <option key={i} value={att.display_name}>
                              {att.display_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={dueDateInput}
                          onChange={(e) => setDueDateInput(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-medium focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-200 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingAction}
                          className="zoom-blue-btn text-white px-3 py-1 rounded-md text-[11px] font-semibold cursor-pointer"
                        >
                          {isSubmittingAction ? "Adding..." : "Add"}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Action Items List */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                    {insights.action_items.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs font-medium">
                        No action items recorded for this meeting.
                      </div>
                    ) : (
                      insights.action_items.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleToggleAction(item.id)}
                          className={`p-3 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                            item.completed
                              ? "bg-gray-50 border-gray-200 opacity-60"
                              : "bg-white border-gray-200 hover:border-blue-300"
                          }`}
                        >
                          <button className="mt-0.5 text-blue-600 focus:outline-none">
                            {item.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Circle className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${item.completed ? "line-through text-gray-500" : "text-gray-900"}`}>
                              {item.task}
                            </p>
                            {item.assigned_to_name && (
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                Assigned to: <strong className="text-gray-700">{item.assigned_to_name}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
