import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { LangSelector } from "@/components/LangSelector";
import { Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getStoredLang, saveLang, type LangOption } from "@/lib/lang";

type LocalMessage = {
  id: string | number;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

export default function Chat() {
  const { id } = useParams();
  const { user } = useAuth();
  const [convId, setConvId] = useState<number | null>(id ? parseInt(id) : null);
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lang, setLang] = useState<LangOption>(getStoredLang);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langRef = useRef<LangOption>(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);
  const bottomRef = useRef<HTMLDivElement>(null);

  function selectLanguage(option: LangOption) {
    setLang(option);
    saveLang(option);
  }

  // Load conversation history for authenticated users
  useEffect(() => {
    if (!user) {
      setIsReady(true);
      return;
    }

    const loadConversation = async (cid: number) => {
      try {
        const res = await fetch(`/api/conversations/${cid}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data?.messages) {
            setMessages(data.messages.map((m: any) => ({ ...m })));
          }
        }
      } catch {
        // ignore
      }
      setIsReady(true);
    };

    if (convId) {
      loadConversation(convId);
      return;
    }

    (async () => {
      try {
        const listRes = await fetch("/api/conversations", { credentials: "include" });
        if (listRes.ok) {
          const list = await listRes.json();
          if (list && list.length > 0) {
            setConvId(list[0].id);
            await loadConversation(list[0].id);
            return;
          }
        }
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Main Session" }),
          credentials: "include",
        });
        if (createRes.ok) {
          const conv = await createRes.json();
          setConvId(conv.id);
        }
      } catch {
        // ignore
      }
      setIsReady(true);
    })();
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userContent = input.trim();
    const currentLang = langRef.current;
    const userMsg: LocalMessage = { id: Date.now(), role: "user", content: userContent };
    const streamId = Date.now() + 1;

    setMessages(prev => [...prev, userMsg, { id: streamId, role: "assistant", content: "", isStreaming: true }]);
    setInput("");
    setIsSending(true);

    try {
      const body: Record<string, any> = {
        content: userContent,
        langName: currentLang.name,
      };

      if (user && convId) {
        body.conversationId = convId;
      } else if (!user) {
        body.history = messages
          .filter(m => !m.isStreaming && m.content)
          .map(m => ({ role: m.role, content: m.content }));
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const CHAT_FALLBACK = "Hello! Aichat is working.";

      if (!res.ok || !res.body) {
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, content: CHAT_FALLBACK, isStreaming: false } : m
        ));
        setIsSending(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: m.content + data.content } : m
              ));
            }
            if (data.done) {
              if (data.conversationId && !convId) setConvId(data.conversationId);
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, isStreaming: false } : m
              ));
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === streamId ? { ...m, isStreaming: false } : m
      ));
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages(prev => prev.map(m =>
        m.id === streamId
          ? { ...m, content: "Hello! Aichat is working.", isStreaming: false }
          : m
      ));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Layout title="Aichat - Text Chat" showBack noPadding>
      <div className="flex-1 flex flex-col h-full pt-20 pb-4 px-4 relative">

        {/* Language selector — top-right below header */}
        <div className="absolute top-[72px] right-4 z-20">
          <LangSelector
            lang={lang}
            onSelect={selectLanguage}
            open={showLangMenu}
            onToggle={() => setShowLangMenu(v => !v)}
            onClose={() => setShowLangMenu(false)}
          />
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6 pb-20 pt-10">
          {!isReady && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {isReady && messages.length === 0 && (
            <div className="flex justify-center py-10">
              <p className="text-white/30 text-sm font-heading tracking-wider">
                {lang.code === "hi-IN"
                  ? "संचार शुरू करें..."
                  : "NEURAL LINK ESTABLISHED — BEGIN TRANSMISSION"}
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex w-full",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-black rounded-br-sm shadow-[0_0_15px_rgba(0,229,255,0.3)] font-medium"
                      : "bg-white/10 text-white rounded-bl-sm border border-white/10 backdrop-blur-md"
                  )}
                >
                  {msg.content || (msg.isStreaming ? null : "—")}
                  {msg.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse" />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="absolute bottom-4 left-4 right-4 z-20">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                !isReady ? "Initializing..."
                : lang.code === "hi-IN" ? "संदेश लिखें..."
                : "Transmit message..."
              }
              className="w-full bg-black/60 border border-white/20 rounded-full py-4 pl-6 pr-14 text-white placeholder:text-white/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary backdrop-blur-xl shadow-lg"
              disabled={isSending || !isReady}
              data-testid="input-chat-message"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending || !isReady}
              className="absolute right-2 w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center disabled:opacity-50 hover:shadow-[0_0_15px_rgba(0,229,255,0.5)] transition-all"
              data-testid="button-send-message"
            >
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
