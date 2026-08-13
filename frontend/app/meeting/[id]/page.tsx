"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Users,
  MessageSquare,
  Shield,
  PhoneOff,
  Copy,
  Check,
  Send,
  X,
  UserX,
  VolumeX,
  Smile,
  AlertTriangle,
  Radio,
  ShieldAlert,
  Info
} from "lucide-react";

interface ParticipantInfo {
  client_token: string;
  display_name: string;
  is_host: boolean;
  is_muted: boolean;
  is_video_off: boolean;
}

interface ChatMessage {
  sender_token: string;
  sender_name: string;
  text: string;
  timestamp: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

export default function MeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: meetingId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const nameQuery = searchParams.get("name") || "Guest User";
  const initialMic = searchParams.get("mic") !== "0";
  const initialVideo = searchParams.get("video") !== "0";
  const isHostQuery = searchParams.get("host") === "true";

  // State
  const [clientToken, setClientToken] = useState<string>("");
  const [meetingDetails, setMeetingDetails] = useState<any>(null);
  const [selfInfo, setSelfInfo] = useState<ParticipantInfo | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);

  const [isMicOn, setIsMicOn] = useState(initialMic);
  const [isVideoOn, setIsVideoOn] = useState(initialVideo);

  // Side panels
  const [activePanel, setActivePanel] = useState<"participants" | "chat" | "security" | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Notification banners & Custom Modals
  const [hostDisconnectBanner, setHostDisconnectBanner] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [reactions, setReactions] = useState<{ id: string; emoji: string; name: string }[]>([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [kickTargetToken, setKickTargetToken] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type?: "info" | "success" | "error" } | null>(null);

  const showToast = (text: string, type: "info" | "success" | "error" = "info") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef<{ [token: string]: RTCPeerConnection }>({});
  const remoteStreamsRef = useRef<{ [token: string]: MediaStream }>({});
  const pendingCandidatesRef = useRef<{ [token: string]: RTCIceCandidateInit[] }>({});
  const [remoteStreamsMap, setRemoteStreamsMap] = useState<Record<string, MediaStream>>({});

  // Helper to generate a synthetic canvas video stream when physical camera is busy or blocked
  const createFallbackStream = (name: string): MediaStream => {
    if (typeof window === "undefined") return new MediaStream();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      let angle = 0;
      const draw = () => {
        angle += 0.05;
        const grad = ctx.createLinearGradient(0, 0, 640, 360);
        grad.addColorStop(0, "#1e1b4b");
        grad.addColorStop(1, "#312e81");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 360);

        ctx.beginPath();
        ctx.arc(320, 180 + Math.sin(angle) * 10, 60, 0, Math.PI * 2);
        ctx.fillStyle = "#4f46e5";
        ctx.fill();
        ctx.strokeStyle = "#818cf8";
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const initials = name ? name.slice(0, 2).toUpperCase() : "P";
        ctx.fillText(initials, 320, 180 + Math.sin(angle) * 10);

        requestAnimationFrame(draw);
      };
      draw();
    }
    return canvas.captureStream(30);
  };

  // 1. Client Token & Media Setup
  useEffect(() => {
    let token = sessionStorage.getItem(`zoom_session_${meetingId}`);
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem(`zoom_session_${meetingId}`, token);
    }
    setClientToken(token);

    // Initialize Local Camera & Microphone
    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getAudioTracks().forEach((t) => (t.enabled = initialMic));
        stream.getVideoTracks().forEach((t) => (t.enabled = initialVideo));

        // Hot-swap senders in any RTCPeerConnection created during the async getUserMedia() race window
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
          const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
          const realVideoTrack = stream.getVideoTracks()[0];
          const realAudioTrack = stream.getAudioTracks()[0];

          if (videoSender && realVideoTrack) {
            videoSender.replaceTrack(realVideoTrack).catch((e) => console.warn("replaceTrack video err:", e));
          }
          if (audioSender && realAudioTrack) {
            audioSender.replaceTrack(realAudioTrack).catch((e) => console.warn("replaceTrack audio err:", e));
          }
        });
      } catch (err) {
        console.warn("Could not access physical webcam. Creating fallback stream:", err);
        const fallbackStream = createFallbackStream(nameQuery);
        localStreamRef.current = fallbackStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = fallbackStream;
        }
      }
    }

    initMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [meetingId]);

  // 2. WebSocket Connection
  useEffect(() => {
    if (!clientToken) return;

    const wsUrl = `ws://127.0.0.1:8000/ws/meeting/${meetingId}?client_token=${clientToken}&display_name=${encodeURIComponent(
      nameQuery
    )}&is_host=${isHostQuery}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected to meeting room server.");
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("[WS MSG]", data.type);

      switch (data.type) {
        case "JOIN_SUCCESS":
          setMeetingDetails(data.meeting);
          setSelfInfo(data.self);
          setParticipants(data.participants);
          break;

        case "JOIN_REJECTED":
          showToast(`Unable to join meeting: ${data.reason}`, "error");
          setTimeout(() => router.push("/"), 2500);
          break;

        case "PARTICIPANT_JOINED":
          setParticipants(data.all_participants);
          if (data.participant.client_token !== clientToken) {
            initiateWebRTCConnection(data.participant.client_token, true);
          }
          break;

        case "PARTICIPANT_LEFT":
          setParticipants(data.all_participants);
          closePeerConnection(data.client_token);
          break;

        case "PARTICIPANT_STATE_CHANGED":
          setParticipants((prev) =>
            prev.map((p) =>
              p.client_token === data.client_token
                ? { ...p, is_muted: data.is_muted, is_video_off: data.is_video_off }
                : p
            )
          );
          if (data.client_token === clientToken) {
            setIsMicOn(!data.is_muted);
            setIsVideoOn(!data.is_video_off);
          }
          break;

        case "HOST_DISCONNECTED":
          setHostDisconnectBanner(data.message);
          break;

        case "HOST_RECONNECTED":
          setHostDisconnectBanner(null);
          break;

        case "MUTE_ALL_TRIGGERED":
          setParticipants(data.all_participants);
          if (data.all_participants && Array.isArray(data.all_participants)) {
            const selfP = data.all_participants.find((p: any) => p.client_token === clientToken);
            if (selfP && selfP.is_muted) {
              setIsMicOn(false);
              if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
              }
              Object.values(peerConnectionsRef.current).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
                if (sender && sender.track) {
                  sender.track.enabled = false;
                }
              });
            }
          }
          break;

        case "KICKED":
          sessionStorage.removeItem(`zoom_session_${meetingId}`);
          router.push("/");
          break;

        case "MEETING_ENDED":
          sessionStorage.removeItem(`zoom_session_${meetingId}`);
          router.push("/");
          break;

        case "CHAT_MESSAGE":
          setChatMessages((prev) => [...prev, data]);
          break;

        case "WEBRTC_OFFER":
          handleWebRTCOffer(data.sender_token, data.payload);
          break;

        case "WEBRTC_ANSWER":
          handleWebRTCAnswer(data.sender_token, data.payload);
          break;

        case "WEBRTC_ICE_CANDIDATE":
          handleWebRTCCandidate(data.sender_token, data.payload);
          break;
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected.");
    };

    return () => {
      ws.close();
    };
  }, [clientToken, meetingId]);

  // Helper to flush pending ICE candidates after setRemoteDescription
  const flushPendingCandidates = async (token: string, pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current[token];
    if (candidates && candidates.length > 0) {
      for (const cand of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn("[WEBRTC] Error adding queued ICE candidate:", err);
        }
      }
      pendingCandidatesRef.current[token] = [];
    }
  };

  // WebRTC Signal Handlers
  const initiateWebRTCConnection = async (targetToken: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current[targetToken]) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current[targetToken] = pc;

    if (!localStreamRef.current) {
      localStreamRef.current = createFallbackStream(nameQuery);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }

    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.ontrack = (event) => {
      let stream = remoteStreamsRef.current[targetToken];
      if (!stream) {
        stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream();
        remoteStreamsRef.current[targetToken] = stream;
      }
      if (!stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      setRemoteStreamsMap((prev) => ({ ...prev, [targetToken]: stream }));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(
          JSON.stringify({
            type: "WEBRTC_ICE_CANDIDATE",
            target_token: targetToken,
            payload: event.candidate,
          })
        );
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(
        JSON.stringify({
          type: "WEBRTC_OFFER",
          target_token: targetToken,
          payload: offer,
        })
      );
    }
  };

  const handleWebRTCOffer = async (senderToken: string, offer: RTCSessionDescriptionInit) => {
    let pc = peerConnectionsRef.current[senderToken];
    if (!pc) {
      pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[senderToken] = pc;

      if (!localStreamRef.current) {
        localStreamRef.current = createFallbackStream(nameQuery);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }

      localStreamRef.current.getTracks().forEach((track) => {
        pc!.addTrack(track, localStreamRef.current!);
      });

      pc.ontrack = (event) => {
        let stream = remoteStreamsRef.current[senderToken];
        if (!stream) {
          stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream();
          remoteStreamsRef.current[senderToken] = stream;
        }
        if (!stream.getTracks().includes(event.track)) {
          stream.addTrack(event.track);
        }
        setRemoteStreamsMap((prev) => ({ ...prev, [senderToken]: stream }));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: "WEBRTC_ICE_CANDIDATE",
              target_token: senderToken,
              payload: event.candidate,
            })
          );
        }
      };
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(senderToken, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsRef.current?.send(
        JSON.stringify({
          type: "WEBRTC_ANSWER",
          target_token: senderToken,
          payload: answer,
        })
      );
    } catch (err) {
      console.warn("[WEBRTC] setRemoteDescription offer error:", err);
    }
  };

  const handleWebRTCAnswer = async (senderToken: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current[senderToken];
    if (pc && pc.signalingState === "have-local-offer") {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates(senderToken, pc);
      } catch (err) {
        console.warn("[WEBRTC] setRemoteDescription answer error:", err);
      }
    }
  };

  const handleWebRTCCandidate = async (senderToken: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current[senderToken];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[WEBRTC] Candidate add error:", err);
      }
    } else {
      if (!pendingCandidatesRef.current[senderToken]) {
        pendingCandidatesRef.current[senderToken] = [];
      }
      pendingCandidatesRef.current[senderToken].push(candidate);
    }
  };

  const closePeerConnection = (token: string) => {
    if (peerConnectionsRef.current[token]) {
      peerConnectionsRef.current[token].close();
      delete peerConnectionsRef.current[token];
    }
    if (remoteStreamsRef.current[token]) {
      delete remoteStreamsRef.current[token];
    }
    if (pendingCandidatesRef.current[token]) {
      delete pendingCandidatesRef.current[token];
    }
    setRemoteStreamsMap((prev) => {
      const copy = { ...prev };
      delete copy[token];
      return copy;
    });
  };

  // Actions
  const toggleMic = () => {
    const nextState = !isMicOn;
    setIsMicOn(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = nextState));
    }
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender && sender.track) {
        sender.track.enabled = nextState;
      }
    });
    wsRef.current?.send(
      JSON.stringify({
        type: "TOGGLE_AUDIO",
        is_muted: !nextState,
      })
    );
  };

  const toggleVideo = async () => {
    const nextState = !isVideoOn;
    setIsVideoOn(nextState);

    if (!nextState) {
      // Turning video OFF: Stop physical camera hardware tracks so laptop LED light turns OFF 100%
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
      }
    } else {
      // Turning video ON: Re-acquire camera stream and hot-swap RTCRtpSender tracks
      try {
        const newMedia = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = newMedia.getVideoTracks()[0];
        if (newVideoTrack && localStreamRef.current) {
          localStreamRef.current.addTrack(newVideoTrack);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          Object.values(peerConnectionsRef.current).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(newVideoTrack).catch(() => {});
          });
        }
      } catch (err) {
        console.warn("Could not re-enable physical camera:", err);
      }
    }

    wsRef.current?.send(
      JSON.stringify({
        type: "TOGGLE_VIDEO",
        is_video_off: !nextState,
      })
    );
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    wsRef.current?.send(
      JSON.stringify({
        type: "CHAT_MESSAGE",
        text: chatInput.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      })
    );
    setChatInput("");
  };

  const handleHostMuteParticipant = (targetToken: string) => {
    wsRef.current?.send(
      JSON.stringify({
        type: "HOST_MUTE_PARTICIPANT",
        target_token: targetToken,
      })
    );
  };

  const handleHostMuteAll = () => {
    wsRef.current?.send(
      JSON.stringify({
        type: "HOST_MUTE_ALL",
      })
    );
  };

  const handleHostKickParticipant = (targetToken: string) => {
    setKickTargetToken(targetToken);
  };

  const confirmKickParticipant = () => {
    if (kickTargetToken) {
      wsRef.current?.send(
        JSON.stringify({
          type: "HOST_KICK_PARTICIPANT",
          target_token: kickTargetToken,
        })
      );
      setKickTargetToken(null);
      showToast("Participant removed from meeting.", "info");
    }
  };

  const handleLeaveOrEndMeeting = () => {
    setShowLeaveModal(true);
  };

  const confirmEndMeetingForAll = () => {
    wsRef.current?.send(JSON.stringify({ type: "END_MEETING" }));
    setShowLeaveModal(false);
    router.push("/");
  };

  const confirmLeaveMeetingOnly = () => {
    setShowLeaveModal(false);
    router.push("/");
  };

  const handleCopyInvite = () => {
    const link = `${window.location.origin}/meeting/${meetingId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    showToast("Meeting invite link copied to clipboard!", "success");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const sendReaction = (emoji: string) => {
    const id = Math.random().toString();
    setReactions((prev) => [...prev, { id, emoji, name: selfInfo?.display_name || "User" }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 3000);
  };

  return (
    <div className="h-screen w-screen zoom-dark-bg text-white flex flex-col overflow-hidden font-sans select-none">
      {/* Top Header */}
      <header className="h-14 zoom-dark-toolbar px-6 flex items-center justify-between border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-xs">
            <VideoIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              {meetingDetails?.title || "Zoom Meeting"}
              {selfInfo?.is_host && (
                <span className="bg-blue-900/60 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-700/50">
                  Host
                </span>
              )}
            </h2>
            <p className="text-[11px] font-mono text-gray-400">ID: {meetingId}</p>
          </div>
        </div>

        {/* Top Right Copy Invite & Room Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyInvite}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "Link Copied!" : "Copy Invite"}</span>
          </button>
          <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-950/40 px-2.5 py-1 rounded-full border border-green-800/40">
            <Radio className="w-3 h-3 animate-pulse" />
            <span className="font-semibold text-[11px]">LIVE</span>
          </div>
        </div>
      </header>

      {/* Host Disconnect Warning Banner */}
      {hostDisconnectBanner && (
        <div className="bg-amber-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          <span>{hostDisconnectBanner}</span>
        </div>
      )}

      {/* Center Video Area & Side Panel Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Floating Reactions Overlay */}
        <div className="absolute top-6 left-6 z-40 flex flex-col gap-2 pointer-events-none">
          {reactions.map((r) => (
            <div
              key={r.id}
              className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full text-sm text-white flex items-center gap-2 animate-in fade-in slide-in-from-left duration-300"
            >
              <span className="text-xl">{r.emoji}</span>
              <span className="text-xs font-medium">{r.name}</span>
            </div>
          ))}
        </div>

        {/* Video Grid (Dynamic 2x2 capped at 4 participants) */}
        <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center justify-center bg-[#14141e] overflow-hidden">
          {/* 1. Self Video Tile */}
          <div className="relative w-full h-full min-h-[220px] max-h-[420px] bg-[#222230] rounded-2xl overflow-hidden border border-gray-800 shadow-xl flex items-center justify-center group">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${!isVideoOn ? "hidden" : ""}`}
            />
            {!isVideoOn && (
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  {selfInfo?.display_name?.slice(0, 2).toUpperCase() || "ME"}
                </div>
                <span className="mt-3 text-sm font-semibold text-gray-300">
                  {selfInfo?.display_name || nameQuery} (You)
                </span>
              </div>
            )}

            {/* Tile Footer Badge */}
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-xs px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-2 border border-white/10">
              <span>{selfInfo?.display_name || nameQuery} (You)</span>
              {isMicOn ? (
                <div className="flex items-center gap-0.5">
                  <span className="w-1 bg-green-400 rounded-full animate-wave-1" />
                  <span className="w-1 bg-green-400 rounded-full animate-wave-2" />
                  <span className="w-1 bg-green-400 rounded-full animate-wave-3" />
                </div>
              ) : (
                <MicOff className="w-3.5 h-3.5 text-red-500" />
              )}
            </div>
          </div>

          {/* 2. Remote Participant Video Tiles */}
          {participants
            .filter((p) => p.client_token !== clientToken)
            .map((p) => {
              const remoteStream = remoteStreamsMap[p.client_token] || remoteStreamsRef.current[p.client_token];
              return (
                <div
                  key={p.client_token}
                  className="relative w-full h-full min-h-[220px] max-h-[420px] bg-[#222230] rounded-2xl overflow-hidden border border-gray-800 shadow-xl flex items-center justify-center"
                >
                  {remoteStream && !p.is_video_off ? (
                    <video
                      autoPlay
                      playsInline
                      ref={(el) => {
                        if (el && remoteStream && el.srcObject !== remoteStream) {
                          el.srcObject = remoteStream;
                          el.play().catch(() => {});
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                        {p.display_name?.slice(0, 2).toUpperCase() || "P"}
                      </div>
                      <span className="mt-3 text-sm font-semibold text-gray-300">
                        {p.display_name}
                      </span>
                    </div>
                  )}

                  {/* Tile Footer Badge */}
                  <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-xs px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-2 border border-white/10">
                    <span>{p.display_name}</span>
                    {p.is_host && (
                      <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded-sm font-bold">
                        HOST
                      </span>
                    )}
                    {!p.is_muted ? (
                      <div className="flex items-center gap-0.5">
                        <span className="w-1 bg-green-400 rounded-full animate-wave-1" />
                        <span className="w-1 bg-green-400 rounded-full animate-wave-2" />
                        <span className="w-1 bg-green-400 rounded-full animate-wave-3" />
                      </div>
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Right Side Drawer (Participants / Chat) */}
        {activePanel && (
          <aside className="w-80 bg-[#1c1c28] border-l border-gray-800 flex flex-col z-30 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-200 capitalize">
                {activePanel === "participants" && `Participants (${participants.length})`}
                {activePanel === "chat" && "In-Meeting Chat"}
                {activePanel === "security" && "Host Security Controls"}
              </h3>
              <button
                onClick={() => setActivePanel(null)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Participants Panel */}
            {activePanel === "participants" && (
              <div className="flex-1 flex flex-col justify-between p-4 overflow-hidden">
                <div className="space-y-3 overflow-y-auto pr-1">
                  {participants.map((p) => (
                    <div
                      key={p.client_token}
                      className="flex items-center justify-between p-2.5 bg-[#252536] rounded-xl border border-gray-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                          {p.display_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                            {p.display_name} {p.client_token === clientToken && "(You)"}
                            {p.is_host && (
                              <span className="bg-blue-900 text-blue-300 text-[9px] px-1 rounded font-bold">
                                HOST
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Participant Audio/Video State & Host Options */}
                      <div className="flex items-center gap-2">
                        {p.is_muted ? (
                          <MicOff className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                          <Mic className="w-3.5 h-3.5 text-green-400" />
                        )}
                        {p.is_video_off ? (
                          <VideoOff className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                          <VideoIcon className="w-3.5 h-3.5 text-green-400" />
                        )}

                        {/* Host controls per participant */}
                        {selfInfo?.is_host && p.client_token !== clientToken && (
                          <div className="flex items-center gap-1 ml-2 border-l border-gray-700 pl-2">
                            <button
                              onClick={() => handleHostMuteParticipant(p.client_token)}
                              title="Mute Participant"
                              className="p-1 text-gray-400 hover:text-amber-400 hover:bg-gray-700 rounded-md"
                            >
                              <VolumeX className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleHostKickParticipant(p.client_token)}
                              title="Remove Participant"
                              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-md"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Host Mute All Footer */}
                {selfInfo?.is_host && (
                  <div className="pt-3 border-t border-gray-800">
                    <button
                      onClick={handleHostMuteAll}
                      className="w-full py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 font-semibold rounded-xl text-xs border border-amber-600/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <VolumeX className="w-4 h-4" /> Mute All Participants
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Chat Panel */}
            {activePanel === "chat" && (
              <div className="flex-1 flex flex-col justify-between p-4 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 text-xs">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-gray-400">
                          <span className="font-bold text-gray-300">{msg.sender_name}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <div className="bg-[#262638] text-xs text-gray-100 p-2.5 rounded-xl border border-gray-800">
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 bg-[#262638] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="zoom-blue-btn p-2 rounded-xl text-white shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Security Panel */}
            {activePanel === "security" && (
              <div className="p-4 space-y-4 text-xs">
                <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl text-blue-300">
                  <p className="font-bold mb-1">Host Controls Enabled</p>
                  <p className="text-[11px] text-blue-200">
                    You have administrative control over participant audio, video, and meeting access.
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleHostMuteAll}
                    className="w-full text-left p-3 bg-[#252536] hover:bg-[#2e2e42] rounded-xl border border-gray-800 text-gray-200 font-semibold flex items-center gap-2"
                  >
                    <VolumeX className="w-4 h-4 text-amber-400" /> Mute All Participants
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Zoom Toolbar */}
      <footer className="h-16 zoom-dark-toolbar border-t border-gray-800 px-6 flex items-center justify-between shrink-0">
        {/* Left Toolbar Controls (Mic / Video) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleMic(); }}
            className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all cursor-pointer ${
              isMicOn
                ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                : "bg-red-600/20 text-red-500 hover:bg-red-600/30"
            }`}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            <span className="text-[10px] mt-0.5">{isMicOn ? "Mute" : "Unmute"}</span>
          </button>

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleVideo(); }}
            className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all cursor-pointer ${
              isVideoOn
                ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                : "bg-red-600/20 text-red-500 hover:bg-red-600/30"
            }`}
          >
            {isVideoOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            <span className="text-[10px] mt-0.5">{isVideoOn ? "Stop Video" : "Start Video"}</span>
          </button>
        </div>

        {/* Center Toolbar Controls (Security, Participants, Chat, Reactions) */}
        <div className="flex items-center gap-2 md:gap-4">
          {selfInfo?.is_host && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel(activePanel === "security" ? null : "security"); }}
              className={`flex flex-col items-center justify-center w-16 h-11 rounded-xl transition-all cursor-pointer ${
                activePanel === "security"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Shield className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Security</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel(activePanel === "participants" ? null : "participants"); }}
            className={`flex flex-col items-center justify-center w-16 h-11 rounded-xl relative transition-all cursor-pointer ${
              activePanel === "participants"
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <div className="relative">
              <Users className="w-5 h-5" />
              <span className="absolute -top-1.5 -right-2.5 bg-blue-500 text-white text-[9px] font-extrabold px-1.5 rounded-full">
                {participants.length}
              </span>
            </div>
            <span className="text-[10px] mt-0.5">Participants</span>
          </button>

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel(activePanel === "chat" ? null : "chat"); }}
            className={`flex flex-col items-center justify-center w-16 h-11 rounded-xl transition-all cursor-pointer ${
              activePanel === "chat"
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Chat</span>
          </button>

          {/* Quick Emoji Reactions */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-800/80 p-1 rounded-xl border border-gray-700">
            {["👍", "👏", "✋", "❤️"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="hover:bg-gray-700 p-1 rounded-lg text-sm transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Right Toolbar Action (End / Leave Meeting Red Button) */}
        <div>
          <button
            onClick={handleLeaveOrEndMeeting}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-2 cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>{selfInfo?.is_host ? "End Meeting" : "Leave"}</span>
          </button>
        </div>
      </footer>

      {/* Leave / End Meeting Custom Confirmation Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center shrink-0">
                <PhoneOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-100">
                  {selfInfo?.is_host ? "End or Leave Meeting?" : "Leave Meeting?"}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selfInfo?.is_host
                    ? "As the host, you can end the meeting for everyone or just leave yourself."
                    : "Are you sure you want to leave this meeting room?"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {selfInfo?.is_host ? (
                <>
                  <button
                    onClick={confirmEndMeetingForAll}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    End Meeting for All
                  </button>
                  <button
                    onClick={confirmLeaveMeetingOnly}
                    className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Leave Meeting
                  </button>
                </>
              ) : (
                <button
                  onClick={confirmLeaveMeetingOnly}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Leave Meeting
                </button>
              )}
              <button
                onClick={() => setShowLeaveModal(false)}
                className="w-full py-2.5 bg-transparent hover:bg-gray-800 text-gray-400 font-medium rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Participant Custom Confirmation Modal */}
      {kickTargetToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-100">Remove Participant?</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Are you sure you want to remove this participant from the meeting?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setKickTargetToken(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmKickParticipant}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Popup Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900/90 text-white px-4 py-2.5 rounded-2xl border border-gray-700 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
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
