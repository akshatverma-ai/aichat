import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";

// Body parser with 50MB limit for audio payloads
const audioBodyParser = express.json({ limit: "50mb" });

function buildSystemPrompt(lang: string): string {
  const base = "You are Aichat, a smart and friendly voice assistant. Be concise and conversational — reply in 1-3 sentences unless more detail is needed.";
  const langMap: Record<string, string> = {
    "hi-IN": "The user is speaking Hindi. Always reply in Hindi (Devanagari script). Keep the tone natural and conversational.",
    "hinglish": "The user is speaking Hinglish (a mix of Hindi and English). Always reply in the same Hinglish style — naturally mix Hindi and English words the way the user does. Do not switch fully to either language.",
    "ar-SA": "The user is speaking Arabic. Always reply in Arabic.",
    "zh-CN": "The user is speaking Chinese. Always reply in Chinese (Simplified).",
    "ja-JP": "The user is speaking Japanese. Always reply in Japanese.",
    "ko-KR": "The user is speaking Korean. Always reply in Korean.",
    "pa-IN": "The user is speaking Punjabi. Always reply in Punjabi.",
    "ta-IN": "The user is speaking Tamil. Always reply in Tamil.",
    "te-IN": "The user is speaking Telugu. Always reply in Telugu.",
    "ml-IN": "The user is speaking Malayalam. Always reply in Malayalam.",
    "bn-IN": "The user is speaking Bengali. Always reply in Bengali.",
    "en-US": "The user is speaking English. Reply in natural, clear English.",
  };
  const langInstruction = langMap[lang] ?? "Always respond in the same language the user speaks.";
  return `${base} ${langInstruction} Never switch languages unless the user does first.`;
}

export function registerAudioRoutes(app: Express): void {
  // Send message (text or voice) and get AI response via SSE stream.
  // Text mode: body = { content: string, lang?: string }
  // Voice mode: body = { audio: base64string, lang?: string, voice?: string }
  app.post("/api/conversations/:id/messages", audioBodyParser, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, audio, voice = "alloy", lang = "en-US" } = req.body;

      if (!content && !audio) {
        return res.status(400).json({ error: "Either content (text) or audio data is required" });
      }

      let userMessage = content;

      // If audio provided, transcribe it first
      if (audio) {
        const rawBuffer = Buffer.from(audio, "base64");
        const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);
        userMessage = await speechToText(audioBuffer, inputFormat);
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", userMessage);

      // Get conversation history for context
      const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatHistory = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const systemPrompt = buildSystemPrompt(lang);

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (audio) {
        // Voice mode: use gpt-audio model with streaming audio
        res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userMessage })}\n\n`);

        const stream = await openai.chat.completions.create({
          model: "gpt-audio",
          modalities: ["text", "audio"],
          audio: { voice, format: "pcm16" },
          messages: [
            { role: "system", content: systemPrompt },
            ...chatHistory,
          ],
          stream: true,
        });

        let assistantTranscript = "";

        for await (const chunk of stream) {
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
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      } else {
        // Text mode: streaming chat completions
        const stream = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...chatHistory,
          ],
          stream: true,
          max_completion_tokens: 1024,
          temperature: 0.7,
        });

        let fullResponse = "";

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        await chatStorage.createMessage(conversationId, "assistant", fullResponse);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }

      res.end();
    } catch (error) {
      console.error("Error processing message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });
}
