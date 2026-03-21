import { Link, useLocation } from "wouter";
import { ArrowLeft, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  noPadding?: boolean;
}

export function Layout({ children, title, showBack = false, noPadding = false }: LayoutProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center overflow-x-hidden">
      <div className="w-full max-w-md min-h-[100dvh] flex flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-black/20">

        {/* Top Navigation */}
        <header className="absolute top-0 w-full z-50 px-4 py-4 sm:px-6 sm:py-6 flex items-center justify-between pointer-events-none">
          {showBack ? (
            <button
              onClick={() => setLocation("/")}
              className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white/70 hover:text-primary transition-colors pointer-events-auto touch-target"
              aria-label="Go back"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}

          {title && (
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm sm:text-base font-heading font-bold text-white/90 tracking-widest uppercase neon-text-primary truncate mx-2"
            >
              {title}
            </motion.h1>
          )}

          <Link
            href="/profile"
            className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-white/70 hover:text-primary transition-colors pointer-events-auto touch-target"
            aria-label="Profile settings"
            data-testid="link-profile"
          >
            <Settings className="w-5 h-5" />
          </Link>
        </header>

        {/* Main Content Area */}
        <main className={cn("flex-1 flex flex-col w-full z-10 relative", !noPadding && "pt-20 sm:pt-24 pb-6 sm:pb-8 px-4 sm:px-6")}>
          {children}
        </main>

      </div>
    </div>
  );
}
