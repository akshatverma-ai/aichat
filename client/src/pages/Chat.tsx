import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type LocalMessage = {
  id: string | number;
  role: string;
  content: string;
  isStreaming?: boolean;
};

async function getOrCreateConversationId(): Promise<number> {
  // Try to fetch existing conversations
  const listRes = await fetch("/api/conversations", { credentials: "include" });
  if (listRes.ok) {
    const list = await listRes.json();
    if (list && list.length > 0) return list[0].id;
  }
  // Create a new one
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

export default function Chat() {
  const { id } = useParams();
  const [convId, setConvId] = useState<number | null>(id ? parseInt(id) : null);
  const [isReady, setIsReady] = useState(!!id);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-discover conversation if no ID provided
  useEffect(() => {
    if (convId) {
      // Load existing messages
      fetch(`/api/conversations/${convId}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.messages) {
            setMessages(data.messages.map((m: any) => ({ ...m })));
          }
          setIsReady(true);
        })
        .catch(() => setIsReady(true));
      return;
    }
    // No ID — find or create
    getOrCreateConversationId()
      .then(id => {
        setConvId(id);
        // Load existing messages for this conversation
        return fetch(`/api/conversations/${id}`, { credentials: "include" });
      })
      .then(r => r && r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages) {
          setMessages(data.messages.map((m: any) => ({ ...m })));
        }
        setIsReady(true);
      })
      .catch(() => setIsReady(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending || !convId) return;

    const userMsg: LocalMessage = { id: Date.now(), role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    const streamId = Date.now() + 1;
    setMessages(prev => [...prev, { id: streamId, role: "assistant", content: "", isStreaming: true }]);

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg.content }),
        credentials: "include",
      });

      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
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
              setMessages(prev => prev.map(m => 
                m.id === streamId ? { ...m, isStreaming: false } : m
              ));
            }
          } catch (err) {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.map(m => 
        m.id === streamId ? { ...m, content: "Neural connection interrupted. Please try again.", isStreaming: false } : m
      ));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Layout title="Aichat - Text Chat" showBack noPadding>
      <div className="flex-1 flex flex-col h-full pt-20 pb-4 px-4 relative">
        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6 pb-20">
          {!isReady && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          
          {isReady && messages.length === 0 && (
            <div className="flex justify-center py-10">
              <p className="text-white/30 text-sm font-heading tracking-wider">NEURAL LINK ESTABLISHED — BEGIN TRANSMISSION</p>
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
                    "max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed",
                    msg.role === "user" 
                      ? "bg-primary text-black rounded-br-sm shadow-[0_0_15px_rgba(0,229,255,0.3)] font-medium" 
                      : "bg-white/10 text-white rounded-bl-sm border border-white/10 backdrop-blur-md"
                  )}
                >
                  {msg.content}
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
              placeholder={isReady ? "Transmit message..." : "Initializing..."}
              className="w-full bg-black/60 border border-white/20 rounded-full py-4 pl-6 pr-14 text-white placeholder:text-white/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary backdrop-blur-xl shadow-lg"
              disabled={isSending || !isReady}
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending || !isReady}
              className="absolute right-2 w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center disabled:opacity-50 hover:shadow-[0_0_15px_rgba(0,229,255,0.5)] transition-all"
            >
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
