import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { Layout } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, AlertTriangle } from "lucide-react";

const EMOTIONS = ["Neutral", "Happy", "Stressed", "Contemplative", "Focused"];

export default function CameraView() {
  const [isScanning, setIsScanning] = useState(true);
  const [emotion, setEmotion] = useState("Scanning...");
  const [alert, setAlert] = useState<string | null>(null);

  // Mock emotion detection logic
  useEffect(() => {
    const scanInterval = setInterval(() => {
      const rand = Math.floor(Math.random() * EMOTIONS.length);
      const newEmotion = EMOTIONS[rand];
      setEmotion(newEmotion);
      
      if (newEmotion === "Stressed") {
        setAlert("Elevated stress levels detected. Shall we initiate calming protocols?");
        setTimeout(() => setAlert(null), 5000);
      }
    }, 3000);

    return () => clearInterval(scanInterval);
  }, []);

  return (
    <Layout title="VISUAL ASSIST" showBack noPadding>
      <div className="flex-1 flex flex-col relative bg-black">
        
        {/* Camera Feed */}
        <div className="absolute inset-0 overflow-hidden">
          <Webcam
            audio={false}
            videoConstraints={{ facingMode: "user" }}
            className="w-full h-full object-cover opacity-60"
          />
          {/* Cyberpunk Scanner Overlay */}
          <div className="absolute inset-0 border-2 border-primary/30 m-6 rounded-3xl pointer-events-none flex flex-col justify-between p-4">
            <div className="flex justify-between w-full">
              <div className="w-8 h-8 border-t-4 border-l-4 border-primary" />
              <div className="w-8 h-8 border-t-4 border-r-4 border-primary" />
            </div>
            
            {isScanning && (
              <motion.div 
                animate={{ y: ["0%", "400%", "0%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="w-full h-1 bg-primary/50 shadow-[0_0_15px_rgba(0,229,255,0.8)]"
              />
            )}

            <div className="flex justify-between w-full">
              <div className="w-8 h-8 border-b-4 border-l-4 border-primary" />
              <div className="w-8 h-8 border-b-4 border-r-4 border-primary" />
            </div>
          </div>
        </div>

        {/* HUD Elements */}
        <div className="relative z-10 flex-1 flex flex-col p-6 pointer-events-none pt-24">
          <div className="glass-panel self-start px-4 py-2 rounded-lg flex items-center gap-2 mb-auto">
            <ScanFace className="w-4 h-4 text-primary" />
            <span className="text-xs font-heading font-bold text-primary tracking-widest uppercase">
              BIOMETRIC: {emotion}
            </span>
          </div>

          <AnimatePresence>
            {alert && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-black/80 border border-destructive/50 shadow-[0_0_20px_rgba(255,0,0,0.3)] rounded-2xl p-4 flex items-start gap-3 mt-auto mb-8 pointer-events-auto"
              >
                <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0" />
                <div>
                  <h4 className="text-destructive font-bold text-sm">SYSTEM ALERT</h4>
                  <p className="text-white/80 text-xs mt-1 leading-relaxed">{alert}</p>
                  <button className="mt-3 text-xs bg-destructive text-white px-4 py-1.5 rounded hover:bg-red-600 transition-colors">
                    Acknowledge
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Layout>
  );
}
