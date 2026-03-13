import OpenAI from "openai";
import { textToSpeech } from "../audio/client";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}
const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAI() as any)[prop];
  },
});

// Build language-aware system + user messages for vision
function buildVisionMessages(imageBase64: string, langName = "English") {
  const isHindi = langName.toLowerCase().includes("hindi") || langName.toLowerCase().includes("hinglish");
  const langInstruction = isHindi
    ? `You are Aichat Visual Assist. Describe objects in Hindi (Devanagari script). Always respond in Hindi.`
    : `You are Aichat Visual Assist. Describe objects in ${langName}. Always respond in ${langName}.`;

  const formatInstruction = isHindi
    ? `इस छवि का विश्लेषण करें और:
1. मुख्य वस्तु या विषय की पहचान करें
2. उसका संक्षिप्त नाम दें (2-3 शब्द)
3. एक स्पष्ट और संक्षिप्त विवरण दें (2-3 वाक्य)

उत्तर इस प्रारूप में दें:
OBJECT: [वस्तु का नाम]
EXPLANATION: [विस्तृत विवरण हिंदी में]`
    : `Analyze this image and:
1. Identify the main object or subject in focus
2. Provide a brief, clear name for it (2-3 words max)
3. Give a detailed but concise explanation including what it is, how it works (if applicable), and useful information

Format your response exactly as:
OBJECT: [object name]
EXPLANATION: [detailed explanation in 2-3 sentences in ${langName}]`;

  return [
    { role: "system" as const, content: langInstruction },
    {
      role: "user" as const,
      content: [
        {
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
        },
        { type: "text" as const, text: formatInstruction },
      ],
    },
  ];
}

// Pick the best TTS voice for the language
function pickVoice(langCode?: string): "nova" | "shimmer" | "alloy" {
  if (!langCode) return "nova";
  if (langCode.startsWith("hi") || langCode === "hinglish") return "shimmer";
  if (langCode.startsWith("ar")) return "alloy";
  return "nova";
}

export async function detectAndExplainObject(
  imageBase64: string,
  lang?: string,
  langName = "English"
): Promise<{ objectName: string; explanation: string; audioBuffer: Buffer }> {
  const messages = buildVisionMessages(imageBase64, langName);

  const visionResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 500,
  });

  const responseText = visionResponse.choices[0]?.message?.content || "";
  const objectMatch = responseText.match(/OBJECT:\s*(.+?)(?:\n|$)/);
  const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]+?)(?:\n\n|$)/);

  const objectName = objectMatch?.[1]?.trim() || "Unknown Object";
  const explanation = explanationMatch?.[1]?.trim() || responseText;

  const ttsText = `${objectName}. ${explanation}`;
  const voice = pickVoice(lang);
  const audioBuffer = await textToSpeech(ttsText, voice, "mp3");

  return { objectName, explanation, audioBuffer };
}

export async function streamObjectDetection(
  imageBase64: string,
  lang?: string,
  langName = "English"
): Promise<AsyncIterable<{ type: "objectName" | "explanation" | "audio"; data: string | Buffer }>> {
  return (async function* () {
    try {
      const messages = buildVisionMessages(imageBase64, langName);

      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
      });

      const responseText = visionResponse.choices[0]?.message?.content || "";
      const objectMatch = responseText.match(/OBJECT:\s*(.+?)(?:\||\n|$)/);
      const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]+?)(?:\n\n|$)/);

      const objectName = objectMatch?.[1]?.trim() || "Unknown";
      const explanation = explanationMatch?.[1]?.trim() || responseText;

      yield { type: "objectName", data: objectName };
      yield { type: "explanation", data: explanation };

      const ttsText = `${objectName}. ${explanation}`;
      const voice = pickVoice(lang);
      const audioBuffer = await textToSpeech(ttsText, voice, "mp3");
      yield { type: "audio", data: audioBuffer };
    } catch (error) {
      console.error("Vision detection error:", error);
      throw error;
    }
  })();
}
