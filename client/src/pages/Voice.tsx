import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, StopCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AVATARS } from "@/lib/utils";

type Phase = "idle" | "listening" | "thinking" | "speaking";

interface LangInfo {
  code: string;
  name: string;
}

function detectLanguage(text: string): LangInfo {
  if (/[\u0900-\u097F]/.test(text)) return { code: "hi-IN", name: "Hindi" };
  if (/[\u0600-\u06FF]/.test(text)) return { code: "ar-SA", name: "Arabic" };
  if (/[\u4E00-\u9FFF]/.test(text)) return { code: "zh-CN", name: "Chinese" };
  if (/[\u3040-\u30FF]/.test(text)) return { code: "ja-JP", name: "Japanese" };
  if (/[\uAC00-\uD7AF]/.test(text)) return { code: "ko-KR", name: "Korean" };
  if (/[\u0A00-\u0A7F]/.test(text)) return { code: "pa-IN", name: "Punjabi" };
  if (/[\u0B80-\u0BFF]/.test(text)) return { code: "ta-IN", name: "Tamil" };
  if (/[\u0C00-\u0C7F]/.test(text)) return { code: "te-IN", name: "Telugu" };
  if (/[\u0D00-\u0D7F]/.test(text)) return { code: "ml-IN", name: "Malayalam" };
  if (/[\u0980-\u09FF]/.test(text)) return { code: "bn-IN", name: "Bengali" };
  return { code: "en-US", name: "English" };
}

function getBestVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const lang2 = langCode.slice(0, 2);
  return (
    voices.find((v) => v.name.toLowerCase().includes("google") && v.lang === langCode) ||
    voices.find((v) => v.name.toLowerCase().includes("google") && v.lang.startsWith(lang2)) ||
    voices.find((v) => v.lang === langCode) ||
    voices.find((v) => v.lang.startsWith(lang2)) ||
    (lang2 === "en" ? voices.find((v) => /female|zira|hazel|samantha|karen|moira|fiona/i.test(v.name)) : null) ||
    voices[0] ||
    null
  );
}

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return raw.map((s) => s.trim()).filter(Boolean);
}

