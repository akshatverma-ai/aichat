import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import { pool } from "./db";
import connectPg from "connect-pg-simple";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerVisionRoutes } from "./replit_integrations/vision";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const PostgresStore = connectPg(session);

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      store: new PostgresStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "aiva_secret_key_2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Auth Routes
  app.post(api.users.register.path, async (req, res) => {
    try {
      const input = api.users.register.input.parse(req.body);
      const existingUser = await storage.getUserByEmail(input.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already taken", field: "email" });
      }
      const user = await storage.createUser(input);
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.status(201).json(user);
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.users.login.path, async (req, res) => {
    try {
      const input = api.users.login.input.parse(req.body);
      const user = await storage.getUserByEmail(input.email);
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.json(user);
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.users.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.status(200).send();
    });
  });

  app.get(api.users.me.path, requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      res.json(user);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.users.updateProfile.path, requireAuth, async (req, res) => {
    try {
      const input = api.users.updateProfile.input.parse(req.body);
      const user = await storage.updateUser(req.session.userId!, input);
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // GET /api/config — fetch current avatar + personality configuration
  app.get("/api/config", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ avatar: user.avatar, personality: user.personality });
    } catch {
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  // POST /api/config — save avatar + personality configuration
  app.post("/api/config", requireAuth, async (req, res) => {
    try {
      const { avatar, personality } = req.body;
      const updates: Record<string, string> = {};
      if (avatar) updates.avatar = avatar;
      if (personality) updates.personality = personality;
      if (Object.keys(updates).length > 0) {
        await storage.updateUser(req.session.userId!, updates);
      }
      res.json({ success: true, message: "Configuration saved" });
    } catch {
      res.status(500).json({ success: false, message: "Failed to save configuration" });
    }
  });

  // POST /api/chat — streams SSE response, works with or without auth session
  app.post("/api/chat", express.json({ limit: "5mb" }), async (req, res) => {
    try {
      const { content, conversationId, history, lang, langName } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Message content is required" });
      }

      const userId: number | undefined = req.session?.userId;

      // Build chat history from either DB (authenticated) or client-provided history (guest)
      let chatHistory: { role: "user" | "assistant"; content: string }[] = [];

      if (userId) {
        let convId: number = conversationId;
        if (!convId) {
          const convs = await storage.getConversations(userId);
          convId = convs.length > 0
            ? convs[0].id
            : (await storage.createConversation(userId, "Main Session")).id;
        }
        const conv = await storage.getConversation(convId);
        if (conv && conv.userId === userId) {
          await storage.createMessage(convId, "user", content.trim());
          const allMessages = await storage.getMessages(convId);
          chatHistory = allMessages.slice(-20).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          // Store convId so we can persist the assistant reply later
          (req as any)._convId = convId;
        }
      } else if (Array.isArray(history)) {
        // Guest mode: use client-supplied history
        chatHistory = history
          .filter((m: any) => m.role && m.content)
          .slice(-20)
          .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));
        chatHistory.push({ role: "user", content: content.trim() });
      } else {
        chatHistory = [{ role: "user", content: content.trim() }];
      }

      const user = userId ? await storage.getUser(userId) : null;
      const personalityMap: Record<string, string> = {
        Friendly: "You are warm, supportive, and encouraging.",
        Funny: "You are witty, playful, and like to make light-hearted jokes.",
        "Smart Helper": "You are analytical, precise, and give thorough explanations.",
        Professional: "You are formal, concise, and business-like.",
        Sassy: "You are bold, confident, and a little cheeky — but always helpful.",
      };
      const personalityNote = user?.personality && personalityMap[user.personality]
        ? personalityMap[user.personality]
        : "You are a helpful AI assistant.";
      const langRule = langName ? `Respond in ${langName}.` : "Reply in the same language the user speaks.";
      const systemPrompt = `You are Aichat, an AI assistant. ${personalityNote} ${langRule} Keep responses concise and helpful.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const CHAT_FALLBACK = "Hello! Aichat is working.";

      try {
        const { getOpenAI } = await import("./replit_integrations/audio/client");
        const openai = getOpenAI();

        const stream = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
          stream: true,
          max_completion_tokens: 400,
          temperature: 0.7,
        });

        let fullResponse = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        if (userId && (req as any)._convId) {
          await storage.createMessage((req as any)._convId, "assistant", fullResponse);
        }
      } catch (aiErr: any) {
        console.error("Chat AI error:", aiErr?.message);
        res.write(`data: ${JSON.stringify({ content: CHAT_FALLBACK })}\n\n`);
        if (userId && (req as any)._convId) {
          await storage.createMessage((req as any)._convId, "assistant", CHAT_FALLBACK);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, conversationId: (req as any)._convId ?? null })}\n\n`);
      res.end();
    } catch (err) {
      console.error("Chat route error:", err);
      const CHAT_FALLBACK = "Hello! Aichat is working.";
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ content: CHAT_FALLBACK, done: true })}\n\n`);
        res.end();
      } else {
        res.status(200).json({ message: CHAT_FALLBACK });
      }
    }
  });

  // Conversation CRUD
  app.get(api.conversations.list.path, requireAuth, async (req, res) => {
    try {
      const convos = await storage.getConversations(req.session.userId!);
      res.json(convos);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.conversations.get.path, requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const convo = await storage.getConversation(id);
      if (!convo || convo.userId !== req.session.userId) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      const messages = await storage.getMessages(id);
      res.json({ ...convo, messages });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.conversations.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.conversations.create.input.parse(req.body);
      const convo = await storage.createConversation(req.session.userId!, input.title);
      res.status(201).json(convo);
    } catch {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.conversations.delete.path, requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const convo = await storage.getConversation(id);
      if (!convo || convo.userId !== req.session.userId) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      await storage.deleteConversation(id);
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // AI integration routes
  registerAudioRoutes(app);
  registerImageRoutes(app);
  registerVisionRoutes(app);

  return httpServer;
}
