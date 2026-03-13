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
  recLang: string;
}

const HINGLISH_WORDS = new Set([
  "kya","hai","nahi","nahin","haan","acha","theek","bhai","yaar","main","mein",
  "tum","aap","woh","koi","kuch","bahut","bilkul","abhi","phir","toh","aur",
  "magar","lekin","matlab","samajh","bolo","batao","karo","kar","hoga","hua",
  "raha","rahi","chalte","chal","suno","dekho","laga","lagta","lagti","hoti",
  "hota","teri","meri","iska","uska","apna","apni","achha","thoda","zyada",
  "pata","neta","dost","paisa","kaam","ghar","sab","kaisa","kaisi","kaun",
]);

function detectLanguage(text: string): LangInfo {
  if (/[\u0900-\u097F]/.test(text)) return { code: "hi-IN", name: "Hindi", recLang: "hi-IN" };
  if (/[\u0600-\u06FF]/.test(text)) return { code: "ar-SA", name: "Arabic", recLang: "ar-SA" };
  if (/[\u4E00-\u9FFF]/.test(text)) return { code: "zh-CN", name: "Chinese", recLang: "zh-CN" };
  if (/[\u3040-\u30FF]/.test(text)) return { code: "ja-JP", name: "Japanese", recLang: "ja-JP" };
  if (/[\uAC00-\uD7AF]/.test(text)) return { code: "ko-KR", name: "Korean", recLang: "ko-KR" };
  if (/[\u0A00-\u0A7F]/.test(text)) return { code: "pa-IN", name: "Punjabi", recLang: "pa-IN" };
  if (/[\u0B80-\u0BFF]/.test(text)) return { code: "ta-IN", name: "Tamil", recLang: "ta-IN" };
  if (/[\u0C00-\u0C7F]/.test(text)) return { code: "te-IN", name: "Telugu", recLang: "te-IN" };
  if (/[\u0D00-\u0D7F]/.test(text)) return { code: "ml-IN", name: "Malayalam", recLang: "ml-IN" };
  if (/[\u0980-\u09FF]/.test(text)) return { code: "bn-IN", name: "Bengali", recLang: "bn-IN" };

  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  if (words.length > 0) {
    const hindiCount = words.filter((w) => HINGLISH_WORDS.has(w)).length;
    if (hindiCount >= 2 || hindiCount / words.length >= 0.3) {
      return { code: "hinglish", name: "Hinglish", recLang: "hi-IN" };
    }
  }

  return { code: "en-US", name: "English", recLang: "en-US" };
}

function detectResponseLang(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ar-SA";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh-CN";
  if (/[\u3040-\u30FF]/.test(text)) return "ja-JP";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko-KR";
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa-IN";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN";
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  return "en-US";
}

