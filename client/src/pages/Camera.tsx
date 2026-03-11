import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { Layout } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, Volume2 } from "lucide-react";

export default function CameraView() {
  const [detectedObject, setDetectedObject] = useState<string>("Analyzing...");
  const [explanation, setExplanation] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio element on mount
  useEffect(() => {
    if (!audioRef.current) {
      const audioElement = new Audio();
      audioElement.crossOrigin = "anonymous";
      audioElement.onended = () => setIsPlaying(false);
      audioRef.current = audioElement;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Capture and analyze frames in real-time
  const captureAndAnalyze = useCallback(async () => {
    if (!webcamRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      const imageSrc = webcamRef.current.getScreenshot();
      
      if (!imageSrc) return;

      const base64 = imageSrc.split(",")[1];

      const response = await fetch("/api/vision/detect-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });

      if (!response.body) return;
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            
            if (data.type === "objectName") {
              setDetectedObject(data.data);
            } else if (data.type === "explanation") {
              setExplanation(data.data);
            } else if (data.type === "audio") {
              setAudioUrl(`data:audio/mp3;base64,${data.data}`);
            }
          } catch (err) {
            console.error("Parse error:", err);
          }
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
      try {
        captureAndAnalyze();
      } catch (error) {
        console.error("Capture interval error:", error);
      }
    }, 4000);

    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
  }, [captureAndAnalyze]);

  const playAudio = async () => {
    if (!audioRef.current || !audioUrl) {
      console.warn("Audio element or URL not available");
      return;
    }

    try {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      
      setIsPlaying(true);
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        await playPromise.catch((err) => {
          console.error("Playback failed:", err);
          setIsPlaying(false);
        });
      }
    } catch (error) {
      console.error("Audio setup error:", error);
      setIsPlaying(false);
    }
  };

  return (
    <Layout title="Aichat - Visual Assist" showBack noPadding>
      <div className="flex-1 flex flex-col relative bg-black">

        <div className="absolute inset-0 overflow-hidden">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={{ facingMode: "environment" }}
            className="w-full h-full object-cover opacity-60"
          />
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

        <div className="relative z-10 flex-1 flex flex-col p-6 pointer-events-none pt-24">
          <div className="glass-panel self-start px-4 py-2 rounded-lg flex items-center gap-2 mb-auto">
            <ScanFace className="w-4 h-4 text-primary" />
            <span className="text-xs font-heading font-bold text-primary tracking-widest uppercase">
              OBJECT: {detectedObject}
            </span>
          </div>

          <AnimatePresence>
            {explanation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-black/85 border border-primary/50 shadow-[0_0_20px_rgba(0,229,255,0.3)] rounded-2xl p-4 flex items-start gap-3 mt-auto mb-8 pointer-events-auto backdrop-blur-md max-w-md"
              >
                <div className="flex-1">
                  <h4 className="text-primary font-bold text-sm">{detectedObject}</h4>
                  <p className="text-white/80 text-xs mt-2 leading-relaxed">{explanation}</p>
                  {audioUrl && (
                    <button
                      onClick={playAudio}
                      className="mt-3 text-xs bg-primary text-black px-4 py-1.5 rounded hover:bg-cyan-400 transition-colors flex items-center gap-2 font-bold pointer-events-auto"
                    >
                      <Volume2 className="w-3 h-3" />
                      {isPlaying ? "PLAYING..." : "PLAY AUDIO"}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="fixed bottom-6 left-6 glass-panel px-3 py-2 rounded-lg">
            <span className="text-xs font-heading font-bold text-primary/70 uppercase">
              {isProcessing ? "⚙ PROCESSING..." : "✓ READY"}
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
