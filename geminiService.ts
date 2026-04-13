
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
    // We use the REST API directly to avoid browser SDK issues with iterators
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Ungültiger API-Key");
    }

    const data = await response.json();
    if (!data.models) {
        throw new Error("Keine Modelle gefunden");
    }

    // Filter for models that support generateContent
    const mappedModels = data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''));

    return mappedModels;
  } catch (error) {
    console.error("Error fetching models:", error);
    throw error;
  }
};
