import { db } from "./db";
import { eq, asc } from "drizzle-orm";
import { users, type User, type InsertUser, conversations, messages, type Conversation, type Message } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;

  getConversations(userId: number): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(userId: number, title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;

  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

// Fallback in-memory storage for when database is not available
export class MemoryStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private conversations: Map<number, Conversation> = new Map();
  private messages: Map<number, Message[]> = new Map();
  private userIdCounter = 1;
  private conversationIdCounter = 1;
  private messageIdCounter = 1;

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    for (const user of Array.from(this.users.values())) {
      if (user.email === email) return user;
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: this.userIdCounter++,
      avatar: insertUser.avatar || "avatar1",
      personality: insertUser.personality || "Friendly",
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: number, update: Partial<InsertUser>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, ...update };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getConversations(userId: number): Promise<Conversation[]> {
    const userConversations: Conversation[] = [];
    for (const conv of Array.from(this.conversations.values())) {
      if (conv.userId === userId) {
        userConversations.push(conv);
      }
    }
    return userConversations;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(userId: number, title: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.conversationIdCounter++,
      userId,
      title,
      createdAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    this.conversations.delete(id);
    this.messages.delete(id);
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return this.messages.get(conversationId) || [];
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const message: Message = {
      id: this.messageIdCounter++,
      conversationId,
      role,
      content,
      createdAt: new Date(),
    };
    
    const convMessages = this.messages.get(conversationId) || [];
    convMessages.push(message);
    this.messages.set(conversationId, convMessages);
    return message;
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error("Database getUser error:", error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    } catch (error) {
      console.error("Database getUserByEmail error:", error);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    } catch (error) {
      console.error("Database createUser error:", error);
      throw error;
    }
  }

  async updateUser(id: number, update: Partial<InsertUser>): Promise<User> {
    try {
      const [user] = await db.update(users).set(update).where(eq(users.id, id)).returning();
      return user;
    } catch (error) {
      console.error("Database updateUser error:", error);
      throw error;
    }
  }

  async getConversations(userId: number): Promise<Conversation[]> {
    try {
      return await db.select().from(conversations).where(eq(conversations.userId, userId));
    } catch (error) {
      console.error("Database getConversations error:", error);
      throw error;
    }
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    try {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
      return conversation;
    } catch (error) {
      console.error("Database getConversation error:", error);
      throw error;
    }
  }

  async createConversation(userId: number, title: string): Promise<Conversation> {
    try {
      const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
      return conversation;
    } catch (error) {
      console.error("Database createConversation error:", error);
      throw error;
    }
  }

  async deleteConversation(id: number): Promise<void> {
    try {
      await db.delete(conversations).where(eq(conversations.id, id));
    } catch (error) {
      console.error("Database deleteConversation error:", error);
      throw error;
    }
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    try {
      return await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    } catch (error) {
      console.error("Database getMessages error:", error);
      throw error;
    }
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    try {
      const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
      return message;
    } catch (error) {
      console.error("Database createMessage error:", error);
      throw error;
    }
  }
}

// Try to use database storage, fallback to memory storage if database fails
let storageInstance: IStorage;

async function initializeStorage(): Promise<IStorage> {
  try {
    // Test database connection
    await db.select().from(users).limit(1);
    console.log("Using database storage");
    return new DatabaseStorage();
  } catch (error) {
    console.log("Database not available, using memory storage");
    return new MemoryStorage();
  }
}

// Initialize storage and export a promise that resolves to it
export const storagePromise = initializeStorage();

// For backward compatibility, create a getter that works with the promise
export const getStorage = async (): Promise<IStorage> => {
  if (!storageInstance) {
    storageInstance = await storagePromise;
  }
  return storageInstance;
};

// Export a mutable storage instance that will be updated asynchronously
export let storage: IStorage = new MemoryStorage(); // Fallback until async initialization completes

// Initialize storage in the background
initializeStorage().then(instance => {
  storage = instance;
}).catch(error => {
  console.error("Failed to initialize storage:", error);
});
