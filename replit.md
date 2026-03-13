# Aichat - AI Voice & Text Chat Application

## Overview
A full-stack AI chat application with both text and voice conversation capabilities. Features a sci-fi themed UI with user authentication, conversation history, and multimodal AI interactions.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Wouter (routing), TanStack Query
- **Backend**: Node.js, Express 5, TypeScript (tsx), WebSockets (ws)
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: Replit AI Integrations (OpenAI-compatible) — chat, voice, image generation
- **Session**: express-session with PostgreSQL store (connect-pg-simple)

## Project Structure
```
client/          # React frontend (Vite)
  src/           # Components, pages, hooks
  public/        # Static assets including audio worklet
server/          # Express backend
  replit_integrations/
    audio/       # Voice chat (STT, TTS, gpt-audio)
    image/       # Image generation (gpt-image-1)
    vision/      # Vision routes
    chat/        # Text chat storage & routes
    batch/       # Batch processing utilities
shared/          # Shared types and schema
  schema.ts      # Drizzle schema (users, conversations, messages)
  routes.ts      # Shared API route definitions
```

## Key Configuration
- Server runs on port 5000 (configured via `PORT` env var)
- Dev command: `npm run dev` (uses `node_modules/.bin/tsx`)
- Database: PostgreSQL via `DATABASE_URL` env var
- AI: Uses `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` (Replit-managed)
- Session secret: `SESSION_SECRET` env var

## Features
- User registration/login with session authentication
- Conversation management (create, list, delete)
- Streaming text chat via SSE (gpt-4o-mini)
- Voice conversation with STT + audio response (gpt-audio, gpt-4o-mini-transcribe)
- Image generation (gpt-image-1)
- Vision capabilities

## Running
- Development: `npm run dev`
- Build: `npm run build`
- Production: `npm start`
- DB schema push: `npm run db:push`
