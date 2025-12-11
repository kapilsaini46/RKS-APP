
import { GoogleGenAI, Type } from "@google/genai";
import { Question, QuestionType } from "../types";

// Helper to get Env Var (duplicated to avoid circular dependency complexities in small apps)
const getEnv = (key: string): string => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key] as string;
    if (typeof process !== 'undefined' && process.env && process.env[`REACT_APP_${key}`]) return process.env[`REACT_APP_${key}`] as string;
  } catch (e) {}
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
       // @ts-ignore
       if (import.meta.env[key]) return import.meta.env[key];
       // @ts-ignore
       if (import.meta.env[`VITE_${key}`]) return import.meta.env[`VITE_${key}`];
    }
  } catch (e) {}
  return "";
};

const getAI = () => {
  const apiKey = getEnv("API_KEY");
  if (!apiKey) {
    console.error("API_KEY is missing in environment variables.");
    throw new Error("API Key is missing. Please set 'API_KEY' (or VITE_API_KEY) in your Vercel Environment Variables.");
  }
  return new GoogleGenAI({ apiKey });
};

// Robust ID generator fallback
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

export const generateQuestionsWithAI = async (
  classNum: string,
  subject: string,
  topic: string,
  questionType: string,
  count: number,
  marks: number,
  styleContext?: { 
    text: string, 
    attachment?: { data: string, mimeType: string },
    syllabusAttachment?: { data: string, mimeType: string }
  }
): Promise<Question[]> => {
  
  const ai = getAI();

  const systemInstruction = `You are an expert CBSE (Central Board of Secondary Education, India) school teacher and question paper setter. 
  Create strictly academic, curriculum-aligned questions for Class ${classNum} ${subject}.
  Topic: ${topic}.
  
  FORMATTING RULES (IMPORTANT):
  1. STRICTLY use LaTeX formatting for ALL mathematical expressions, equations, and symbols.
  2. Enclose all LaTeX in single dollar signs ($...$).
     - Correct: $x^2 + 2x + 1 = 0$
     - Incorrect: x^2 + 2x + 1 = 0
     - Correct: $H_2O$
     - Incorrect: H2O
  3. For fractions, use $\\frac{a}{b}$.
  4. For degrees, use $^\\circ$ (e.g. $30^\\circ$).
  5. Keep it readable and professional.
  
  Return ONLY valid JSON.`;

  let promptText = `Generate ${count} "${questionType}" questions.
  Marks per question: ${marks}.
  
  For MCQs, include 4 options and the correct answer.
  For "Match the Following" type questions:
  - Provide a list of 4-5 pairs in the 'matchPairs' field.
  - 'left' is Column A, 'right' is Column B.
  - Important: In the generated question, the right column should be shuffled/jumbled so it's a puzzle. 
  - Provide the correct answer key in the 'answer' field (e.g. A-3, B-1, C-4, D-2).
  
  For other types, provide a suggested answer key or marking scheme in the 'answer' field.
  
  ${styleContext?.text ? `\nSTYLE GUIDE & SCOPE:\n${styleContext.text}` : ''}

  Response Format:
  [
    {
      "text": "Question text or instruction (e.g. 'Match the following items:')",
      "options": ["Option A", "Option B"], // Only for MCQ
      "matchPairs": [
         { "left": "Item A", "right": "Item B (Shuffled)" },
         { "left": "Item C", "right": "Item D (Shuffled)" }
      ], // Only for Match Type
      "answer": "Correct answer string"
    }
  ]`;

  // Specific handling for Assertion-Reason to ensure standard options
  if (questionType === QuestionType.ASSERTION_REASON) {
      promptText += `\nFor Assertion-Reason questions, ensure the 'text' field follows this exact format:
      Assertion (A): [assertion statement]
      Reason (R): [reason statement]
      
      Also, you MUST populate the 'options' field with these exact 4 options:
      (A) Both Assertion (A) and Reason (R) are true and Reason (R) is the correct explanation of Assertion (A).
      (B) Both Assertion (A) and Reason (R) are true but Reason (R) is not the correct explanation of Assertion (A).
      (C) Assertion (A) is true but Reason (R) is false.
      (D) Assertion (A) is false but Reason (R) is true.`;
  }

  // Build the contents array
  const contents = [];
  
  // 1. Add Sample Question Paper (if exists)
  if (styleContext?.attachment) {
      contents.push({
          inlineData: {
              data: styleContext.attachment.data,
              mimeType: styleContext.attachment.mimeType
          }
      });
  }

  // 2. Add Syllabus/Blueprint (if exists) - AI will use this for scope
  if (styleContext?.syllabusAttachment) {
      contents.push({
          inlineData: {
              data: styleContext.syllabusAttachment.data,
              mimeType: styleContext.syllabusAttachment.mimeType
          }
      });
  }
  
  // 3. Add the text prompt
  contents.push({ text: promptText });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: contents },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              matchPairs: { 
                  type: Type.ARRAY, 
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          left: { type: Type.STRING },
                          right: { type: Type.STRING }
                      }
                  }
              },
              answer: { type: Type.STRING }
            },
            required: ["text", "answer"]
          }
        }
      }
    });

    const rawData = response.text;
    if (!rawData) throw new Error("Empty response from AI");
    
    // Clean potential markdown formatting often returned by LLMs
    const cleanText = rawData.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanText);
    } catch (e) {
      console.error("JSON Parse Error", cleanText);
      throw new Error("Failed to parse AI response. The model might be overloaded.");
    }

    return parsedData.map((q: any) => ({
      id: generateId(),
      type: questionType as QuestionType,
      text: q.text,
      marks: marks,
      options: q.options || [],
      matchPairs: q.matchPairs || [],
      answer: q.answer,
      topic: topic
    }));

  } catch (error) {
    console.error("AI Generation Error", error);
    // Rethrow with a clean message
    throw error;
  }
};

export const generateImageForQuestion = async (promptText: string): Promise<string> => {
  const ai = getAI();
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `Generate an image. Create a clear, educational, black and white line diagram for this question: ${promptText}` }]
      },
      config: {
        imageConfig: {
            aspectRatio: "4:3"
            // imageSize Removed: Not supported by gemini-2.5-flash-image
        }
      }
    });

    // Iterate to find image part
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    
    // Fallback if model returns text only or fails to generate image
    console.error("No image part found in response");
    return `https://placehold.co/400x300?text=Diagram+Not+Generated`;

  } catch (e: any) {
    console.error("Image gen failed", e);
    // Return placeholder
    return `https://placehold.co/400x300?text=Image+Error`;
  }
}
