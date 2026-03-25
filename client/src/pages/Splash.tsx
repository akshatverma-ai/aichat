import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

export default function Splash() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Set a maximum of 3 seconds total wait
    const maxWaitTimer = setTimeout(() => {
      if (user) {
        setLocation("/home");
      } else {
        setLocation("/login");
      }
    }, 3000);

    // Also redirect once loading is done and we have a result
    if (!isLoading) {
      const timer = setTimeout(() => {
        if (user) {
          setLocation("/home");
        } else {
          setLocation("/login");
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        clearTimeout(maxWaitTimer);
      };
    }

    return () => clearTimeout(maxWaitTimer);
  }, [user, isLoading, setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[100px]" />

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        <motion.div
          animate={{ 
            boxShadow: ["0 0 20px rgba(0,229,255,0.2)", "0 0 60px rgba(0,229,255,0.6)", "0 0 20px rgba(0,229,255,0.2)"] 
          }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="w-32 h-32 rounded-full border-2 border-primary/50 flex items-center justify-center mb-8 glass-panel"
        >
          <div className="w-24 h-24 rounded-full border border-accent/50 flex items-center justify-center bg-black/50">
            <span className="font-display font-bold text-4xl text-primary neon-text-primary tracking-tighter">Aichat</span>
          </div>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="font-display text-2xl font-bold tracking-[0.2em] text-white"
        >
          AI COMPANION
        </motion.h1>
        
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          className="mt-12 flex gap-2"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
              className="w-2 h-2 rounded-full bg-primary"
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
