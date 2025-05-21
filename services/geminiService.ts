
import { GoogleGenAI } from "@google/genai";

// IMPORTANT: API_KEY is expected to be set in the environment.
// For client-side, this usually means it's set via a build process (e.g., Vite's import.meta.env.VITE_API_KEY or Webpack's DefinePlugin)
// and then made available, e.g. window.APP_CONFIG.GEMINI_API_KEY or directly if build system replaces process.env.API_KEY.
// For this sandbox, we directly reference process.env.API_KEY as per instructions.
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;

if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.warn("Gemini API key not found (process.env.API_KEY). AI features will be disabled.");
}

export const isGeminiAvailable = (): boolean => !!ai;

export const suggestVideoTitle = async (theme: string): Promise<string[]> => {
  if (!ai) {
    return Promise.reject(new Error("Gemini AI client not initialized. API key missing or invalid."));
  }
  try {
    const prompt = `Suggest 3 creative and short video titles for a photo slideshow.
The theme is "${theme || 'general memories'}".
Keep titles under 8 words.
Return the suggestions as a JSON array of strings. For example: ["Summer Fun", "Adventure Time", "Golden Moments"]`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      }
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) { // Use match[1] for the content inside fences
      jsonStr = match[1].trim();
    }
    
    const parsedData = JSON.parse(jsonStr);
    if (Array.isArray(parsedData) && parsedData.every(t => typeof t === 'string')) {
      return parsedData;
    }
    console.error("Gemini response was not a valid JSON array of strings:", parsedData);
    return ["AI couldn't provide valid titles. Please try again."];
  } catch (error) {
    console.error("Error suggesting video title with Gemini:", error);
    if (error instanceof Error && error.message.includes("API key not valid")) {
         throw new Error("Invalid Gemini API Key. Please check your API key configuration.");
    }
    throw new Error("Failed to get title suggestions from AI. Check console for details.");
  }
};
