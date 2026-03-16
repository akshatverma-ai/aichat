import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";

const audioBodyParser = express.json({ limit: "50mb" });

function buildSystemPrompt(langName?: string, personality?: string): string {
  const langRule = langName
    ? `Respond in ${langName}.`
    : "Reply in the same language the user speaks.";

  const personalityMap: Record<string, string> = {
    Friendly: "You are warm, supportive, and encouraging.",
    Funny: "You are witty, playful, and like to make light-hearted jokes.",
    "Smart Helper": "You are analytical, precise, and give thorough explanations.",
    Professional: "You are formal, concise, and business-like.",
    Sassy: "You are bold, confident, and a little cheeky — but always helpful.",
  };
  const personalityNote = personality && personalityMap[personality]
    ? personalityMap[personality]
    : "You are a helpful AI assistant.";

  return (
    "You are Aichat, an AI assistant. " +
    personalityNote + " " +
    langRule + " " +
    "Keep responses short and conversational — 1 to 3 sentences. " +
    "Answer the question directly. No bullet points, no markdown. " +
    "Speak like a knowledgeable friend talking face-to-face."
  );
}

function bcp47ToIso639(bcp47: string): string {
  const map: Record<string, string> = {
    "en-US": "en",
    "en-GB": "en",
    "en-AU": "en",
    "hi-IN": "hi",
    "es-ES": "es",
    "fr-FR": "fr",
    "de-DE": "de",
    "ja-JP": "ja",
    "zh-CN": "zh",
    "ko-KR": "ko",
    "pt-BR": "pt",
    "ar-SA": "ar",
  };
  return map[bcp47] || bcp47.split("-")[0] || "en";
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = attempt === retries;
      const isRetryable =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT";
      if (isLast || !isRetryable) throw err;
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error("Unreachable");
}

export function registerAudioRoutes(app: Express): void {
  app.post(
    "/api/conversations/:id/messages",
    audioBodyParser,
    async (req: Request, res: Response) => {
      try {
        // Auth check
        const session = (req as any).session;
        if (!session?.userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        const conversationId = parseInt(req.params.id);
        if (isNaN(conversationId)) {
          return res.status(400).json({ error: "Invalid conversation ID" });
        }

        // Verify conversation ownership
        const conv = await chatStorage.getConversation(conversationId);
        if (!conv) {
          return res.status(404).json({ error: "Conversation not found" });
        }
        if (conv.userId !== null && conv.userId !== session.userId) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const {
          content,
          audio,
          voice = "alloy",
          lang,
          detectedLang,
          detectedLangName,
        } = req.body;

        const resolvedLang: string = detectedLang || lang || "en-US";
        const resolvedLangName: string = detectedLangName || "English";

        if (!content && !audio) {
          return res.status(400).json({ error: "Either content (text) or audio data is required" });
        }

        let userMessage = content;

        // Transcribe audio if provided
        if (audio) {
          try {
            const rawBuffer = Buffer.from(audio, "base64");
            const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);
            const isoLang = bcp47ToIso639(resolvedLang);
            userMessage = await withRetry(() =>
              speechToText(audioBuffer, inputFormat, isoLang)
            );
          } catch (transcribeErr: any) {
            console.error("Transcription failed:", transcribeErr?.message);
            return res.status(422).json({ error: "Speech transcription failed. Please speak more clearly." });
          }
        }

        if (!userMessage || !userMessage.trim()) {
          return res.status(400).json({ error: "No speech detected — please try again." });
        }

        // Save user message
        await chatStorage.createMessage(conversationId, "user", userMessage.trim());

        // Get conversation history (limit to last 20 messages)
        const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
        const recentMessages = existingMessages.slice(-20);
        const chatHistory = recentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Get user personality from session — best-effort
        let personality: string | undefined;
        try {
          const { storage } = await import("../../storage");
          const user = await storage.getUser(session.userId);
          personality = user?.personality;
        } catch {}

        const systemPrompt = buildSystemPrompt(resolvedLangName, personality);

        // Set up SSE
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        if (audio) {
          // Voice-in / audio-out: gpt-audio model
          res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userMessage })}\n\n`);

          try {
            const stream = await withRetry(() =>
              openai.chat.completions.create({
                model: "gpt-audio",
                modalities: ["text", "audio"],
                audio: { voice, format: "pcm16" },
                messages: [
                  { role: "system", content: systemPrompt },
                  ...chatHistory,
                ],
                stream: true,
              } as any)
            );

            let assistantTranscript = "";

            for await (const chunk of stream as any) {
              const delta = chunk.choices?.[0]?.delta as any;
              if (!delta) continue;
              if (delta?.audio?.transcript) {
                assistantTranscript += delta.audio.transcript;
                res.write(`data: ${JSON.stringify({ type: "transcript", data: delta.audio.transcript })}\n\n`);
              }
              if (delta?.audio?.data) {
                res.write(`data: ${JSON.stringify({ type: "audio", data: delta.audio.data })}\n\n`);
              }
            }

            await chatStorage.createMessage(conversationId, "assistant", assistantTranscript);
          } catch (audioErr: any) {
            console.error("Audio model error, falling back to text:", audioErr?.message);
            // Fallback: text response only
            const fallback = "I'm having trouble with audio right now. Please try text mode.";
            res.write(`data: ${JSON.stringify({ type: "transcript", data: fallback })}\n\n`);
            await chatStorage.createMessage(conversationId, "assistant", fallback);
          }

          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        } else {
          // Text-in / text-out: gpt-4o-mini with SSE
          try {
            const stream = await withRetry(() =>
              openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: systemPrompt },
                  ...chatHistory,
                ],
                stream: true,
                max_completion_tokens: 400,
                temperature: 0.7,
              })
            );

            let fullResponse = "";

            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta?.content || "";
              if (delta) {
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
              }
            }

            await chatStorage.createMessage(conversationId, "assistant", fullResponse);
          } catch (chatErr: any) {
            console.error("Chat model error:", chatErr?.message);
            const fallback = "I encountered an error processing your request. Please try again.";
            res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
            await chatStorage.createMessage(conversationId, "assistant", fallback);
          }

          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        }

        res.end();
      } catch (error: any) {
        console.error("Error processing message:", error?.message || error);
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ error: "Failed to process message", done: true })}\n\n`);
          res.end();
        } else {
          res.status(500).json({ error: "Failed to process message" });
        }
      }
    }
  );
}
