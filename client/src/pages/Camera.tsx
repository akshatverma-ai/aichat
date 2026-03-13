import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { Layout } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, Volume2, Globe, ChevronDown, Check } from "lucide-react";

interface LangOption { code: string; name: string; label: string; }

const LANGUAGES: LangOption[] = [
  { code: "en-US", name: "English",  label: "🌐 ENGLISH" },
  { code: "hi-IN", name: "Hindi",    label: "🌐 हिंदी"   },
];

function getStoredLang(): LangOption {
  try {
    const raw = localStorage.getItem("aichat_lang");
    if (raw) {
      const parsed = JSON.parse(raw) as { code: string; name: string };
      const match = LANGUAGES.find((l) => l.code === parsed.code || l.name === parsed.name);
      if (match) return match;
    }
  } catch {}
  return LANGUAGES[0];
}

function saveLang(lang: LangOption) {
  try { localStorage.setItem("aichat_lang", JSON.stringify({ code: lang.code, name: lang.name })); } catch {}
}

export default function CameraView() {
  const [detectedObject, setDetectedObject] = useState<string>("Analyzing...");
  const [explanation, setExplanation]       = useState<string>("");
  const [isProcessing, setIsProcessing]     = useState(false);
  const [audioUrl, setAudioUrl]             = useState<string>("");
  const [isPlaying, setIsPlaying]           = useState(false);
  const [lang, setLang]                     = useState<LangOption>(getStoredLang);
  const [showLangMenu, setShowLangMenu]     = useState(false);

  // Keep a ref so captureAndAnalyze always sees the latest lang without re-creating the callback
  const langRef = useRef<LangOption>(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const webcamRef         = useRef<Webcam>(null);
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const menuRef           = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Re-read language preference on window focus (user may have spoken in Voice tab)
  useEffect(() => {
    const onFocus = () => {
      const stored = getStoredLang();
      setLang(stored);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.crossOrigin = "anonymous";
      el.onended = () => setIsPlaying(false);
      audioRef.current = el;
    }
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    };
  }, []);

  // Capture and analyze frames in real-time
  const captureAndAnalyze = useCallback(async () => {
    if (!webcamRef.current || isProcessing) return;
    try {
      setIsProcessing(true);
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) { setIsProcessing(false); return; }

      const base64 = imageSrc.split(",")[1];
      const currentLang = langRef.current;

      const response = await fetch("/api/vision/detect-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          lang: currentLang.code,
          langName: currentLang.name,
        }),
      });

      if (!response.body) { setIsProcessing(false); return; }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "objectName") setDetectedObject(data.data);
            else if (data.type === "explanation") setExplanation(data.data);
            else if (data.type === "audio") setAudioUrl(`data:audio/mp3;base64,${data.data}`);
          } catch {}
        }
      }
      setIsProcessing(false);
    } catch (error) {
      console.error("Vision detection error:", error);
      setDetectedObject("Detection Error");
      setIsProcessing(false);
    }
  }, [isProcessing]);

  // Start real-time analysis loop
  useEffect(() => {
    if (!webcamRef.current) return;
    captureIntervalRef.current = setInterval(() => {
      captureAndAnalyze().catch(console.error);
    }, 4000);
    return () => { if (captureIntervalRef.current) clearInterval(captureIntervalRef.current); };
  }, [captureAndAnalyze]);

  function selectLanguage(option: LangOption) {
    setLang(option);
    saveLang(option);
    setShowLangMenu(false);
    // Clear previous results so next capture re-runs in the new language
    setDetectedObject("Analyzing...");
    setExplanation("");
    setAudioUrl("");
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setIsPlaying(false);
  }

  const playAudio = async () => {
    if (!audioRef.current || !audioUrl) return;
    try {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      setIsPlaying(true);
      await audioRef.current.play().catch((err) => {
        console.error("Playback failed:", err);
        setIsPlaying(false);
      });
    } catch (error) {
      console.error("Audio setup error:", error);
      setIsPlaying(false);
    }
  };

  const isHindi = lang.code.startsWith("hi");

  return (
    <Layout title="Aichat - Visual Assist" showBack noPadding>
      <div className="flex-1 flex flex-col relative bg-black">

        {/* Camera feed */}
        <div className="absolute inset-0 overflow-hidden">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={{ facingMode: "environment" }}
            className="w-full h-full object-cover opacity-60"
          />
          {/* Scanning frame */}
          <div className="absolute inset-0 border-2 border-primary/30 m-6 rounded-3xl pointer-events-none flex flex-col justify-between p-4">
            <div className="flex justify-between w-full">
              <div className="w-8 h-8 border-t-4 border-l-4 border-primary" />
              <div className="w-8 h-8 border-t-4 border-r-4 border-primary" />
            </div>
            {isProcessing && (
              <motion.div
                animate={{ y: ["0%", "400%", "0%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-full h-1 bg-primary/50 shadow-[0_0_15px_rgba(0,229,255,0.8)]"
              />
            )}
            <div className="flex justify-between w-full">
              <div className="w-8 h-8 border-b-4 border-l-4 border-primary" />
              <div className="w-8 h-8 border-b-4 border-r-4 border-primary" />
            </div>
          </div>
        </div>

        {/* Overlay UI */}
        <div className="relative z-10 flex-1 flex flex-col p-6 pt-24">

          {/* Top row: object badge + language switcher */}
          <div className="flex items-start justify-between mb-auto">
            <div className="glass-panel px-4 py-2 rounded-lg flex items-center gap-2 pointer-events-none">
              <ScanFace className="w-4 h-4 text-primary" />
              <span className="text-xs font-heading font-bold text-primary tracking-widest uppercase">
                OBJECT: {detectedObject}
              </span>
            </div>

            {/* Language switcher */}
            <div ref={menuRef} className="relative">
              <button
                data-testid="button-lang-switcher"
                onClick={() => setShowLangMenu((v) => !v)}
                className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer
                           border border-primary/40 hover:border-primary/80 transition-colors"
              >
                <Globe className="w-3 h-3 text-primary" />
                <span className="text-xs font-heading font-bold text-primary uppercase tracking-wider">
                  {lang.label}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-primary transition-transform duration-200 ${showLangMenu ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {showLangMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 mt-1 w-40 rounded-xl overflow-hidden z-50
                               bg-black/90 border border-primary/50 backdrop-blur-md
                               shadow-[0_0_20px_rgba(0,229,255,0.25)]"
                  >
                    {LANGUAGES.map((option) => (
                      <button
                        key={option.code}
                        data-testid={`button-lang-${option.code}`}
                        onClick={() => selectLanguage(option)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left
                                   text-xs font-heading font-bold tracking-wider uppercase
                                   hover:bg-primary/20 transition-colors
                                   text-primary/80 hover:text-primary"
                      >
                        <span>{option.label}</span>
                        {lang.code === option.code && (
                          <Check className="w-3 h-3 text-primary" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Description card */}
          <AnimatePresence>
            {explanation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-black/85 border border-primary/50 shadow-[0_0_20px_rgba(0,229,255,0.3)]
                           rounded-2xl p-4 flex items-start gap-3 mt-auto mb-8
                           backdrop-blur-md max-w-md"
              >
                <div className="flex-1">
                  <h4 className="text-primary font-bold text-sm">{detectedObject}</h4>
                  <p className="text-white/80 text-xs mt-2 leading-relaxed">{explanation}</p>
                  {audioUrl && (
                    <button
                      data-testid="button-play-audio"
                      onClick={playAudio}
                      className="mt-3 text-xs bg-primary text-black px-4 py-1.5 rounded
                                 hover:bg-cyan-400 transition-colors flex items-center gap-2
                                 font-bold"
                    >
                      <Volume2 className="w-3 h-3" />
                      {isPlaying
                        ? (isHindi ? "चल रहा है..." : "PLAYING...")
                        : (isHindi ? "सुनें" : "PLAY AUDIO")}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status badge */}
          <div className="fixed bottom-6 left-6 glass-panel px-3 py-2 rounded-lg pointer-events-none">
            <span className="text-xs font-heading font-bold text-primary/70 uppercase">
              {isProcessing ? "⚙ PROCESSING..." : "✓ READY"}
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
