import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { GlowingButton } from "@/components/GlowingButton";
import { AVATARS, PERSONALITIES, cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function Setup() {
  const { user, updateProfile } = useAuth();
  const [, setLocation] = useLocation();
  
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || "avatar1");
  const [selectedPersonality, setSelectedPersonality] = useState(user?.personality || "Friendly");

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        avatar: selectedAvatar,
        personality: selectedPersonality,
      });
      setLocation("/home");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Layout title="AI CONFIGURATION" showBack>
      <div className="flex-1 flex flex-col space-y-8">
        
        <section>
          <h2 className="text-xl font-heading font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-primary text-2xl">01 //</span> VISUAL INTERFACE
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(AVATARS).map(([id, url]) => (
              <button
                key={id}
                onClick={() => setSelectedAvatar(id)}
                className={cn(
                  "relative aspect-square rounded-2xl overflow-hidden transition-all duration-300",
                  selectedAvatar === id ? "ring-2 ring-primary shadow-[0_0_20px_rgba(0,229,255,0.5)] scale-105" : "opacity-50 hover:opacity-80"
                )}
              >
                {/* futuristic portrait of a woman neon lighting cyberpunk */}
                <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                {selectedAvatar === id && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="w-8 h-8 text-white drop-shadow-md" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="flex-1">
          <h2 className="text-xl font-heading font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-accent text-2xl">02 //</span> COGNITIVE MATRIX
          </h2>
          <div className="flex flex-wrap gap-3">
            {PERSONALITIES.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPersonality(p)}
                className={cn(
                  "px-5 py-3 rounded-xl text-sm font-medium transition-all duration-300 border backdrop-blur-sm",
                  selectedPersonality === p 
                    ? "bg-accent/20 border-accent text-white shadow-[0_0_15px_rgba(138,124,255,0.3)]" 
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-auto pt-8">
          <GlowingButton 
            className="w-full" 
            size="lg" 
            onClick={handleSave}
            isLoading={updateProfile.isPending}
          >
            CONFIRM PARAMETERS
          </GlowingButton>
        </div>
      </div>
    </Layout>
  );
}
