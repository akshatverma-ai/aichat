import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { GlowingButton } from "@/components/GlowingButton";
import { Mail, Lock, User as UserIcon } from "lucide-react";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  
  const { login, register } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    try {
      if (isLogin) {
        const user = await login.mutateAsync({ email, password });
        if (user?.id) {
          setLocation("/chat");
        }
      } else {
        const user = await register.mutateAsync({ email, password, name });
        if (user?.id) {
          // Redirect immediately - data is already set in cache
          setLocation("/setup");
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-background">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-panel-heavy rounded-3xl p-8 z-10"
      >
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold text-white neon-text-primary mb-2">Aichat</h1>
          <p className="text-muted-foreground font-heading tracking-widest text-sm uppercase">
            {isLogin ? "Neural Link Establishment" : "Initialize New Neural Pathway"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <AnimatePresence mode="popLayout">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="relative"
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-primary/50">
                  <UserIcon className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  placeholder="Designation (Name)"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all neon-box-primary"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-primary/50">
              <Mail className="w-5 h-5" />
            </div>
            <input
              type="email"
              placeholder="Comm-Link (Email)"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all neon-box-primary"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-primary/50">
              <Lock className="w-5 h-5" />
            </div>
            <input
              type="password"
              placeholder="Security Key (Password)"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all neon-box-primary"
            />
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-destructive text-sm text-center font-medium"
            >
              {error}
            </motion.p>
          )}

          <GlowingButton 
            type="submit" 
            className="w-full mt-4" 
            size="lg"
            isLoading={login.isPending || register.isPending}
          >
            {isLogin ? "INITIALIZE" : "REGISTER"}
          </GlowingButton>
        </form>

        <div className="mt-8 text-center space-y-3">
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="text-sm text-muted-foreground hover:text-white transition-colors block w-full"
          >
            {isLogin ? "No neural link found? Create one." : "Existing link detected? Initialize."}
          </button>
          <button
            type="button"
            onClick={() => setLocation("/chat")}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Continue without logging in
          </button>
        </div>
      </motion.div>
    </div>
  );
}
