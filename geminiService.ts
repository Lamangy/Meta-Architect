
import { GoogleGenAI } from "@google/genai";
import { AgentRole, AttachedFile } from "./types";

export const runAgentTask = async (
  role: AgentRole, 
  projectIdea: string, 
  previousContext: string, 
  refinementFeedback?: string,
  previousOutput?: string,
  attachedFile?: AttachedFile,
  modelName: string = 'gemini-3-pro-preview',
  apiKey?: string
) => {
  // Use provided apiKey or fallback to process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });
  
  const isRefining = !!refinementFeedback;

  const systemInstructions: Record<AgentRole, string> = {
    [AgentRole.PRODUCT_MANAGER]: `Du bist ein Product Manager. ${isRefining ? 'ÜBERARBEITE das PRD basierend auf Feedback: ' + refinementFeedback : 'Erstelle ein PRD.'} Fokus: Features & User Stories.`,
    [AgentRole.ARCHITECT]: `Du bist ein Software Architect. ${isRefining ? 'PASSE das System-Design an basierend auf Feedback: ' + refinementFeedback : 'Erstelle technisches Design.'} Fokus: Datenfluss & Komponenten.`,
    [AgentRole.ENGINEER]: `Du bist ein Senior Engineer. Erstelle einen funktionalen Prototyp als EINZELNE HTML-DATEI. Tailwind CSS via CDN. Code in Markdown-Block ( \`\`\`html ).`,
    [AgentRole.QA]: `Du bist ein QA Engineer. ${isRefining ? 'Prüfe Feedback-Umsetzung: ' + refinementFeedback : 'Review Design & Code.'} Erstelle Testbericht.`
  };

  const textPart = {
    text: isRefining 
      ? `PROJEKT: ${projectIdea}\nFEEDBACK: ${refinementFeedback}\nOUTPUT: ${previousOutput}\nCONTEXT: ${previousContext}`
      : `PROJEKT: ${projectIdea}\nCONTEXT: ${previousContext}\nErstelle Beitrag als ${role}.`
  };

  const contents: any[] = [{ parts: [textPart] }];

  if (attachedFile && role === AgentRole.PRODUCT_MANAGER) {
    contents[0].parts.push({
      inlineData: {
        mimeType: attachedFile.mimeType,
        data: attachedFile.data
      }
    });
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: contents[0],
    config: {
      systemInstruction: systemInstructions[role],
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: modelName.includes('pro') ? 16000 : 0 }
    }
  });

  return response.text;
};

export const extractCode = (markdown: string): string | undefined => {
  const codeBlockRegex = /```html\n([\s\S]*?)```/i;
  const match = markdown.match(codeBlockRegex);
  if (match && match[1]) return match[1];
  
  const genericMatch = markdown.match(/```\n([\s\S]*?)```/);
  return genericMatch ? genericMatch[1] : undefined;
};

export const fetchModels = async (apiKey: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey });
    // GoogleGenAI models.list does not seem to reliably return an async iterator in some browser builds
    // or it requires pagination. Let's get the list and map it properly.
    const response = await ai.models.list();
    const models = [];

    // In newer GenAI SDK versions, models.list() might return an array or an iterator
    for await (const model of response) {
      models.push(model);
    }

    // Filter for models that support generateContent
    const mappedModels = models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));

    if (mappedModels.length === 0) {
       // Fallback if the SDK is empty or misconfigured, test a simple generation to verify the key works
       await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: "PING"
       });
       return ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.0-pro'];
    }
    return mappedModels;
  } catch (error) {
    console.error("Error fetching models:", error);
    throw error;
  }
};
