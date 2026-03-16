import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";

const audioBodyParser = express.json({ limit: "50mb" });

function buildSystemPrompt(_lang: string, _langName?: string): string {
  return (
    "You are Aichat assistant. " +
    "Always reply in the same language the user speaks. " +
    "If the user writes in Hindi, reply in Hindi. If in English, reply in English. " +
    "Keep responses short and conversational — 1 to 3 sentences. " +
    "Answer the question directly. No bullet points, no markdown. " +
    "Speak like a knowledgeable friend talking face-to-face."
  );
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
        const conversationId = parseInt(req.params.id);

        // Accept both `lang` (old) and `detectedLang` (new) field names
        const {
          content,
          audio,
          voice = "alloy",
          lang,
          detectedLang,
          detectedLangName,
        } = req.body;

        const resolvedLang: string = detectedLang || lang || "en-US";

        if (!content && !audio) {
          return res
            .status(400)
            .json({ error: "Either content (text) or audio data is required" });
        }

        let userMessage = content;

        // Transcribe audio if provided
        if (audio) {
          const rawBuffer = Buffer.from(audio, "base64");
          const { buffer: audioBuffer, format: inputFormat } =
            await ensureCompatibleFormat(rawBuffer);
          userMessage = await withRetry(() =>
            speechToText(audioBuffer, inputFormat)
          );
        }

        if (!userMessage || !userMessage.trim()) {
          return res
            .status(400)
            .json({ error: "No speech detected — please try again." });
        }

        // Save user message
        await chatStorage.createMessage(conversationId, "user", userMessage);

        // Get conversation history (limit to last 20 messages for speed)
        const existingMessages =
          await chatStorage.getMessagesByConversation(conversationId);
        const recentMessages = existingMessages.slice(-20);
        const chatHistory = recentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        const systemPrompt = buildSystemPrompt(resolvedLang, detectedLangName);

        // Set up SSE
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        if (audio) {
          // Voice-in / audio-out: gpt-audio model
          res.write(
            `data: ${JSON.stringify({ type: "user_transcript", data: userMessage })}\n\n`
          );

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
              res.write(
                `data: ${JSON.stringify({ type: "transcript", data: delta.audio.transcript })}\n\n`
              );
            }
            if (delta?.audio?.data) {
              res.write(
                `data: ${JSON.stringify({ type: "audio", data: delta.audio.data })}\n\n`
              );
            }
          }

          await chatStorage.createMessage(
            conversationId,
            "assistant",
            assistantTranscript
          );
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        } else {
          // Text-in / text-out: gpt-4o-mini with SSE
          const stream = await withRetry(() =>
            openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                ...chatHistory,
              ],
              stream: true,
              max_completion_tokens: 220,
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

          await chatStorage.createMessage(
            conversationId,
            "assistant",
            fullResponse
          );
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        }

        res.end();
      } catch (error: any) {
        console.error("Error processing message:", error?.message || error);
        if (res.headersSent) {
          res.write(
            `data: ${JSON.stringify({ error: "Failed to process message", done: true })}\n\n`
          );
          res.end();
        } else {
          res.status(500).json({ error: "Failed to process message" });
        }
      }
    }
  );
}
