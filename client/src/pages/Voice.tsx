import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Volume2, StopCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AVATARS } from "@/lib/utils";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

async function getOrCreateConversationId(): Promise<number> {
  const listRes = await fetch("/api/conversations", { credentials: "include" });
  if (listRes.ok) {
    const list = await listRes.json();
    if (list && list.length > 0) return list[0].id;
  }
  const createRes = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Voice Session" }),
    credentials: "include",
  });
  if (!createRes.ok) throw new Error("Failed to create conversation");
  const conv = await createRes.json();
  return conv.id;
}

async function getAIReply(convId: number, userText: string): Promise<string> {
  const res = await fetch(`/api/conversations/${convId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: userText, voiceMode: true }),
    credentials: "include",
  });
  if (!res.body) throw new Error("No response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if (d.content) full += d.content;
      } catch {}
    }
  }
  return full.trim();
}

function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ||
    voices.find((v) => v.lang.startsWith("en-US")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    null
  );
}

export default function Voice() {
  const { id } = useParams();
  const { user } = useAuth();

  const [convId, setConvId] = useState<number | null>(id ? parseInt(id) : null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [userText, setUserText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [aiText, setAiText] = useState("");
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voicesReady, setVoicesReady] = useState(false);

  const convIdRef = useRef<number | null>(null);
  const autoModeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const stateRef = useRef<VoiceState>("idle");

  convIdRef.current = convId;
  autoModeRef.current = isAutoMode;
  stateRef.current = voiceState;

  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  // Load voices (Chrome needs a trigger)
  useEffect(() => {
    const load = () => setVoicesReady(true);
    if (speechSynthesis.getVoices().length > 0) {
      setVoicesReady(true);
    } else {
      speechSynthesis.addEventListener("voiceschanged", load);
      return () => speechSynthesis.removeEventListener("voiceschanged", load);
    }
  }, []);

  // Setup conversation
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      return;
    }
    if (!convId) {
      getOrCreateConversationId().then(setConvId).catch(console.error);
    }
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      speechSynthesis.cancel();
    };
  }, []);

  const speakReply = useCallback((text: string) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    utterance.volume = 1;
    const voice = getBestVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      setVoiceState("speaking");
      stateRef.current = "speaking";
    };
    utterance.onend = () => {
      if (autoModeRef.current) {
        setTimeout(() => startListening(), 400);
      } else {
        setVoiceState("idle");
        stateRef.current = "idle";
      }
    };
    utterance.onerror = () => {
      setVoiceState("idle");
      stateRef.current = "idle";
    };

    setVoiceState("speaking");
    stateRef.current = "speaking";
    speechSynthesis.speak(utterance);
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !convIdRef.current) return;

    // Don't double-start
    if (stateRef.current === "listening") return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    let finalText = "";

    recognition.onstart = () => {
      setVoiceState("listening");
      stateRef.current = "listening";
      setInterimText("");
      finalText = "";
    };

    recognition.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
      if (finalText) setUserText(finalText);
    };

    recognition.onend = async () => {
      setInterimText("");
      const text = finalText.trim();

      if (!text) {
        // No speech detected
        if (autoModeRef.current) {
          setTimeout(() => startListening(), 300);
        } else {
          setVoiceState("idle");
          stateRef.current = "idle";
        }
        return;
      }

      // Got speech — query AI
      setUserText(text);
      setVoiceState("thinking");
      stateRef.current = "thinking";

      try {
        const reply = await getAIReply(convIdRef.current!, text);
        if (!reply) throw new Error("Empty reply");
        setAiText(reply);
        speakReply(reply);
      } catch {
        setAiText("Sorry, I had trouble responding. Please try again.");
        setVoiceState("idle");
        stateRef.current = "idle";
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") {
        if (autoModeRef.current && stateRef.current === "listening") {
          setTimeout(() => startListening(), 300);
          return;
        }
      }
      setVoiceState("idle");
      stateRef.current = "idle";
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {}
  }, [speakReply]);

  const stopEverything = useCallback(() => {
    setIsAutoMode(false);
    autoModeRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    speechSynthesis.cancel();
    setVoiceState("idle");
    stateRef.current = "idle";
    setInterimText("");
  }, []);

  const handleMainButton = () => {
    if (!convId || !isSupported) return;

    if (voiceState === "thinking") return; // can't interrupt thinking

    if (voiceState === "speaking") {
      // Interrupt — stop speaking and start listening
      speechSynthesis.cancel();
      setIsAutoMode(true);
      autoModeRef.current = true;
      setTimeout(() => startListening(), 100);
      return;
    }

    if (voiceState === "listening") {
      // Manual stop listening
      stopEverything();
      return;
    }

    // Start conversation
    setIsAutoMode(true);
    autoModeRef.current = true;
    startListening();
  };

  // Display text in the panel
  const panelText =
    voiceState === "listening"
      ? interimText || userText || "Listening... speak now"
      : voiceState === "thinking"
      ? `"${userText}"`
      : voiceState === "speaking"
      ? aiText
      : userText
      ? `"${userText}"`
      : isSupported
      ? "Tap the mic to start talking"
      : "Voice recognition is not supported in this browser. Please use Chrome.";

  const panelLabel =
    voiceState === "listening"
      ? "YOU"
      : voiceState === "thinking"
      ? "YOU SAID"
      : voiceState === "speaking"
      ? "AI"
      : "";

  const stateColor =
    voiceState === "listening"
      ? "#ef4444"
      : voiceState === "thinking"
      ? "#fbbf24"
      : voiceState === "speaking"
      ? "#a78bfa"
      : "#00e5ff";

  const stateLabel =
    !convId
      ? "⌛ INITIALIZING"
      : voiceState === "listening"
      ? "🎙️ LISTENING"
      : voiceState === "thinking"
      ? "⚙️ THINKING"
      : voiceState === "speaking"
      ? "🔊 SPEAKING"
      : "✓ READY — TAP MIC TO TALK";

  const barsActive = voiceState === "listening" || voiceState === "speaking";

  return (
    <Layout title="Aichat - Voice Chat" showBack>
      <div className="flex-1 flex flex-col items-center justify-between py-8 relative px-4">

        {/* Status label */}
        <div className="w-full text-center">
          <motion.p
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="text-xs font-heading font-bold tracking-[0.3em] mb-6"
            style={{ color: stateColor }}
          >
            {stateLabel}
          </motion.p>

          {/* Waveform visualizer */}
          <div className="h-20 flex items-center justify-center gap-[3px] mb-8">
            {[...Array(24)].map((_, i) => (
              <motion.div
                key={i}
                animate={
                  barsActive
                    ? {
                        scaleY: [0.15, 1, 0.3, 0.8, 0.15],
                        opacity: [0.6, 1, 0.7, 1, 0.6],
                      }
                    : { scaleY: 0.1, opacity: 0.3 }
                }
                transition={{
                  duration: 0.8 + (i % 5) * 0.15,
                  repeat: Infinity,
                  repeatType: "mirror",
                  delay: i * 0.04,
                  ease: "easeInOut",
                }}
                className="w-[6px] h-16 rounded-full origin-center"
                style={{
                  background:
                    voiceState === "speaking"
                      ? `rgba(138,124,255,${0.5 + (i % 3) * 0.2})`
                      : voiceState === "listening"
                      ? `rgba(239,68,68,${0.5 + (i % 3) * 0.2})`
                      : `rgba(0,229,255,${0.3 + (i % 3) * 0.15})`,
                  boxShadow:
                    barsActive
                      ? voiceState === "speaking"
                        ? "0 0 8px rgba(138,124,255,0.6)"
                        : "0 0 8px rgba(239,68,68,0.6)"
                      : "none",
                }}
              />
            ))}
          </div>

          {/* Transcript panel */}
          <div className="glass-panel rounded-2xl p-5 min-h-[130px] flex flex-col items-start justify-center text-left relative overflow-hidden">
            {panelLabel && (
              <span
                className="text-[10px] font-heading font-bold tracking-widest mb-2 opacity-60"
                style={{ color: stateColor }}
              >
                {panelLabel}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.p
                key={voiceState + panelText.slice(0, 20)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`text-sm leading-relaxed ${
                  voiceState === "speaking"
                    ? "text-accent font-medium"
                    : voiceState === "listening" && interimText
                    ? "text-white/60 italic"
                    : "text-white/80"
                }`}
              >
                {panelText}
              </motion.p>
            </AnimatePresence>
            {voiceState === "thinking" && (
              <div className="absolute bottom-3 right-4 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.25 }}
                    className="w-2 h-2 rounded-full bg-yellow-400"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-5 mt-8 relative">
          {/* Ghosted avatar behind button */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 scale-[2] blur-md">
            <img
              src={avatarUrl}
              alt=""
              className="w-full h-full object-cover rounded-full mix-blend-screen"
            />
          </div>

          {/* Main mic/action button */}
          <motion.button
            onClick={handleMainButton}
            disabled={!convId || !isSupported || voiceState === "thinking"}
            data-testid="button-mic"
            whileTap={{ scale: 0.93 }}
            animate={
              voiceState === "listening"
                ? { scale: [1, 1.07, 1], boxShadow: ["0 0 30px rgba(239,68,68,0.5)", "0 0 50px rgba(239,68,68,0.8)", "0 0 30px rgba(239,68,68,0.5)"] }
                : voiceState === "speaking"
                ? { scale: [1, 1.04, 1], boxShadow: ["0 0 30px rgba(138,124,255,0.5)", "0 0 50px rgba(138,124,255,0.8)", "0 0 30px rgba(138,124,255,0.5)"] }
                : {}
            }
            transition={{ duration: 1.2, repeat: Infinity }}
            className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-colors duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
              voiceState === "listening"
                ? "bg-red-500 text-white"
                : voiceState === "speaking"
                ? "bg-violet-500 text-white"
                : voiceState === "thinking"
                ? "bg-yellow-500 text-black"
                : "bg-primary text-black hover:brightness-110"
            }`}
          >
            {voiceState === "listening" ? (
              <Square className="w-9 h-9 fill-current" />
            ) : voiceState === "speaking" ? (
              <Mic className="w-10 h-10" />
            ) : voiceState === "thinking" ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-9 h-9 border-[3px] border-black border-t-transparent rounded-full"
              />
            ) : (
              <Mic className="w-10 h-10" />
            )}
          </motion.button>

          {/* Mic hint text */}
          <p className="text-white/40 text-[11px] font-heading tracking-wider text-center z-10">
            {voiceState === "listening"
              ? "Tap to stop"
              : voiceState === "speaking"
              ? "Tap to interrupt"
              : voiceState === "thinking"
              ? "Processing..."
              : "Tap to talk"}
          </p>

          {/* Stop conversation button */}
          <AnimatePresence>
            {isAutoMode && voiceState !== "idle" && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={stopEverything}
                data-testid="button-stop"
                className="z-10 flex items-center gap-2 px-5 py-2 rounded-full bg-white/8 border border-white/15 text-white/60 text-xs font-heading tracking-widest hover:bg-white/15 hover:text-white/90 transition-all"
              >
                <StopCircle className="w-3.5 h-3.5" />
                END CONVERSATION
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </div>
    </Layout>
  );
}
