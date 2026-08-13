"use client";

import { useState } from "react";
import { X, Calendar, Clock, Lock, User, FileText, CheckCircle2 } from "lucide-react";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduledSuccess: () => void;
}

export default function ScheduleModal({ isOpen, onClose, onScheduledSuccess }: ScheduleModalProps) {
  const [title, setTitle] = useState("Team Sync & Review");
  const [description, setDescription] = useState("");
  const [hostName, setHostName] = useState("Alex Rivera");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState(40);
  const [invitees, setInvitees] = useState("");
  const [enablePasscode, setEnablePasscode] = useState(false);
  const [passcode, setPasscode] = useState("123456");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdMeetingInfo, setCreatedMeetingInfo] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        host_name: hostName.trim() || "Host",
        scheduled_start_time: new Date(startDate).toISOString(),
        duration_minutes: Number(durationMinutes),
        passcode: enablePasscode && passcode.trim() ? passcode.trim() : null,
        invitees: invitees.trim() || null,
      };

      const res = await fetch("http://127.0.0.1:8000/api/meetings/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to schedule meeting.");
      }

      const data = await res.json();
      setCreatedMeetingInfo(data);
      onScheduledSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to schedule meeting.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyFullInvitation = () => {
    if (createdMeetingInfo) {
      const fullUrl = `${window.location.origin}/meeting/${createdMeetingInfo.id}`;
      const inviteText = `${hostName} is inviting you to a scheduled Zoom meeting.\n\nTopic: ${createdMeetingInfo.title}\nTime: ${new Date(startDate).toLocaleString()}\n\nJoin Zoom Meeting:\n${fullUrl}\n\nMeeting ID: ${createdMeetingInfo.id}${createdMeetingInfo.passcode_required ? `\nPasscode: ${passcode}` : ""}${createdMeetingInfo.invitees ? `\nInvitees: ${createdMeetingInfo.invitees}` : ""}`;
      navigator.clipboard.writeText(inviteText);
      alert("Full Zoom Invitation copied to clipboard!");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">Schedule Meeting</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {createdMeetingInfo ? (
          <div className="p-6 space-y-6 text-center">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-900">Meeting Scheduled!</h4>
              <p className="text-sm text-gray-500 mt-1">{createdMeetingInfo.title}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Meeting ID:</span>
                <span className="font-mono font-bold text-gray-900">{createdMeetingInfo.id}</span>
              </div>
              {createdMeetingInfo.passcode_required && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Passcode:</span>
                  <span className="font-mono font-semibold text-blue-600">{passcode}</span>
                </div>
              )}
              {createdMeetingInfo.invitees && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Invited Attendees:</span>
                  <span className="text-gray-900 truncate max-w-[200px]">{createdMeetingInfo.invitees}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Duration:</span>
                <span className="text-gray-900">{createdMeetingInfo.duration_minutes} mins</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={handleCopyFullInvitation}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Copy Full Zoom Invitation
              </button>
              <button
                type="button"
                onClick={onClose}
                className="zoom-blue-btn w-full py-2.5 text-white font-semibold rounded-xl text-sm shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Topic / Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Host Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Duration
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-sm appearance-none"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={40}>40 Minutes (Default)</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Agenda or meeting description"
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-sm resize-none"
              />
            </div>

            {/* Passcode Toggle */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Require Passcode</span>
              </div>
              <input
                type="checkbox"
                checked={enablePasscode}
                onChange={(e) => setEnablePasscode(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded-sm focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {enablePasscode && (
              <div>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Set 6-digit passcode"
                  className="w-full px-4 py-2 bg-blue-50/50 border border-blue-200 rounded-xl text-gray-900 font-mono text-sm focus:bg-white focus:border-blue-500 outline-hidden"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Invite Attendees (Optional)
              </label>
              <input
                type="text"
                value={invitees}
                onChange={(e) => setInvitees(e.target.value)}
                placeholder="e.g. friend@gmail.com, alex@example.com"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-sm"
              />
            </div>

            {/* Submit Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-gray-600 font-medium hover:bg-gray-100 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="zoom-blue-btn px-6 py-2.5 rounded-xl text-white font-medium text-sm shadow-md disabled:opacity-50"
              >
                {isSubmitting ? "Scheduling..." : "Schedule"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
