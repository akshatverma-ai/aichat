import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { motion } from "framer-motion";
import { Mic, Square, Volume2 } from "lucide-react";
import { useVoiceRecorder, useVoiceStream } from "../../replit_integrations/audio";
import { useAuth } from "@/hooks/use-auth";
import { AVATARS } from "@/lib/utils";

async function getOrCreateConversationId(): Promise<number> {
  const listRes = await fetch("/api/conversations", { credentials: "include" });
  if (listRes.ok) {
    const list = await listRes.json();
    if (list && list.length > 0) return list[0].id;
  }
  const createRes = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Main Session" }),
    credentials: "include",
  });
  if (!createRes.ok) throw new Error("Failed to create conversation");
  const conv = await createRes.json();
  return conv.id;
}

export default function Voice() {
  const { id } = useParams();
  const { user } = useAuth();

  const [convId, setConvId] = useState<number | null>(id ? parseInt(id) : null);
  const [isReady, setIsReady] = useState(!!id);
  const [transcript, setTranscript] = useState("Tap the mic to start...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [autoListen, setAutoListen] = useState(true);

  // Auto-discover conversation on mount
  useEffect(() => {
    if (convId) {
      setIsReady(true);
      return;
    }
    getOrCreateConversationId()
      .then(id => {
        setConvId(id);
        setIsReady(true);
        setTranscript("Listening for your voice...");
      })
      .catch(() => {
        setIsReady(true);
        setTranscript("Tap the mic to start...");
      });
  }, []);

  const recorder = useVoiceRecorder();
  const stream = useVoiceStream({
    onUserTranscript: (text) => setTranscript(`You: "${text}"`),
    onTranscript: (_, full) => {
      setIsThinking(true);
      setTranscript(`AI: ${full}`);
    },
    onComplete: () => {
      setIsProcessing(false);
      setIsThinking(false);
      if (autoListen) {
        setTimeout(() => handleMicClick(), 800);
      }
    },
    onError: () => {
      setTranscript("Connection interrupted. Tap to retry.");
      setIsProcessing(false);
      setIsThinking(false);
    }
  });

  const handleMicClick = async () => {
    if (!isReady || !convId) {
      setTranscript("Still initializing, please wait...");
      return;
    }
    if (recorder.state === "recording") {
      const blob = await recorder.stopRecording();
      setIsProcessing(true);
      setIsThinking(true);
      setTranscript("AI is thinking...");
      try {
        await stream.streamVoiceResponse(`/api/conversations/${convId}/messages`, blob);
      } catch (err) {
        setTranscript("Connection failed. Tap to retry.");
        setIsProcessing(false);
        setIsThinking(false);
      }
    } else {
      setTranscript("Listening...");
      setIsThinking(false);
      await recorder.startRecording();
    }
  };

  const isRecording = recorder.state === "recording";
  const isPlaying = stream.playbackState === "playing";
  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  return (
    <Layout title="Aichat - Voice Chat" showBack>
      <div className="flex-1 flex flex-col items-center justify-between py-10 relative">
        
        <div className="text-center w-full px-6">
          <motion.div 
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="text-xs font-heading font-bold tracking-[0.3em] mb-8"
            style={{ color: isRecording ? "#ef4444" : isThinking ? "#fbbf24" : isPlaying ? "#a78bfa" : "#00e5ff" }}
          >
            {!isReady ? "⌛ INITIALIZING" : isRecording ? "🎙️ LISTENING" : isThinking ? "⚙️ THINKING" : isPlaying ? "🔊 SPEAKING" : "✓ READY"}
          </motion.div>
          
          {/* Audio Visualizer */}
          <div className="h-24 flex items-center justify-center gap-1 mb-12">
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={i}
                animate={
                  isRecording || isPlaying
                    ? { height: ["20%", "100%", "30%", "80%", "20%"] }
                    : { height: "10%" }
                }
                transition={{
                  duration: 1 + Math.random(),
                  repeat: Infinity,
                  repeatType: "mirror",
                  delay: i * 0.1,
                }}
                className={`w-2 rounded-full ${isPlaying ? 'bg-accent' : 'bg-primary'}`}
                style={{
                  boxShadow: isPlaying ? '0 0 10px rgba(138,124,255,0.5)' : '0 0 10px rgba(0,229,255,0.5)'
                }}
              />
            ))}
          </div>
          
          <div className="glass-panel p-6 rounded-2xl min-h-[120px] flex items-center justify-center">
            <p className="text-white/80 text-sm leading-relaxed italic">
              {transcript}
            </p>
          </div>
        </div>

        <div className="relative mt-12">
          {/* Avatar Behind Button */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 scale-150 blur-sm">
            <img src={avatarUrl} alt="Avatar BG" className="w-full h-full object-cover rounded-full mix-blend-screen" />
          </div>

          <button
            onClick={handleMicClick}
            disabled={isProcessing || !isReady}
            data-testid="button-mic"
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-50 ${
              isRecording 
                ? "bg-destructive text-white shadow-[0_0_40px_rgba(255,0,0,0.6)]" 
                : "bg-primary text-black shadow-[0_0_30px_rgba(0,229,255,0.5)] hover:scale-105"
            }`}
          >
            {isRecording ? <Square className="w-8 h-8 fill-current" /> : isPlaying ? <Volume2 className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
          </button>
        </div>

      </div>
    </Layout>
  );
}
