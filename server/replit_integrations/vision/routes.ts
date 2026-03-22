import express, { type Express, type Request, type Response } from "express";
import { detectAndExplainObject, streamObjectDetection } from "./client";

const visionBodyParser = express.json({ limit: "20mb" });

export function registerVisionRoutes(app: Express): void {
  // POST /api/vision — direct alias for detect (for compatibility)
  app.post("/api/vision", visionBodyParser, async (req: Request, res: Response) => {
    try {
      const { image, lang, langName } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image data required" });
      }

      const result = await detectAndExplainObject(image, lang, langName || "English");

      res.json({
        objectName: result.objectName,
        explanation: result.explanation,
        audioUrl: result.audioBuffer.length > 0
          ? `data:audio/mp3;base64,${result.audioBuffer.toString("base64")}`
          : null,
        success: true,
      });
    } catch (error) {
      console.error("Vision detection error:", error);
      res.status(500).json({ error: "Failed to detect object", success: false });
    }
  });

  // POST /api/vision/detect — detect object from image
  app.post("/api/vision/detect", visionBodyParser, async (req: Request, res: Response) => {
    try {
      const { image, lang, langName } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image data required" });
      }

      const result = await detectAndExplainObject(image, lang, langName || "English");

      res.json({
        objectName: result.objectName,
        explanation: result.explanation,
        audioUrl: result.audioBuffer.length > 0
          ? `data:audio/mp3;base64,${result.audioBuffer.toString("base64")}`
          : null,
      });
    } catch (error) {
      console.error("Vision detection error:", error);
      res.status(500).json({ error: "Failed to detect object" });
    }
  });

  // POST /api/vision/detect-stream — stream detection (real-time)
  app.post("/api/vision/detect-stream", visionBodyParser, async (req: Request, res: Response) => {
    const VISION_FALLBACK_OBJECT = "Object";
    const VISION_FALLBACK_EXPLANATION = "This looks like an object.";

    try {
      const { image, lang, langName } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image data required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      try {
        const stream = await streamObjectDetection(image, lang, langName || "English");

        for await (const chunk of stream) {
          if (chunk.type === "audio") {
            const audioBase64 = (chunk.data as Buffer).toString("base64");
            res.write(`data: ${JSON.stringify({ type: "audio", data: audioBase64 })}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({ type: chunk.type, data: chunk.data })}\n\n`);
          }
        }
      } catch (streamErr) {
        console.error("Vision stream error:", streamErr);
        res.write(`data: ${JSON.stringify({ type: "objectName", data: VISION_FALLBACK_OBJECT })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "explanation", data: VISION_FALLBACK_EXPLANATION })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Vision route error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "objectName", data: VISION_FALLBACK_OBJECT })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "explanation", data: VISION_FALLBACK_EXPLANATION })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        res.status(200).json({ objectName: VISION_FALLBACK_OBJECT, explanation: VISION_FALLBACK_EXPLANATION });
      }
    }
  });
}