export default function Voice() {
  const { id } = useParams();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [userText, setUserText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [aiText, setAiText] = useState("");
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [detectedLangName, setDetectedLangName] = useState("English");

  const convIdRef = useRef<number | null>(id ? parseInt(id) : null);
  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const detectedLangRef = useRef<LangInfo>({ code: "en-US", name: "English" });
  // Chrome SpeechSynthesis keepalive interval
  const synthKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Watchdog to detect when onend doesn't fire
  const synthWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  function go(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function clearSynthTimers() {
    if (synthKeepAliveRef.current) {
      clearInterval(synthKeepAliveRef.current);
      synthKeepAliveRef.current = null;
    }
    if (synthWatchdogRef.current) {
      clearTimeout(synthWatchdogRef.current);
      synthWatchdogRef.current = null;
    }
  }

  function onSpeechDone() {
    clearSynthTimers();
    if (activeRef.current) {
      setTimeout(() => listen(), 450);
    } else {
      go("idle");
    }
  }

  function speak(text: string) {
    speechSynthesis.cancel();
    clearSynthTimers();

    const lang = detectedLangRef.current.code;
    const sentences = splitSentences(text);
    if (sentences.length === 0) { onSpeechDone(); return; }

    go("speaking");

    // Chrome fix: resume synthesis every 5s to prevent auto-pause bug
    synthKeepAliveRef.current = setInterval(() => {
      if (speechSynthesis.paused) speechSynthesis.resume();
    }, 5000);

    let currentIndex = 0;
    let onEndFired = false;

    const speakNext = (index: number) => {
      if (index >= sentences.length) {
        onSpeechDone();
        return;
      }

      currentIndex = index;
      onEndFired = false;

      const utter = new SpeechSynthesisUtterance(sentences[index]);
      utter.lang = lang;
      utter.rate = 0.95;
      utter.pitch = 1.05;
      utter.volume = 1;

      const voice = getBestVoice(lang);
      if (voice) utter.voice = voice;

      // Estimate fallback timeout: ~130 chars/sec + 1.5s buffer
      const estimatedMs = (sentences[index].length / 130) * 1000 + 1500;

      utter.onstart = () => {
        // Set a watchdog in case onend doesn't fire (Chrome bug)
        if (synthWatchdogRef.current) clearTimeout(synthWatchdogRef.current);
        synthWatchdogRef.current = setTimeout(() => {
          if (!onEndFired) {
            speakNext(currentIndex + 1);
          }
        }, estimatedMs);
      };

      utter.onend = () => {
        onEndFired = true;
        if (synthWatchdogRef.current) {
          clearTimeout(synthWatchdogRef.current);
          synthWatchdogRef.current = null;
        }
        setTimeout(() => speakNext(index + 1), 80);
      };

      utter.onerror = (e) => {
        onEndFired = true;
        if (synthWatchdogRef.current) {
          clearTimeout(synthWatchdogRef.current);
          synthWatchdogRef.current = null;
        }
        if (e.error !== "interrupted") {
          speakNext(index + 1);
        }
      };

      speechSynthesis.speak(utter);
    };

    speakNext(0);
  }

  async function askAI(text: string) {
    const convId = convIdRef.current;
    if (!convId) { go("idle"); return; }

    const lang = detectLanguage(text);
    detectedLangRef.current = lang;
    setDetectedLangName(lang.name);

    go("thinking");

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
        credentials: "include",
      });

      if (!res.ok || !res.body) throw new Error("Bad response");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
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

      const reply = full.trim();
      if (reply) {
        setAiText(reply);
        speak(reply);
      } else {
        go("idle");
      }
    } catch (err) {
      console.error("AI error:", err);
      const fallback = "Sorry, something went wrong. Please try again.";
      setAiText(fallback);
      speak(fallback);
    }
  }

  function listen() {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) { setSupported(false); go("idle"); return; }
    if (!convIdRef.current) { go("idle"); return; }
    if (phaseRef.current === "listening") return;

    const rec = new SR();
    rec.lang = detectedLangRef.current.code || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let final = "";

    rec.onstart = () => {
      go("listening");
      setInterimText("");
      final = "";
    };

    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInterimText(interim);
      if (final) setUserText(final);
    };

    rec.onend = () => {
      setInterimText("");
      const text = final.trim();
      if (text) {
        askAI(text);
      } else if (activeRef.current) {
        setTimeout(() => listen(), 300);
      } else {
        go("idle");
      }
    };

    rec.onerror = (e: any) => {
      const recoverable = e.error === "no-speech" || e.error === "aborted";
      if (recoverable && activeRef.current && phaseRef.current === "listening") {
        setTimeout(() => listen(), 300);
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSupported(false);
        go("idle");
      } else {
        console.error("Recognition error:", e.error);
        go("idle");
      }
    };

    try {
      rec.start();
    } catch (err) {
      console.error("Recognition start failed:", err);
      go("idle");
    }
  }

  function stopAll() {
    activeRef.current = false;
    setActive(false);
    clearSynthTimers();
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    speechSynthesis.cancel();
    go("idle");
    setInterimText("");
  }

  function handleButtonClick() {
    if (!ready || !supported) return;
    if (phaseRef.current === "thinking") return;

    if (phaseRef.current === "speaking") {
      speechSynthesis.cancel();
      clearSynthTimers();
      if (!activeRef.current) { activeRef.current = true; setActive(true); }
      setTimeout(() => listen(), 100);
      return;
    }

    if (phaseRef.current === "listening") {
      stopAll();
      return;
    }

    // Idle → start
    activeRef.current = true;
    setActive(true);
    listen();
  }

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) { setSupported(false); setReady(true); return; }

    // Trigger Chrome to load voices (lazy-loaded)
    const loadVoices = () => speechSynthesis.getVoices();
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    const initConv = async () => {
      if (convIdRef.current) { setReady(true); return; }
      try {
        const listRes = await fetch("/api/conversations", { credentials: "include" });
        if (listRes.ok) {
          const list = await listRes.json();
          if (list?.length > 0) {
            convIdRef.current = list[0].id;
            setReady(true);
            return;
          }
        }
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Voice Session" }),
          credentials: "include",
        });
        const conv = await createRes.json();
        convIdRef.current = conv.id;
      } catch (e) {
        console.error("Conv init error:", e);
      } finally {
        setReady(true);
      }
    };

    initConv();

    return () => {
      activeRef.current = false;
      clearSynthTimers();
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
      speechSynthesis.cancel();
    };
  }, []);

  const color =
    phase === "listening" ? "#ef4444"
    : phase === "thinking" ? "#fbbf24"
    : phase === "speaking" ? "#a78bfa"
    : "#00e5ff";

  const label =
    !ready ? "⌛ INITIALIZING"
    : !supported ? "⚠ NOT SUPPORTED — USE CHROME"
    : phase === "listening" ? "🎙️ LISTENING"
    : phase === "thinking"  ? "⚙️  THINKING"
    : phase === "speaking"  ? "🔊 SPEAKING"
    : "✓  READY — TAP TO TALK";

  const barsOn = phase === "listening" || phase === "speaking";

  const panelText =
    phase === "listening"
      ? (interimText || userText || "Listening... speak now")
      : phase === "thinking"
      ? `"${userText}"`
      : phase === "speaking"
      ? aiText
      : userText
      ? `"${userText}"`
      : !supported
      ? "Voice recognition is not supported in this browser. Please use Chrome or Edge."
      : "Tap the mic button to start talking";

  const panelTag =
    phase === "listening" ? "YOU"
    : phase === "thinking" ? "YOU SAID"
    : phase === "speaking" ? "AI"
    : "";

  return (
    <Layout title="Aichat - Voice Chat" showBack>
      <div className="flex-1 flex flex-col items-center justify-between py-6 px-4 relative">

        <div className="w-full text-center">
          <div className="flex items-center justify-center gap-3 mb-5">
            <motion.p
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.3, repeat: Infinity }}
              className="text-[11px] font-heading font-bold tracking-[0.3em]"
              style={{ color }}
            >
              {label}
            </motion.p>
            {phase !== "idle" && detectedLangName !== "English" && (
              <span className="text-[10px] font-heading px-2 py-0.5 rounded-full border border-white/15 text-white/50">
                {detectedLangName}
              </span>
            )}
          </div>

          {/* Waveform bars */}
          <div className="h-16 flex items-center justify-center gap-[3px] mb-6">
            {Array.from({ length: 24 }, (_, i) => (
              <motion.div
                key={i}
                animate={
                  barsOn
                    ? { scaleY: [0.1, 1, 0.3, 0.8, 0.1], opacity: [0.5, 1, 0.6, 1, 0.5] }
                    : { scaleY: 0.08, opacity: 0.2 }
                }
                transition={{
                  duration: 0.7 + (i % 5) * 0.14,
                  repeat: Infinity,
                  repeatType: "mirror",
                  delay: i * 0.04,
                  ease: "easeInOut",
                }}
                className="w-[5px] h-14 rounded-full origin-center"
                style={{
                  background:
                    phase === "speaking"
                      ? `rgba(138,124,255,${0.45 + (i % 3) * 0.18})`
                      : phase === "listening"
                      ? `rgba(239,68,68,${0.45 + (i % 3) * 0.18})`
                      : `rgba(0,229,255,${0.2 + (i % 3) * 0.1})`,
                  boxShadow: barsOn
                    ? phase === "speaking"
                      ? "0 0 8px rgba(138,124,255,0.5)"
                      : "0 0 8px rgba(239,68,68,0.5)"
                    : "none",
                }}
              />
            ))}
          </div>

          {/* Transcript panel */}
          <div className="glass-panel rounded-2xl p-4 min-h-[110px] flex flex-col items-start justify-center text-left relative overflow-hidden">
            {panelTag && (
              <span
                className="text-[10px] font-heading font-bold tracking-widest mb-2"
                style={{ color, opacity: 0.65 }}
              >
                {panelTag}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.p
                key={phase + panelText.slice(0, 24)}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={`text-sm leading-relaxed ${
                  phase === "speaking"
                    ? "text-accent font-medium"
                    : phase === "listening" && interimText
                    ? "text-white/55 italic"
                    : "text-white/80"
                }`}
              >
                {panelText}
              </motion.p>
            </AnimatePresence>

            {phase === "thinking" && (
              <div className="absolute bottom-3 right-4 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.2, 1, 0.2], scale: [0.7, 1.2, 0.7] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.28 }}
                    className="w-2 h-2 rounded-full bg-yellow-400"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 mt-6 relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 scale-[2.2] blur-xl">
            <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-full mix-blend-screen" />
          </div>

          <motion.button
            onClick={handleButtonClick}
            disabled={!ready || !supported || phase === "thinking"}
            data-testid="button-mic"
            whileTap={{ scale: 0.9 }}
            animate={
              phase === "listening"
                ? { scale: [1, 1.09, 1], boxShadow: ["0 0 25px rgba(239,68,68,0.4)", "0 0 55px rgba(239,68,68,0.75)", "0 0 25px rgba(239,68,68,0.4)"] }
                : phase === "speaking"
                ? { scale: [1, 1.05, 1], boxShadow: ["0 0 25px rgba(138,124,255,0.4)", "0 0 55px rgba(138,124,255,0.75)", "0 0 25px rgba(138,124,255,0.4)"] }
                : { boxShadow: "0 0 30px rgba(0,229,255,0.35)" }
            }
            transition={{ duration: 1.3, repeat: Infinity }}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-colors duration-300 disabled:opacity-35 disabled:cursor-not-allowed ${
              phase === "listening" ? "bg-red-500 text-white"
              : phase === "speaking" ? "bg-violet-500 text-white"
              : phase === "thinking" ? "bg-yellow-500 text-black"
              : "bg-primary text-black hover:brightness-110"
            }`}
          >
            {phase === "listening" ? (
              <Square className="w-8 h-8 fill-current" />
            ) : phase === "thinking" ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Mic className="w-9 h-9" />
            )}
          </motion.button>

          <p className="text-white/35 text-[11px] font-heading tracking-wider z-10 select-none text-center">
            {phase === "listening" ? "Tap to stop"
            : phase === "speaking" ? "Tap to interrupt & speak"
            : phase === "thinking" ? "Generating response..."
            : "Tap to start talking"}
          </p>

          <AnimatePresence>
            {active && phase !== "idle" && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={stopAll}
                data-testid="button-stop"
                className="z-10 flex items-center gap-2 px-5 py-2 rounded-full border border-white/15 bg-white/5 text-white/55 text-[11px] font-heading tracking-widest hover:bg-white/12 hover:text-white/80 transition-all"
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
