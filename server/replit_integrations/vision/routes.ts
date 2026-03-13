import type { Express, Request, Response } from "express";
import { detectAndExplainObject, streamObjectDetection } from "./client";

export function registerVisionRoutes(app: Express): void {
  // Detect object from image
  app.post("/api/vision/detect", async (req: Request, res: Response) => {
    try {
      const { image, lang, langName } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "Image data required" });
      }

      const result = await detectAndExplainObject(image, lang, langName);
      
      res.json({
        objectName: result.objectName,
        explanation: result.explanation,
        audioUrl: `data:audio/mp3;base64,${result.audioBuffer.toString("base64")}`,
      });
    } catch (error) {
      console.error("Vision detection error:", error);
      res.status(500).json({ error: "Failed to detect object" });
    }
  });

  // Stream detection (real-time)
  app.post("/api/vision/detect-stream", async (req: Request, res: Response) => {
    try {
      const { image, lang, langName } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "Image data required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const stream = await streamObjectDetection(image, lang, langName);
      
      for await (const chunk of stream) {
        if (chunk.type === "audio") {
          const audioBase64 = (chunk.data as Buffer).toString("base64");
          res.write(`data: ${JSON.stringify({ type: "audio", data: audioBase64 })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: chunk.type, data: chunk.data })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Vision stream error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Detection failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to detect object" });
      }
    }
  });
}
