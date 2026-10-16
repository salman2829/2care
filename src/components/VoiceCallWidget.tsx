import React, { useState, useEffect, useRef } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { Mic, PhoneCall, PhoneOff, Volume2, Sparkles, AlertCircle, X, ChevronDown, CheckCircle2, Calendar, ArrowRight, FileText } from "lucide-react";
import { retellService } from "../lib/services/retell";

interface VoiceCallWidgetProps {
  isOpenControlled?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerCall?: number;
  onCallCompleted?: (data?: any) => void;
  showToast?: (title: string, message: string) => void;
  onNavigateToAppointments?: () => void;
  onNavigateToCalls?: () => void;
  initialContext?: {
    patient_name?: string;
    patient_id?: string;
    patient_phone?: string;
    selected_doctor_id?: string;
    selected_doctor_name?: string;
    selected_slot_id?: string;
    selected_date?: string;
  };
}

export default function VoiceCallWidget({
  isOpenControlled,
  onOpenChange,
  triggerCall,
  onCallCompleted,
  showToast,
  onNavigateToAppointments,
  onNavigateToCalls,
  initialContext
}: VoiceCallWidgetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isOpenControlled !== undefined ? isOpenControlled : internalOpen;
  const setIsOpen = (val: boolean) => {
    setInternalOpen(val);
    if (onOpenChange) onOpenChange(val);
  };

  const [callState, setCallState] = useState<"idle" | "requesting_mic" | "connecting" | "active" | "ended" | "mic_error" | "simulating">("idle");
  const [isAgentTalking, setIsAgentTalking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedData, setLastSyncedData] = useState<{ call_log: any; appointment?: any } | null>(null);

  const retellClientRef = useRef<RetellWebClient | null>(null);
  const timerRef = useRef<number | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const fullTranscriptRef = useRef<string>("");
  const callDurationRef = useRef<number>(0);
  const hasSyncedRef = useRef<boolean>(false);
  const simulationAbortRef = useRef<boolean>(false);

  // Sync ref with state
  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

  // Clean up timer and streams on unmount
  useEffect(() => {
    return () => {
      simulationAbortRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (retellClientRef.current) {
        try {
          retellClientRef.current.stopCall();
        } catch (e) {
          // ignore cleanup error
        }
      }
    };
  }, []);

  const finalizeCallAndSync = async () => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    setCallState("ended");
    setIsAgentTalking(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    const cid = activeCallIdRef.current;
    if (!cid) {
      if (onCallCompleted) onCallCompleted();
      return;
    }

    setIsSyncing(true);
    try {
      const syncRes = await retellService.syncCall({
        call_id: cid,
        transcript: fullTranscriptRef.current,
        duration_seconds: callDurationRef.current,
      });

      if (syncRes.ok && syncRes.data) {
        setLastSyncedData(syncRes.data);
        if (onCallCompleted) {
          onCallCompleted(syncRes.data);
        }

        // Broadcast cross-tab and cross-portal call completion event
        try {
          const bc = new BroadcastChannel("2care_call_sync");
          bc.postMessage({
            type: "CALL_COMPLETED",
            call_id: cid,
            timestamp: Date.now(),
            data: syncRes.data,
          });
          bc.close();
        } catch (e) {
          // ignore if BroadcastChannel unsupported
        }
        try {
          localStorage.setItem("2care_last_call_sync", JSON.stringify({
            call_id: cid,
            timestamp: Date.now(),
            appointment: syncRes.data.appointment,
          }));
        } catch (e) {
          // ignore
        }

        if (syncRes.data.appointment) {
          if (showToast) {
            showToast(
              `Appointment Confirmed (${syncRes.data.appointment.reference_id})`,
              `Booked with ${syncRes.data.appointment.doctor_name || "Doctor"} for ${syncRes.data.appointment.patient_name}.`
            );
          }
        } else {
          if (showToast) {
            showToast("Call Telemetry Recorded", `Call ${cid} synced to clinical database.`);
          }
        }
      } else {
        if (onCallCompleted) onCallCompleted();
      }
    } catch (err) {
      console.error("Error synchronizing call data:", err);
      if (onCallCompleted) onCallCompleted();
    } finally {
      setIsSyncing(false);
    }
  };

  const runSimulatedSession = async () => {
    simulationAbortRef.current = false;
    setCallState("simulating");
    setErrorMessage(null);
    setCallDuration(0);
    callDurationRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    const script = [
      { speaker: "agent", text: "Hello! Welcome to 2care Healthcare. How may I help you with your clinical appointment today?" },
      { speaker: "user", text: "Hi, I'd like to book an appointment with Dr. Maya Chen for cardiology." },
      { speaker: "agent", text: "Checking available cardiology slots with Dr. Maya Chen... She has an opening tomorrow at 10:30 AM. Would you like me to reserve that for you?" },
      { speaker: "user", text: "Yes please, that time works perfectly." },
      { speaker: "agent", text: "Wonderful! Your cardiology consultation with Dr. Maya Chen is now confirmed for tomorrow at 10:30 AM." }
    ];

    let fullText = "";
    for (let i = 0; i < script.length; i++) {
      if (simulationAbortRef.current) return;
      const step = script[i];
      setIsAgentTalking(step.speaker === "agent");
      setLastTranscript(`${step.speaker === "agent" ? "Agent" : "You"}: ${step.text}`);
      fullText += `${step.speaker === "agent" ? "Agent" : "User"}: ${step.text}\n`;
      fullTranscriptRef.current = fullText;
      await new Promise((r) => setTimeout(r, 1300));
    }
    setIsAgentTalking(false);

    if (simulationAbortRef.current) return;

    try {
      const simRes = await retellService.simulateCall("booking_success");
      if (simRes.ok && simRes.data) {
        activeCallIdRef.current = simRes.data.call_id;
        finalizeCallAndSync();
      } else {
        finalizeCallAndSync();
      }
    } catch (e) {
      finalizeCallAndSync();
    }
  };

  const handleStartCall = async (forceSimulate = false) => {
    setErrorMessage(null);
    setLastTranscript("");
    fullTranscriptRef.current = "";
    hasSyncedRef.current = false;
    setLastSyncedData(null);
    setIsOpen(true);

    if (forceSimulate) {
      runSimulatedSession();
      return;
    }

    setCallState("requesting_mic");

    // Parallelize token fetching with user media request for instantaneous connection
    const knownPatientName = initialContext?.patient_name || (typeof window !== "undefined" ? localStorage.getItem("2care_current_patient") || undefined : undefined);
    const tokenPromise = retellService.createWebCall({
      patient_name: knownPatientName,
      patient_id: initialContext?.patient_id,
      patient_phone: initialContext?.patient_phone,
      selected_doctor_id: initialContext?.selected_doctor_id,
      selected_doctor_name: initialContext?.selected_doctor_name,
      selected_slot_id: initialContext?.selected_slot_id,
      selected_date: initialContext?.selected_date,
      clinic_name: "2care Clinical Command Center"
    });

    let micStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Audio recording is not supported in this browser context.");
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = micStream;
    } catch (micErr: any) {
      console.warn("Microphone access error or blocked:", micErr);
      setErrorMessage(
        "Microphone was not found or permission was denied. You can enable microphone permissions in your browser, or launch the instant AI Voice simulation below."
      );
      setCallState("mic_error");
      return;
    }

    setCallState("connecting");

    try {
      const res = await tokenPromise;
      if (!res.ok || !res.data?.access_token) {
        let errStr = res.error || "Failed to create web call session from Retell.";
        if (errStr.includes("Failed to fetch")) {
          errStr = "Backend is waking up or connecting. Please retry in a moment or use Demo.";
        }
        throw new Error(errStr);
      }

      const { access_token, call_id } = res.data;
      activeCallIdRef.current = call_id;

      // Broadcast call start across all tabs/windows
      try {
        const bc = new BroadcastChannel("2care_call_sync");
        bc.postMessage({
          type: "CALL_STARTED",
          call_id,
          timestamp: Date.now(),
        });
        bc.close();
      } catch (e) {}

      // Stop any lingering client instance and initialize fresh client
      if (retellClientRef.current) {
        try {
          retellClientRef.current.stopCall();
        } catch (e) {
          // ignore
        }
      }

      const client = new RetellWebClient();
      retellClientRef.current = client;

      // Unlock browser audio playback within the user click gesture
      await client.startAudioPlayback();

      // Setup live event listeners
      client.on("call_started", () => {
        setCallState("active");
        setErrorMessage(null);
        setCallDuration(0);
        callDurationRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
        if (showToast) {
          showToast("Live Voice Call Active", "Say 'Hello' or request a doctor consultation.");
        }
      });

      client.on("call_ended", () => {
        finalizeCallAndSync();
      });

      client.on("agent_start_talking", () => {
        setIsAgentTalking(true);
      });

      client.on("agent_stop_talking", () => {
        setIsAgentTalking(false);
      });

      client.on("update", (update: any) => {
        if (update?.transcript && Array.isArray(update.transcript)) {
          const lines = update.transcript.map((t: any) => `${t.role === "agent" ? "Agent" : "User"}: ${t.content || ""}`);
          fullTranscriptRef.current = lines.join("\n");
          const latest = update.transcript[update.transcript.length - 1];
          if (latest?.content) {
            setLastTranscript(`${latest.role === "agent" ? "Agent" : "You"}: ${latest.content}`);
          }
        }
      });

      client.on("error", (err: any) => {
        console.error("Retell Client Error:", err);
        const msg = typeof err === "string" ? err : err?.message || "Voice agent connection error.";
        setErrorMessage(msg);
        setCallState("idle");
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      });

      // Connect to Retell WebRTC room
      await client.startCall({
        accessToken: access_token,
        callId: call_id,
        emitRawAudioSamples: true,
      });

    } catch (err: any) {
      console.error("Error starting voice call:", err);
      setErrorMessage(err.message || "Failed to connect to Retell voice agent.");
      setCallState("idle");
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    }
  };

  const handleEndCall = () => {
    simulationAbortRef.current = true;
    if (retellClientRef.current) {
      try {
        retellClientRef.current.stopCall();
      } catch (e) {
        console.error("Error stopping call:", e);
      }
    }
    finalizeCallAndSync();
  };

  // Watch triggerCall prop from parent buttons
  useEffect(() => {
    if (triggerCall && triggerCall > 0) {
      setIsOpen(true);
      handleStartCall(false);
    }
  }, [triggerCall]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end max-w-[calc(100vw-32px)]">
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          data-start-voice-call="true"
          onClick={() => {
            setIsOpen(true);
            handleStartCall(false);
          }}
          className="group relative flex items-center gap-2 sm:gap-3 px-3.5 py-2.5 sm:px-5 sm:py-3.5 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium shadow-2xl hover:shadow-cyan-500/25 hover:scale-[1.02] transition-all duration-300 border border-teal-400/30 backdrop-blur-md cursor-pointer"
        >
          <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-400" />
          </span>
          <PhoneCall size={16} className="animate-pulse shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">
            <span className="hidden sm:inline">Talk to Voice Assistant</span>
            <span className="sm:hidden">Voice AI</span>
          </span>
          <span className="text-[10px] sm:text-xs bg-white/20 px-1.5 py-0.5 rounded-full font-mono font-semibold uppercase tracking-wider">
            Live
          </span>
        </button>
      )}

      {/* Expanded Interactive Voice Calling Card */}
      {isOpen && (
        <div className="w-[calc(100vw-32px)] max-w-sm sm:w-96 rounded-2xl bg-[#0f172a]/95 backdrop-blur-xl border border-slate-700/60 shadow-2xl overflow-hidden text-slate-100 transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                  2care Clinical Assistant
                  <span className={`w-2 h-2 rounded-full ${callState === "active" || callState === "simulating" ? "bg-emerald-400 animate-pulse" : "bg-teal-400"}`} />
                </h3>
                <p className="text-xs text-slate-400">Autonomous Retell Voice Agent</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Minimize widget"
              >
                <ChevronDown size={17} />
              </button>
              {callState !== "active" && callState !== "simulating" && (
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close widget"
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 flex flex-col items-center text-center">
            {errorMessage && (
              <div className="w-full mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 text-left">
                <AlertCircle size={16} className="shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Visualizer Area */}
            <div className="relative my-4 flex items-center justify-center">
              {(callState === "active" || callState === "simulating") && (
                <>
                  <div
                    className={`absolute inset-0 rounded-full transition-all duration-500 ${
                      isAgentTalking ? "scale-150 bg-teal-500/20 animate-pulse" : "scale-125 bg-cyan-500/15"
                    }`}
                  />
                  <div
                    className={`absolute -inset-4 rounded-full transition-all duration-700 ${
                      isAgentTalking ? "scale-125 bg-teal-400/10 animate-ping" : "bg-transparent"
                    }`}
                  />
                </>
              )}

              {/* Central Voice Orb */}
              <div
                className={`relative w-24 h-24 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-xl ${
                  callState === "active" || callState === "simulating"
                    ? isAgentTalking
                      ? "border-teal-400 bg-gradient-to-tr from-teal-600 to-cyan-500 shadow-teal-500/40 scale-105"
                      : "border-cyan-400/80 bg-gradient-to-tr from-slate-800 to-slate-700 shadow-cyan-500/20"
                    : callState === "connecting" || callState === "requesting_mic"
                    ? "border-amber-400 bg-amber-500/10 animate-pulse"
                    : callState === "mic_error"
                    ? "border-rose-400 bg-rose-500/10"
                    : "border-slate-700 bg-slate-800/80"
                }`}
              >
                {callState === "requesting_mic" || callState === "connecting" ? (
                  <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                ) : callState === "active" || callState === "simulating" ? (
                  isAgentTalking ? (
                    <Volume2 size={36} className="text-white animate-pulse" />
                  ) : (
                    <Mic size={36} className="text-cyan-300" />
                  )
                ) : callState === "mic_error" ? (
                  <AlertCircle size={32} className="text-rose-400" />
                ) : (
                  <Mic size={32} className="text-slate-400" />
                )}
              </div>
            </div>

            {/* Status & Subtitle */}
            <div className="mt-2 mb-6">
              {callState === "active" || callState === "simulating" ? (
                <>
                  <p className="text-xs uppercase tracking-wider font-semibold text-teal-400 mb-1">
                    {isAgentTalking ? "AI Assistant Speaking..." : "Listening to you..."}
                  </p>
                  <p className="font-mono text-2xl text-white font-medium">{formatTime(callDuration)}</p>
                  {lastTranscript ? (
                    <p className="text-xs text-slate-300 mt-2 italic px-2 line-clamp-2">"{lastTranscript}"</p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                      Ask for a doctor, inquiry, or booking. Speak clearly.
                    </p>
                  )}
                </>
              ) : callState === "requesting_mic" ? (
                <>
                  <p className="text-sm font-medium text-amber-300">Requesting Microphone...</p>
                  <p className="text-xs text-slate-400 mt-1">Please allow microphone permissions in browser</p>
                </>
              ) : callState === "connecting" ? (
                <>
                  <p className="text-sm font-medium text-amber-300">Connecting Voice Stream...</p>
                  <p className="text-xs text-slate-400 mt-1">Establishing real-time WebRTC audio channel</p>
                </>
              ) : callState === "mic_error" ? (
                <>
                  <p className="text-sm font-semibold text-rose-300">Microphone Required or Blocked</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
                    Enable mic in your browser bar, or launch instant simulation to test the full voice consultation flow.
                  </p>
                </>
              ) : callState === "ended" ? (
                <div className="w-full flex flex-col items-center">
                  {isSyncing ? (
                    <div className="flex flex-col items-center py-2">
                      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
                      <p className="text-sm font-semibold text-teal-300">Synchronizing Call Telemetry...</p>
                      <p className="text-xs text-slate-400 mt-0.5">Fetching conversation logs & booking confirmation</p>
                    </div>
                  ) : lastSyncedData?.appointment ? (
                    <div className="w-full text-left bg-gradient-to-br from-teal-950/70 to-slate-900 border border-teal-500/30 rounded-xl p-3.5 mb-2 shadow-lg">
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-teal-500/20">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 size={13} /> Booking Confirmed
                        </span>
                        <span className="font-mono text-xs font-bold text-teal-300 bg-teal-950 px-2 py-0.5 rounded border border-teal-700/50">
                          {lastSyncedData.appointment.reference_id}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="text-white font-medium text-sm">
                          {lastSyncedData.appointment.patient_name}
                        </div>
                        <div className="text-teal-200 flex items-center gap-1.5">
                          <span>{lastSyncedData.appointment.doctor_name || "Specialist"}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-300">{lastSyncedData.appointment.specialty}</span>
                        </div>
                        {lastSyncedData.appointment.scheduled_at && (
                          <div className="text-slate-300 flex items-center gap-1.5 pt-0.5">
                            <Calendar size={13} className="text-cyan-400" />
                            <span>
                              {new Date(lastSyncedData.appointment.scheduled_at).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              at{" "}
                              {new Date(lastSyncedData.appointment.scheduled_at).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                      {onNavigateToAppointments && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onNavigateToAppointments();
                          }}
                          className="mt-3 w-full py-1.5 px-3 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 border border-teal-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>View in Appointments</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full text-left bg-slate-900/80 border border-slate-700/60 rounded-xl p-3.5 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                          <CheckCircle2 size={12} /> Call Recorded
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {formatTime(callDuration)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-3 italic mb-2">
                        "{lastTranscript || "Conversation completed and saved to telemetry."}"
                      </p>
                      {onNavigateToCalls && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onNavigateToCalls();
                          }}
                          className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <FileText size={13} />
                          <span>View in Call Logs</span>
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Telemetry synced with operational backend
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-200">Ready to Assist</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[260px]">
                    Click below to start an interactive clinical booking conversation directly in your browser.
                  </p>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 w-full">
              {(callState === "idle" || callState === "ended") && (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => handleStartCall(false)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium shadow-lg hover:shadow-cyan-500/25 transition-all cursor-pointer"
                  >
                    <PhoneCall size={17} />
                    <span>{callState === "ended" ? "Start New Call" : "Start Live Voice Call"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartCall(true)}
                    className="px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Simulate interactive dialogue"
                  >
                    <Sparkles size={15} />
                    <span>Demo</span>
                  </button>
                </div>
              )}

              {callState === "mic_error" && (
                <div className="flex flex-col gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => handleStartCall(false)}
                    className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                  >
                    <Mic size={15} />
                    <span>Retry Microphone Access</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartCall(true)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                  >
                    <Sparkles size={15} />
                    <span>Launch AI Voice Simulation</span>
                  </button>
                </div>
              )}

              {(callState === "active" || callState === "simulating") && (
                <button
                  type="button"
                  onClick={handleEndCall}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
                >
                  <PhoneOff size={18} />
                  <span>End Call</span>
                </button>
              )}

              {(callState === "connecting" || callState === "requesting_mic") && (
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-slate-400 font-medium cursor-not-allowed"
                >
                  <span>Connecting to Voice Assistant...</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Telephone Dial-in & Infrastructure Footer */}
          <div className="px-5 py-2.5 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Scheduling Backend Live & Synced
            </span>
            <span className="font-mono text-slate-400 text-[11px]">24/7 Voice Care</span>
          </div>
        </div>
      )}
    </div>
  );
}