function getBestVoice(bcp47: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  const lang2 = bcp47.slice(0, 2).toLowerCase();

  if (bcp47 === "hi-IN") {
    return (
      voices.find((v) => v.lang === "hi-IN" && v.name.toLowerCase().includes("google")) ||
      voices.find((v) => v.lang === "hi-IN") ||
      voices.find((v) => v.lang.toLowerCase().startsWith("hi")) ||
      voices.find((v) => /hindi|hemant|kalpana/i.test(v.name)) ||
      voices[0] ||
      null
    );
  }

  return (
    voices.find((v) => v.name.toLowerCase().includes("google") && v.lang === bcp47) ||
    voices.find((v) => v.name.toLowerCase().includes("google") && v.lang.toLowerCase().startsWith(lang2)) ||
    voices.find((v) => v.lang === bcp47) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lang2)) ||
    (lang2 === "en" ? voices.find((v) => /samantha|karen|moira|fiona|zira|hazel/i.test(v.name)) : null) ||
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
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [detectedLangName, setDetectedLangName] = useState("English");
  const [langLocked, setLangLocked] = useState(false);

  const convIdRef = useRef<number | null>(id ? parseInt(id) : null);
  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const detectedLangRef = useRef<LangInfo>({ code: "en-US", name: "English", recLang: "en-US" });
  // Explicitly requested language (set by voice commands like "speak in Hindi")
  // null = auto-detect from speech
  const preferredLangRef = useRef<string | null>(null);

  // TTS queue for progressive streaming speech
  const ttsQueueRef = useRef<string[]>([]);
  const ttsBusyRef = useRef(false);
  const streamDoneRef = useRef(false);
  const ttsLangRef = useRef("en-US");

  // Chrome keepalive & watchdog timers
  const synthKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Silence detection timer for continuous mode
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulated final transcript across continuous results
  const finalAccumRef = useRef("");

  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  function go(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function clearSynthTimers() {
    if (synthKeepAliveRef.current) { clearInterval(synthKeepAliveRef.current); synthKeepAliveRef.current = null; }
    if (synthWatchdogRef.current) { clearTimeout(synthWatchdogRef.current); synthWatchdogRef.current = null; }
  }

  function clearTts() {
    speechSynthesis.cancel();
    clearSynthTimers();
    ttsQueueRef.current = [];
    ttsBusyRef.current = false;
    streamDoneRef.current = false;
  }

  function onSpeechDone() {
    clearSynthTimers();
    if (activeRef.current) {
      setTimeout(() => listen(), 150); // reduced from 450ms
    } else {
      go("idle");
    }
  }

  // Speak one sentence and call drainQueue when done
  function speakOneSentence(text: string) {
    const lang = ttsLangRef.current;
    const isHindi = lang === "hi-IN";
    const selectedVoice = getBestVoice(lang);

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = isHindi ? 0.9 : 0.95;
    utter.pitch = isHindi ? 1.0 : 1.05;
    utter.volume = 1;
    if (selectedVoice) utter.voice = selectedVoice;

    let fired = false;
    const estimatedMs = (text.length / 130) * 1000 + 2000;

    if (synthWatchdogRef.current) clearTimeout(synthWatchdogRef.current);
    synthWatchdogRef.current = setTimeout(() => {
      if (!fired) { fired = true; drainQueue(); }
    }, estimatedMs);

    utter.onend = () => {
      if (!fired) {
        fired = true;
        clearSynthTimers();
        setTimeout(() => drainQueue(), 60);
      }
    };

    utter.onerror = (e) => {
      if (!fired && e.error !== "interrupted") {
        fired = true;
        clearSynthTimers();
        drainQueue();
      }
    };

    speechSynthesis.speak(utter);
  }

  // Pull next sentence from queue or signal completion
  function drainQueue() {
    if (ttsQueueRef.current.length === 0) {
      ttsBusyRef.current = false;
      if (streamDoneRef.current) {
        onSpeechDone();
      }
      return;
    }
    const sentence = ttsQueueRef.current.shift()!;
    ttsBusyRef.current = true;
    speakOneSentence(sentence);
  }

  // Add sentence to queue; start draining immediately if idle
  function enqueueSentence(sentence: string) {
    const s = sentence.trim();
    if (!s) return;
    ttsQueueRef.current.push(s);
    if (!ttsBusyRef.current) {
      drainQueue();
    }
  }

  // Start keepalive for Chrome's TTS auto-pause bug
  function startKeepAlive() {
    if (synthKeepAliveRef.current) clearInterval(synthKeepAliveRef.current);
    synthKeepAliveRef.current = setInterval(() => {
      if (speechSynthesis.paused) speechSynthesis.resume();
    }, 5000);
  }

  // Returns the new LangInfo if a switch command was detected, null otherwise
  function checkLangCommand(text: string): LangInfo | null {
    const t = text.toLowerCase();

    const hindi = /\b(hindi|हिंदी)\b|hindi (mein|me|mai)|speak.*hindi|switch.*hindi|use.*hindi/i;
    const english = /\b(english|अंग्रेज़ी)\b|english (mein|me|mai)|speak.*english|switch.*english|use.*english/i;
    const hinglish = /hinglish|mix.*language|dono.*bhasha/i;
    const arabic = /\b(arabic|عربي)\b|speak.*arabic/i;

    let switched: LangInfo | null = null;

    if (hindi.test(t)) {
      switched = { code: "hi-IN", name: "Hindi", recLang: "hi-IN" };
      preferredLangRef.current = "hi-IN";
    } else if (english.test(t)) {
      switched = { code: "en-US", name: "English", recLang: "en-US" };
      preferredLangRef.current = "en-US";
    } else if (hinglish.test(t)) {
      switched = { code: "hinglish", name: "Hinglish", recLang: "hi-IN" };
      preferredLangRef.current = "hi-IN";
    } else if (arabic.test(t)) {
      switched = { code: "ar-SA", name: "Arabic", recLang: "ar-SA" };
      preferredLangRef.current = "ar-SA";
    }

    if (switched) {
      detectedLangRef.current = switched;
      setDetectedLangName(switched.name);
      setLangLocked(true);
    }
    return switched;
  }

  async function askAI(text: string) {
    const convId = convIdRef.current;
    if (!convId) { go("idle"); return; }

    // Check for explicit language switch commands first
    const commandLang = checkLangCommand(text);

    // Auto-detect only if no explicit preference is set and no command was given
    let lang: LangInfo;
    if (commandLang) {
      lang = commandLang;
    } else if (preferredLangRef.current) {
      // Respect explicit preference but re-detect to catch script-based languages
      const detected = detectLanguage(text);
      // Only override preference if user actually switched scripts (e.g., typed Devanagari)
      if (detected.code !== "en-US" && detected.code !== "hinglish") {
        lang = detected;
        preferredLangRef.current = null; // script detected — reset override
        setLangLocked(false);
      } else {
        // Keep preferred lang but use detected for name display
        lang = { ...detectedLangRef.current };
      }
    } else {
      lang = detectLanguage(text);
      // If back to English, clear any Hindi preference so next session isn't locked
      if (lang.code === "en-US") { preferredLangRef.current = null; setLangLocked(false); }
    }

    detectedLangRef.current = lang;
    setDetectedLangName(lang.name);

    go("thinking");
    clearTts();

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, lang: lang.code }),
        credentials: "include",
      });

      if (!res.ok || !res.body) throw new Error("Bad response");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let fullText = "";
      let pending = "";
      let buf = "";
      let speakingStarted = false;

      const initSpeaking = (textSoFar: string) => {
        if (speakingStarted) return;
        speakingStarted = true;
        // Pick TTS lang from response content
        const rLang = detectResponseLang(textSoFar);
        ttsLangRef.current =
          rLang !== "en-US" ? rLang :
          lang.code === "hinglish" ? "hi-IN" : "en-US";
        startKeepAlive();
        go("speaking");
      };

      // Sentence boundary pattern (also handles Hindi danda ।)
      const sentenceRe = /[^.!?।\n]+[.!?।]+\s*/g;

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
            if (d.done) continue;
            if (!d.content) continue;

            fullText += d.content;
            pending += d.content;
            setAiText(fullText);

            // Extract and speak complete sentences immediately
            let lastIdx = 0;
            sentenceRe.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = sentenceRe.exec(pending)) !== null) {
              const sentence = match[0].trim();
              if (sentence) {
                initSpeaking(fullText);
                enqueueSentence(sentence);
              }
              lastIdx = sentenceRe.lastIndex;
            }
            pending = pending.slice(lastIdx);
          } catch {}
        }
      }

      // Speak any remaining text after stream ends
      if (pending.trim()) {
        initSpeaking(fullText);
        enqueueSentence(pending);
      }

      streamDoneRef.current = true;

      // If nothing was spoken yet (e.g., very short reply)
      if (!speakingStarted) {
        if (fullText.trim()) {
          initSpeaking(fullText);
          enqueueSentence(fullText);
        } else {
          go("idle");
          return;
        }
      }

      // If queue already drained before stream marked done, finish now
      if (!ttsBusyRef.current && ttsQueueRef.current.length === 0) {
        onSpeechDone();
      }

    } catch (err) {
      console.error("AI error:", err);
      clearTts();
      const fallback = "Sorry, something went wrong. Please try again.";
      setAiText(fallback);
      ttsLangRef.current = "en-US";
      streamDoneRef.current = true;
      go("speaking");
      startKeepAlive();
      enqueueSentence(fallback);
    }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    rec.lang = preferredLangRef.current || detectedLangRef.current.recLang || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    // Reset accumulator for this session
    finalAccumRef.current = "";

    // After this much silence, stop and submit
    const SILENCE_MS = 1400;

    const stopAndSubmit = () => {
      clearSilenceTimer();
      try { rec.stop(); } catch {}
      // onend will handle submission
    };

    rec.onstart = () => {
      go("listening");
      setInterimText("");
      finalAccumRef.current = "";
    };

    rec.onresult = (e: any) => {
      // Reset silence countdown on every new result
      clearSilenceTimer();

      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalAccumRef.current += e.results[i][0].transcript + " ";
        } else {
          interim += e.results[i][0].transcript;
        }
      }

      // Show real-time: interim text or the accumulated final so far
      setInterimText(interim);
      const accumulated = finalAccumRef.current.trim();
      if (accumulated) setUserText(accumulated);

      // Restart silence timer — submit after user pauses
      silenceTimerRef.current = setTimeout(stopAndSubmit, SILENCE_MS);
    };

    rec.onend = () => {
      clearSilenceTimer();
      setInterimText("");
      const text = finalAccumRef.current.trim();
      finalAccumRef.current = "";
      if (text) {
        askAI(text);
      } else if (activeRef.current) {
        // No speech detected — restart immediately to keep listening
        setTimeout(() => listen(), 120);
      } else {
        go("idle");
      }
    };

    rec.onerror = (e: any) => {
      clearSilenceTimer();
      if (e.error === "no-speech") {
        // Browser timed out waiting for speech — restart immediately
        if (activeRef.current && phaseRef.current === "listening") {
          setTimeout(() => listen(), 100);
        }
      } else if (e.error === "aborted") {
        // We called abort/stop — onend handles the rest
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSupported(false);
        go("idle");
      } else {
        console.error("Recognition error:", e.error);
        if (activeRef.current && phaseRef.current === "listening") {
          setTimeout(() => listen(), 300);
        } else {
          go("idle");
        }
      }
    };

    try {
      rec.start();
    } catch (err) {
      console.error("Recognition start failed:", err);
      // Race condition — give it a moment then retry
      if (activeRef.current) setTimeout(() => listen(), 250);
      else go("idle");
    }
  }

  function stopAll() {
    activeRef.current = false;
    setActive(false);
    clearSilenceTimer();
    finalAccumRef.current = "";
    clearTts();
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    go("idle");
    setInterimText("");
  }

  function handleButtonClick() {
    if (!ready || !supported) return;
    if (phaseRef.current === "thinking") return;

    if (phaseRef.current === "speaking") {
      clearTts();
      if (!activeRef.current) { activeRef.current = true; setActive(true); }
      setTimeout(() => listen(), 80);
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
      clearSilenceTimer();
      finalAccumRef.current = "";
      clearTts();
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
    };
  }, []);

  const color =
    phase === "listening" ? "#ef4444"
    : phase === "thinking" ? "#fbbf24"
    : phase === "speaking" ? "#a78bfa"
    : "#00e5ff";

  const activeLangName = detectedLangName;

  const label =
    !ready ? "⌛ INITIALIZING"
    : !supported ? "⚠ NOT SUPPORTED — USE CHROME"
    : phase === "listening" ? `🎙️ LISTENING · ${activeLangName}`
    : phase === "thinking"  ? "⚙️  THINKING"
    : phase === "speaking"  ? `🔊 SPEAKING · ${activeLangName}`
    : "✓  READY — TAP TO TALK";

  const barsOn = phase === "listening" || phase === "speaking";

  const panelText =
    phase === "listening"
      ? (userText
          ? `${userText}${interimText ? ` ${interimText}` : ''}`
          : interimText || "Listening… speak now")
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
          <div className="flex flex-col items-center gap-1.5 mb-5">
            <motion.p
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.3, repeat: Infinity }}
              className="text-[11px] font-heading font-bold tracking-[0.3em] text-center"
              style={{ color }}
            >
              {label}
            </motion.p>
            {langLocked && (
              <span className="text-[9px] font-heading px-2 py-0.5 rounded-full border border-white/15 text-white/40">
                LOCKED · say "speak in English" to auto-detect
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
                    : phase === "listening" && !userText && interimText
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
