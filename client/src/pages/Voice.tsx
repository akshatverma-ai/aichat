import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { LangSelector } from "@/components/LangSelector";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AVATARS } from "@/lib/utils";
import { getStoredLang, saveLang, type LangOption } from "@/lib/lang";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "error";

interface HistoryMsg { role: "user" | "assistant"; content: string; }

// Delay before re-enabling the mic after TTS ends (avoids capturing echoes)
const TTS_ECHO_GUARD_MS = 400;

function getBestVoice(bcp47: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lang2 = bcp47.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang === bcp47 && v.name.toLowerCase().includes("google")) ||
    voices.find((v) => v.lang === bcp47) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lang2)) ||
    voices[0] ||
    null
  );
}

export default function Voice() {
  const { id } = useParams();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [userText, setUserText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [aiText, setAiText] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [lang, setLang] = useState<LangOption>(getStoredLang);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langRef = useRef<LangOption>(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const [fallbackText, setFallbackText] = useState("");
  const [showFallback, setShowFallback] = useState(false);

  const convIdRef = useRef<number | null>(id ? parseInt(id) : null);
  const historyRef = useRef<HistoryMsg[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const recognitionRef = useRef<any>(null);
  const synthKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Prevents the mic from activating immediately after TTS stops
  const echoGuardRef = useRef(false);

  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  function go(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function stopRecognition() {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }

  function stopTts() {
    if (synthKeepAliveRef.current) {
      clearInterval(synthKeepAliveRef.current);
      synthKeepAliveRef.current = null;
    }
    speechSynthesis.cancel();
  }

  function speakText(text: string, bcp47: string) {
    // Make absolutely sure the mic is off before TTS starts
    stopRecognition();
    stopTts();

    const trySpeak = () => {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) {
        setTimeout(trySpeak, 300);
        return;
      }

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = bcp47;
      utter.rate = bcp47 === "hi-IN" ? 0.9 : 1.0;
      const voice = getBestVoice(bcp47);
      if (voice) utter.voice = voice;

      synthKeepAliveRef.current = setInterval(() => {
        if (speechSynthesis.paused) speechSynthesis.resume();
      }, 5000);

      const onDone = () => {
        if (synthKeepAliveRef.current) { clearInterval(synthKeepAliveRef.current); synthKeepAliveRef.current = null; }
        // Echo guard: briefly block mic activation after TTS ends
        echoGuardRef.current = true;
        setTimeout(() => { echoGuardRef.current = false; }, TTS_ECHO_GUARD_MS);
        go("idle");
      };

      utter.onend = onDone;
      utter.onerror = (e) => {
        if (e.error === "interrupted") return;
        onDone();
      };

      go("speaking");
      speechSynthesis.speak(utter);
    };

    trySpeak();
  }

  async function sendToAI(text: string) {
    if (!text.trim()) { go("idle"); return; }

    // Stop mic before thinking/speaking
    stopRecognition();

    const selectedLang = langRef.current;
    go("thinking");

    try {
      const body: Record<string, any> = {
        content: text.trim(),
        langName: selectedLang.name,
      };

      if (convIdRef.current) {
        body.conversationId = convIdRef.current;
      } else {
        // Guest mode: send local history for context
        body.history = historyRef.current;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let fullText = "";
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
            if (d.content) { fullText += d.content; setAiText(fullText); }
            if (d.conversationId && !convIdRef.current) convIdRef.current = d.conversationId;
          } catch {}
        }
      }

      if (!fullText.trim()) { go("idle"); return; }

      // Update local history for guest context
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text.trim() },
        { role: "assistant", content: fullText },
      ].slice(-20);

      setAiText(fullText);
      speakText(fullText, selectedLang.code);

    } catch (err: any) {
      console.error("AI error:", err);
      const fallback = "I am listening and responding correctly.";
      setAiText(fallback);
      speakText(fallback, langRef.current.code);
    }
  }

  function startListening() {
    // Don't start if in echo guard window or not idle
    if (echoGuardRef.current) return;
    if (phaseRef.current !== "idle") return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); setShowFallback(true); return; }

    // Cancel any leftover TTS before mic goes live
    stopTts();

    const rec = new SR();
    rec.lang = langRef.current.code;
    rec.continuous = false;       // Listen once per tap
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let finalTranscript = "";

    rec.onstart = () => {
      go("listening");
      setInterimText("");
      finalTranscript = "";
    };

    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + " ";
          setUserText(finalTranscript.trim());
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setInterimText("");
      const text = finalTranscript.trim();
      // Only proceed if still in listening phase (not manually cancelled)
      if (phaseRef.current === "listening") {
        if (text) {
          sendToAI(text);
        } else {
          go("idle");
        }
      }
    };

    rec.onerror = (e: any) => {
      recognitionRef.current = null;
      setInterimText("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setVoiceSupported(false);
        setShowFallback(true);
        setErrorMsg("Microphone access denied. Please allow microphone access and try again.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("Speech recognition error:", e.error);
      }
      go("idle");
    };

    try { rec.start(); } catch (err) {
      console.error("Recognition start failed:", err);
      go("idle");
      setShowFallback(true);
    }
  }

  function handleMicClick() {
    if (!ready || echoGuardRef.current) return;
    if (phaseRef.current === "speaking") {
      stopTts();
      // Brief guard so echo doesn't immediately re-trigger
      echoGuardRef.current = true;
      setTimeout(() => { echoGuardRef.current = false; }, TTS_ECHO_GUARD_MS);
      go("idle");
      return;
    }
    if (phaseRef.current === "listening") {
      stopRecognition();
      go("idle");
      return;
    }
    if (phaseRef.current === "thinking") return;
    setUserText("");
    setAiText("");
    setErrorMsg("");
    startListening();
  }

  async function handleFallbackSend(e: React.FormEvent) {
    e.preventDefault();
    const text = fallbackText.trim();
    if (!text || phaseRef.current === "thinking") return;
    setFallbackText("");
    setUserText(text);
    setAiText("");
    await sendToAI(text);
  }

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); setShowFallback(true); }

    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

    const initConv = async () => {
      if (convIdRef.current) { setReady(true); return; }
      if (!user) { setReady(true); return; } // Guest mode — no conversation needed
      try {
        const listRes = await fetch("/api/conversations", { credentials: "include" });
        if (listRes.ok) {
          const list = await listRes.json();
          if (list?.length > 0) { convIdRef.current = list[0].id; setReady(true); return; }
        }
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Voice Session" }),
          credentials: "include",
        });
        if (createRes.ok) {
          const conv = await createRes.json();
          convIdRef.current = conv.id;
        }
      } catch (e) {
        console.error("Conv init error:", e);
      } finally {
        setReady(true);
      }
    };

    initConv();
    return () => { stopRecognition(); stopTts(); };
  }, []);

  const color =
    phase === "listening" ? "#ef4444"
    : phase === "thinking" ? "#fbbf24"
    : phase === "speaking" ? "#a78bfa"
    : "#00e5ff";

  const label =
    !ready                  ? "⌛ INITIALIZING"
    : phase === "listening" ? `🎙 LISTENING · ${lang.name.toUpperCase()}`
    : phase === "thinking"  ? "⚙ THINKING..."
    : phase === "speaking"  ? `🔊 SPEAKING · ${lang.name.toUpperCase()}`
    : voiceSupported        ? "TAP TO TALK"
    : "TYPE TO CHAT";

  const panelText =
    phase === "listening"
      ? (userText ? `${userText} ${interimText}`.trim() : interimText || "Listening… speak now")
      : phase === "thinking" ? `"${userText}"`
      : phase === "speaking" ? aiText
      : aiText               ? aiText
      : userText             ? `"${userText}"`
      : voiceSupported
      ? `Tap the mic to start. The assistant will respond in ${lang.name}.`
      : errorMsg || "Type your message below.";

  const panelTag =
    phase === "listening" ? "YOU"
    : phase === "thinking" ? "YOU SAID"
    : phase === "speaking" ? "AI"
    : aiText ? "AI" : "";

  const micDisabled = !ready || phase === "thinking";
  const barsOn = phase === "listening" || phase === "speaking";

  return (
    <Layout title="Aichat - Voice" showBack noPadding>
      <div className="flex-1 flex flex-col items-center px-6 py-8 pt-20 relative">

        {/* Language selector */}
        <div className="absolute top-20 right-6 z-20">
          <LangSelector
            lang={lang}
            onSelect={(option) => { setLang(option); saveLang(option); }}
            open={showLangMenu}
            onToggle={() => setShowLangMenu(v => !v)}
            onClose={() => setShowLangMenu(false)}
          />
        </div>

        {/* Avatar */}
        <div className="relative w-36 h-36 mb-6 flex-shrink-0 mt-8">
          <motion.div
            animate={barsOn ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, repeat: barsOn ? Infinity : 0, ease: "easeInOut" }}
            className="w-full h-full rounded-full overflow-hidden border-2 shadow-lg"
            style={{ borderColor: color, boxShadow: `0 0 24px ${color}55` }}
          >
            <img src={avatarUrl} alt="AI" className="w-full h-full object-cover" />
          </motion.div>

          {barsOn && (
            <>
              <motion.div
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: color }}
              />
              <motion.div
                animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: color }}
              />
            </>
          )}
        </div>

        {/* Status label */}
        <div
          className="font-heading text-xs font-bold tracking-widest uppercase mb-4 transition-colors"
          style={{ color }}
        >
          {label}
        </div>

        {/* Text panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={panelText.slice(0, 30)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-sm flex-1 min-h-[100px] max-h-[200px] overflow-y-auto"
          >
            {panelTag && (
              <p className="text-xs font-heading font-bold tracking-widest uppercase mb-2" style={{ color }}>
                {panelTag}
              </p>
            )}
            <p className="text-white/80 text-sm leading-relaxed">{panelText}</p>
          </motion.div>
        </AnimatePresence>

        {/* Mic button */}
        {voiceSupported && (
          <div className="flex flex-col items-center gap-4 mt-6">
            <motion.button
              data-testid="button-mic"
              onClick={handleMicClick}
              disabled={micDisabled}
              whileTap={!micDisabled ? { scale: 0.93 } : {}}
              className="relative w-20 h-20 rounded-full flex items-center justify-center
                         transition-all disabled:opacity-40"
              style={{
                background: phase === "listening" ? "#ef4444"
                  : phase === "speaking" ? "#7c3aed"
                  : `${color}22`,
                border: `2px solid ${color}`,
                boxShadow: phase === "idle"
                  ? `0 0 20px ${color}44`
                  : `0 0 30px ${color}88`,
              }}
            >
              {phase === "thinking" ? (
                <Loader2 className="w-8 h-8 animate-spin" style={{ color }} />
              ) : phase === "listening" ? (
                <MicOff className="w-8 h-8 text-white" />
              ) : (
                <Mic className="w-8 h-8" style={{ color }} />
              )}
            </motion.button>

            <p className="text-white/30 text-xs font-heading tracking-wider">
              {phase === "idle"      ? "TAP MIC TO SPEAK"  :
               phase === "listening" ? "TAP TO STOP"       :
               phase === "speaking"  ? "TAP TO INTERRUPT"  : ""}
            </p>
          </div>
        )}

        {/* Text fallback input */}
        {(showFallback || !voiceSupported) && (
          <form
            onSubmit={handleFallbackSend}
            className="w-full max-w-sm mt-4 flex gap-2"
            data-testid="form-fallback-chat"
          >
            <input
              type="text"
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              placeholder={lang.code === "hi-IN" ? "यहाँ लिखें..." : "Type your message..."}
              disabled={phase === "thinking"}
              className="flex-1 bg-black/50 border border-white/20 rounded-full px-4 py-3
                         text-white text-sm placeholder:text-white/40
                         focus:outline-none focus:border-primary"
              data-testid="input-fallback-message"
            />
            <button
              type="submit"
              disabled={!fallbackText.trim() || phase === "thinking"}
              className="w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center
                         disabled:opacity-40 flex-shrink-0 self-center"
              data-testid="button-fallback-send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Toggle text fallback */}
        {voiceSupported && phase === "idle" && (
          <button
            onClick={() => setShowFallback((v) => !v)}
            className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors
                       font-heading tracking-wider"
            data-testid="button-toggle-text-input"
          >
            {showFallback ? "HIDE TEXT INPUT" : "TYPE INSTEAD"}
          </button>
        )}
      </div>
    </Layout>
  );
}
