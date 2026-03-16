import type { Express } from "express";
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

const PostgresStore = connectPg(session);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session setup
  app.use(
    session({
      store: new PostgresStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || 'aiva_secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  // Extend express-session type to include user ID
  // Needs to be done in a proper declare module but for now we can cast


  // Auth Middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  };

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
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
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
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    res.json(user);
  });

  app.put(api.users.updateProfile.path, requireAuth, async (req, res) => {
    try {
      const input = api.users.updateProfile.input.parse(req.body);
      const user = await storage.updateUser(req.session.userId, input);
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // Conversation CRUD
  app.get(api.conversations.list.path, requireAuth, async (req, res) => {
    const convos = await storage.getConversations(req.session.userId);
    res.json(convos);
  });

  app.get(api.conversations.get.path, requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const convo = await storage.getConversation(id);
    if (!convo || convo.userId !== req.session.userId) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const messages = await storage.getMessages(id);
    res.json({ ...convo, messages });
  });

  app.post(api.conversations.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.conversations.create.input.parse(req.body);
      const convo = await storage.createConversation(req.session.userId, input.title);
      // Also ensure this is saved to chatStorage for the audio routes
      res.status(201).json(convo);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.conversations.delete.path, requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const convo = await storage.getConversation(id);
    if (!convo || convo.userId !== req.session.userId) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    await storage.deleteConversation(id);
    res.status(204).send();
  });

  // AI audio integration routes for /api/conversations/:id/messages
  registerAudioRoutes(app);
  registerImageRoutes(app);
  registerVisionRoutes(app);

  return httpServer;
}
