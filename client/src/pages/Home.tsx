import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { Mic, MessageSquare, Camera } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useActiveConversation } from "@/hooks/use-conversations";
import { AVATARS } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { conversations, activeConversation, createConversation, isLoadingList } = useActiveConversation();
  const { toast } = useToast();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  
  const currentConvId = activeConversation?.id;
  const avatarUrl = user ? AVATARS[user.avatar as keyof typeof AVATARS] : AVATARS.avatar1;

  // Only create conversation if none exist
  useEffect(() => {
    if (!isLoadingList && (!conversations || conversations.length === 0)) {
      createConversation.mutate("Main Session");
    }
  }, [isLoadingList, conversations, createConversation]);

  // Navigate to a feature with a conversation ID
  const navigateTo = async (path: string) => {
    try {
      setNavigatingTo(path);
      
      // If no conversation exists yet, create one
      if (!currentConvId) {
        // Wait for conversation to be created
        const result = await createConversation.mutateAsync("Main Session");
        const convId = result.id;
        setLocation(`${path}/${convId}`);
      } else {
        // Navigate immediately with existing conversation
        setLocation(`${path}/${currentConvId}`);
      }
    } catch (error) {
      console.error("Navigation error:", error);
      toast({
        title: "Navigation Error",
        description: "Could not open feature. Please try again.",
        variant: "destructive",
      });
    } finally {
      setNavigatingTo(null);
    }
  };

  return (
    <Layout title="Aichat - Main Console" noPadding>
      <div className="flex-1 flex flex-col items-center justify-center relative p-6 mt-16">
        
        {/* Holographic Avatar Display */}
        <div className="relative w-64 h-64 md:w-80 md:h-80 mb-12">
          {/* Outer glowing rings */}
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-20%] rounded-full border border-primary/20 border-dashed"
          />
          <motion.div 
            animate={{ rotate: -360 }} 
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-10%] rounded-full border border-accent/30 border-dotted"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="w-full h-full rounded-full overflow-hidden relative shadow-[0_0_50px_rgba(0,229,255,0.3)] z-10 border-2 border-primary/50"
          >
            {/* futuristic portrait of a woman neon lighting cyberpunk */}
            <img 
              src={avatarUrl} 
              alt="Aichat" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent mix-blend-overlay" />
          </motion.div>

          {/* Status Indicator */}
          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse" />
            <span className="text-xs font-heading font-semibold text-white/90">ONLINE</span>
          </div>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-bold text-white mb-2">{user?.name ? `Hello, ${user.name}` : "SYSTEM READY"}</h2>
          <p className="text-primary/80 font-heading tracking-widest text-sm uppercase">
            Aichat // {user?.personality || "Standard"} Protocol
          </p>
        </div>

        {/* Action Grid */}
        <div className="w-full grid grid-cols-3 gap-4 px-2">
          <button
            onClick={() => navigateTo('/chat')}
            disabled={navigatingTo !== null || isLoadingList}
            className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl glass-panel hover:bg-primary/10 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-text-chat"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              {navigatingTo === '/chat' ? (
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              ) : (
                <MessageSquare className="w-6 h-6 text-primary" />
              )}
            </div>
            <span className="text-xs font-semibold text-white/70 group-hover:text-primary">TEXT</span>
          </button>

          <button
            onClick={() => navigateTo('/voice')}
            disabled={navigatingTo !== null || isLoadingList}
            className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl glass-panel border-primary/50 hover:bg-primary/20 shadow-[0_0_20px_rgba(0,229,255,0.1)] transition-all group translate-y-[-10px] disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-voice-chat"
          >
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(0,229,255,0.5)]">
              {navigatingTo === '/voice' ? (
                <div className="animate-spin h-8 w-8 border-2 border-black border-t-transparent rounded-full" />
              ) : (
                <Mic className="w-8 h-8 text-black" />
              )}
            </div>
            <span className="text-sm font-bold text-primary">VOICE</span>
          </button>

          <button
            onClick={() => setLocation('/camera')}
            disabled={navigatingTo !== null}
            className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl glass-panel hover:bg-accent/10 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-visual-assist"
          >
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              {navigatingTo === '/camera' ? (
                <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
              ) : (
                <Camera className="w-6 h-6 text-accent" />
              )}
            </div>
            <span className="text-xs font-semibold text-white/70 group-hover:text-accent">ASSIST</span>
          </button>
        </div>
      </div>
    </Layout>
  );
}
