import { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import { Layout } from "@/components/Layout";
import { LangSelector } from "@/components/LangSelector";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, Volume2, Camera } from "lucide-react";
import { getStoredLang, saveLang, type LangOption } from "@/lib/lang";

export default function CameraView() {
  const [detectedObject, setDetectedObject] = useState<string>("");
  const [explanation, setExplanation]       = useState<string>("");
  const [isProcessing, setIsProcessing]     = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string>("");
  const [audioUrl, setAudioUrl]             = useState<string>("");
  const [isPlaying, setIsPlaying]           = useState(false);
  const [lang, setLang]                     = useState<LangOption>(getStoredLang);
  const [showLangMenu, setShowLangMenu]     = useState(false);
  const [webcamReady, setWebcamReady]       = useState(false);

  const langRef        = useRef<LangOption>(lang);
  const isProcessingRef = useRef(false); // use ref to avoid stale closures in the interval
  useEffect(() => { langRef.current = lang; }, [lang]);

  const webcamRef          = useRef<Webcam>(null);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const onFocus = () => { setLang(getStoredLang()); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.onended = () => setIsPlaying(false);
    audioRef.current = el;
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    };
  }, []);

  async function captureAndAnalyze() {
    if (isProcessingRef.current) return;
    if (!webcamRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setErrorMsg("");

    try {
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

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Detection failed" }));
        throw new Error(err.error || `Server error ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

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
            if (data.error) throw new Error(data.error);
            if (data.type === "objectName") setDetectedObject(data.data);
            else if (data.type === "explanation") setExplanation(data.data);
            else if (data.type === "audio") setAudioUrl(`data:audio/mp3;base64,${data.data}`);
          } catch (parseErr: any) {
            if (parseErr.message && parseErr.message !== "Unexpected token") {
              throw parseErr;
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Vision detection error:", error);
      setErrorMsg(error.message || "Detection failed. Please try again.");
      setDetectedObject("");
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }

  // Auto-analyze every 8 seconds once webcam is ready
  useEffect(() => {
    if (!webcamReady) return;
    // Initial analysis
    captureAndAnalyze();
    // Then repeat
    captureIntervalRef.current = setInterval(() => {
      captureAndAnalyze();
    }, 8000);
    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
  }, [webcamReady]);

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
            screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            className="w-full h-full object-cover opacity-60"
            onUserMedia={() => setWebcamReady(true)}
            onUserMediaError={() => setErrorMsg("Camera access denied. Please allow camera access.")}
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
                {detectedObject ? `OBJECT: ${detectedObject}` : isProcessing ? "SCANNING..." : "POINT CAMERA AT OBJECT"}
              </span>
            </div>

            {/* Language switcher */}
            <LangSelector
              lang={lang}
              onSelect={(option) => {
                setLang(option);
                saveLang(option);
                setShowLangMenu(false);
                setDetectedObject("");
                setExplanation("");
                setAudioUrl("");
                setErrorMsg("");
                if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
                setIsPlaying(false);
              }}
              open={showLangMenu}
              onToggle={() => setShowLangMenu(v => !v)}
              onClose={() => setShowLangMenu(false)}
            />
          </div>

          {/* Error message */}
          <AnimatePresence>
            {errorMsg && !isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-900/80 border border-red-500/50 rounded-xl p-3 mt-auto mb-4 max-w-md"
              >
                <p className="text-red-300 text-xs">{errorMsg}</p>
              </motion.div>
            )}
          </AnimatePresence>

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

          {/* Bottom controls */}
          <div className="flex items-center justify-between">
            <div className="glass-panel px-3 py-2 rounded-lg pointer-events-none">
              <span className="text-xs font-heading font-bold text-primary/70 uppercase">
                {isProcessing ? "⚙ PROCESSING..." : webcamReady ? "✓ READY" : "⌛ LOADING..."}
              </span>
            </div>

            {/* Manual scan button */}
            <button
              data-testid="button-scan-now"
              onClick={() => captureAndAnalyze()}
              disabled={isProcessing || !webcamReady}
              className="glass-panel px-4 py-2 rounded-lg flex items-center gap-2
                         border border-primary/40 hover:border-primary/80 transition-colors
                         disabled:opacity-40 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-primary" />
              <span className="text-xs font-heading font-bold text-primary uppercase tracking-wider">
                {isProcessing ? "SCANNING..." : "SCAN NOW"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
