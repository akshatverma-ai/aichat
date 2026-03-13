import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";

const audioBodyParser = express.json({ limit: "50mb" });

function buildSystemPrompt(lang: string, langName?: string): string {
  const base =
    "You are Aichat, a smart and friendly voice assistant. " +
    "You listen carefully and always give clear, helpful, and accurate answers. " +
    "Keep responses short and conversational — 1 to 3 sentences. " +
    "Answer the question directly. No bullet points, no markdown. " +
    "Speak like a knowledgeable friend talking face-to-face.";

  const langMap: Record<string, string> = {
    "hi-IN": "IMPORTANT: The user is speaking Hindi. You MUST reply entirely in Hindi (Devanagari script). Do not switch to English under any circumstance.",
    "hinglish": "IMPORTANT: The user is speaking Hinglish (a natural mix of Hindi and English). Reply in the same Hinglish style — mix Hindi and English words naturally as the user does. Do not switch fully to either language.",
    "ar-SA": "IMPORTANT: The user is speaking Arabic. You MUST reply entirely in Arabic.",
    "zh-CN": "IMPORTANT: The user is speaking Chinese. You MUST reply in Simplified Chinese.",
    "ja-JP": "IMPORTANT: The user is speaking Japanese. You MUST reply in Japanese.",
    "ko-KR": "IMPORTANT: The user is speaking Korean. You MUST reply in Korean.",
    "pa-IN": "IMPORTANT: The user is speaking Punjabi. You MUST reply in Punjabi.",
    "ta-IN": "IMPORTANT: The user is speaking Tamil. You MUST reply in Tamil.",
    "te-IN": "IMPORTANT: The user is speaking Telugu. You MUST reply in Telugu.",
    "ml-IN": "IMPORTANT: The user is speaking Malayalam. You MUST reply in Malayalam.",
    "bn-IN": "IMPORTANT: The user is speaking Bengali. You MUST reply in Bengali.",
    "en-US": "The user is speaking English. Reply in natural, clear English.",
  };

  // If a human-readable name is given for an unmapped lang code, use a generic instruction
  const langInstruction =
    langMap[lang] ??
    (langName
      ? `IMPORTANT: The user is speaking ${langName}. Always reply in ${langName}.`
      : "Always reply in the exact same language the user is speaking. Never switch languages.");

  return `${base}\n\n${langInstruction}`;
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
