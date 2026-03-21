import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, ChevronDown, Check } from "lucide-react";
import { LANGUAGES, type LangOption } from "@/lib/lang";

interface LangSelectorProps {
  lang: LangOption;
  onSelect: (lang: LangOption) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function LangSelector({ lang, onSelect, open, onToggle, onClose }: LangSelectorProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={menuRef} className="relative">
      <button
        data-testid="button-lang-switcher"
        onClick={onToggle}
        className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer
                   border border-primary/40 hover:border-primary/80 transition-colors"
      >
        <Globe className="w-3 h-3 text-primary" />
        <span className="text-xs font-heading font-bold text-primary uppercase tracking-wider">
          {lang.label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-primary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-40 rounded-xl overflow-hidden z-50
                       bg-black/90 border border-primary/50 backdrop-blur-md
                       shadow-[0_0_20px_rgba(0,229,255,0.25)]"
          >
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                data-testid={`button-lang-${option.code}`}
                onClick={() => { onSelect(option); onClose(); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left
                           text-xs font-heading font-bold tracking-wider uppercase
                           hover:bg-primary/20 transition-colors
                           text-primary/80 hover:text-primary"
              >
                <span>{option.label}</span>
                {lang.code === option.code && <Check className="w-3 h-3 text-primary" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
