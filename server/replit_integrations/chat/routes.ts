import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}
const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAI() as any)[prop];
  },
});

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, voiceMode, detectedLang, detectedLangName } = req.body;

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // For voice mode, prepend a multilingual system prompt for concise spoken responses
      if (voiceMode) {
        const langHint = detectedLangName && detectedLang && detectedLang !== "en-US"
          ? `The user is speaking in ${detectedLangName}. You MUST reply ONLY in ${detectedLangName} — do not switch to English. `
          : "";
        chatMessages.unshift({
          role: "system",
          content:
            `You are Aichat, a smart and friendly voice assistant. You listen carefully and always give clear, helpful answers. ` +
            `${langHint}` +
            `LANGUAGE RULE (most important): Always reply in the exact same language the user is speaking. ` +
            `If they speak Hindi → reply fully in Hindi. ` +
            `If they speak English → reply in English. ` +
            `If they speak Hinglish (mixed Hindi and English) → reply naturally in Hinglish. ` +
            `Never translate the user's message into a different language unprompted. ` +
            `\nSTYLE RULE: Keep responses short, warm, and conversational — 1 to 3 sentences at most. ` +
            `Answer the question directly and clearly. No bullet points, no markdown, no long explanations. ` +
            `Speak as if you are a knowledgeable friend talking face-to-face. ` +
            `If the user asks something complex, give the key point first, then briefly explain.`,
        });
      } else {
        chatMessages.unshift({
          role: "system",
          content:
            `You are Aichat, a smart and helpful AI assistant. ` +
            `Always reply in the same language the user writes in. ` +
            `Be clear, accurate, and helpful. Format your responses neatly when appropriate.`,
        });
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: voiceMode ? 220 : 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}

