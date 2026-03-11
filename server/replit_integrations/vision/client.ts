import OpenAI from "openai";
import { textToSpeech } from "../audio/client";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function detectAndExplainObject(imageBase64: string): Promise<{
  objectName: string;
  explanation: string;
  audioBuffer: Buffer;
}> {
  // Step 1: Analyze image with vision
  const visionResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "text",
            text: `You are a visual assistant expert. Analyze this image and:
1. Identify the main object or subject in focus
2. Provide a brief, clear name for it (2-3 words max)
3. Give a detailed but concise explanation including what it is, how it works (if applicable), and useful information

Format your response exactly as:
OBJECT: [object name]
EXPLANATION: [detailed explanation in 2-3 sentences]`,
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  const responseText = visionResponse.choices[0]?.message?.content || "";
  
  // Parse response
  const objectMatch = responseText.match(/OBJECT:\s*(.+?)(?:\n|$)/);
  const explanationMatch = responseText.match(/EXPLANATION:\s*(.+?)(?:\n|$)/);
  
  const objectName = objectMatch?.[1]?.trim() || "Unknown Object";
  const explanation = explanationMatch?.[1]?.trim() || responseText;

  // Step 2: Generate audio from explanation
  const ttsText = `${objectName}. ${explanation}`;
  const audioBuffer = await textToSpeech(ttsText, "nova", "mp3");

  return { objectName, explanation, audioBuffer };
}

export async function streamObjectDetection(imageBase64: string): Promise<AsyncIterable<{
  type: "objectName" | "explanation" | "audio";
  data: string | Buffer;
}>> {
  return (async function* () {
    try {
      // Analyze image
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
              {
                type: "text",
                text: `You are a visual assistant expert. Analyze this image and identify the main object.
Format: OBJECT: [name] | EXPLANATION: [details]`,
              },
            ],
          },
        ],
        max_tokens: 500,
      });

      const responseText = visionResponse.choices[0]?.message?.content || "";
      const objectMatch = responseText.match(/OBJECT:\s*(.+?)(?:\||\n|$)/);
      const explanationMatch = responseText.match(/EXPLANATION:\s*(.+?)(?:\n|$)/);
      
      const objectName = objectMatch?.[1]?.trim() || "Unknown";
      const explanation = explanationMatch?.[1]?.trim() || responseText;

      // Yield text results
      yield { type: "objectName", data: objectName };
      yield { type: "explanation", data: explanation };

      // Stream audio
      const ttsText = `${objectName}. ${explanation}`;
      const audioBuffer = await textToSpeech(ttsText, "nova", "mp3");
      yield { type: "audio", data: audioBuffer };
    } catch (error) {
      console.error("Vision detection error:", error);
      throw error;
    }
  })();
}
