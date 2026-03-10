import { Link, useLocation } from "wouter";
import { ArrowLeft, User, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Layout({ children, title, showBack = false, noPadding = false }: { children: React.ReactNode, title?: string, showBack?: boolean, noPadding?: boolean }) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center overflow-x-hidden">
      <div className="w-full max-w-md min-h-screen flex flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-black/20">
        
        {/* Top Navigation */}
        <header className="absolute top-0 w-full z-50 px-6 py-6 flex items-center justify-between pointer-events-none">
          {showBack ? (
            <button 
              onClick={() => window.history.back()}
              className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white/70 hover:text-primary transition-colors pointer-events-auto"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-10 h-10" /> // Spacer
          )}

          {title && (
            <motion.h1 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-lg font-heading font-bold text-white/90 tracking-widest uppercase neon-text-primary"
            >
              {title}
            </motion.h1>
          )}

          <Link href="/profile" className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white/70 hover:text-primary transition-colors pointer-events-auto">
            <Settings className="w-5 h-5" />
          </Link>
        </header>

        {/* Main Content Area */}
        <main className={cn("flex-1 flex flex-col w-full z-10 relative", !noPadding && "pt-24 pb-8 px-6")}>
          {children}
        </main>
        
      </div>
    </div>
  );
}
