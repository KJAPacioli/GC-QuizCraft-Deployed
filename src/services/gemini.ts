import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface GeneratedQuiz {
  quizName: string;
  questions: {
    questionText: string;
    questionType: 'MCQ' | 'TF';
    correctAnswer: string;
    options: string[];
    explanation: string;
    topic: string;
    citations?: string[];
  }[];
}

export async function generateTargetedPracticeQuiz(content: string, weakArea: string, numQuestions: number = 5): Promise<GeneratedQuiz> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Generate a targeted practice quiz with ${numQuestions} questions based on the following study material, focusing explicitly on the user's weak area: "${weakArea}". 
  Include a mix of Multiple Choice (MCQ) and True/False (TF) questions.
  For each question, provide an explanation of the correct answer and identify the specific sub-topic. Make sure the questions specifically address the concepts involved in the weak area.
  Use Google Search to fact-check the explanations and provide a list of relevant citation URLs validating the correct answer.
  
  Material:
  ${content}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          quizName: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionText: { type: Type.STRING },
                questionType: { type: Type.STRING, enum: ["MCQ", "TF"] },
                correctAnswer: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "For MCQ, provide 4 options. For TF, provide ['True', 'False']."
                },
                explanation: { type: Type.STRING },
                topic: { type: Type.STRING },
                citations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of reference URLs grounding the explanation."
                }
              },
              required: ["questionText", "questionType", "correctAnswer", "options", "explanation", "topic", "citations"]
            }
          }
        },
        required: ["quizName", "questions"]
      }
    }
  });

  const rawText = response.text;
  if (!rawText) throw new Error("No response from AI");
  const cleanJson = rawText.replace(/^\`\`\`json\s*/, '').replace(/\s*\`\`\`$/, '');
  return JSON.parse(cleanJson) as GeneratedQuiz;
}

export async function generateQuizFromContent(content: string, numQuestions: number = 5): Promise<GeneratedQuiz> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Generate a quiz with ${numQuestions} questions based on the following study material. 
  Include a mix of Multiple Choice (MCQ) and True/False (TF) questions.
  For each question, provide an explanation of the correct answer and identify the specific sub-topic.
  Use Google Search to fact-check the explanation for the correct answer, and include a list of relevant citation URLs from the web.
  
  Material:
  ${content}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          quizName: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionText: { type: Type.STRING },
                questionType: { type: Type.STRING, enum: ["MCQ", "TF"] },
                correctAnswer: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "For MCQ, provide 4 options. For TF, provide ['True', 'False']."
                },
                explanation: { type: Type.STRING },
                topic: { type: Type.STRING },
                citations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of reference URLs grounding the explanation."
                }
              },
              required: ["questionText", "questionType", "correctAnswer", "options", "explanation", "topic", "citations"]
            }
          }
        },
        required: ["quizName", "questions"]
      }
    }
  });

  const textStr = response.text || '{}';
  const cleanJson = textStr.replace(/^\s*\`\`\`json\s*/, '').replace(/\s*\`\`\`\s*$/, '');
  return JSON.parse(cleanJson);
}

export async function generateBankQuestions(topic: string, count: number = 3, content: string = '', difficulty: string = 'mixed'): Promise<any[]> {
  const model = "gemini-3-flash-preview";
  
  let diffInstruction = '';
  if (difficulty === 'mixed') {
    diffInstruction = "Include a mix of easy, medium, and hard difficulty questions.";
  } else {
    diffInstruction = `ALL generated questions MUST be of strictly "${difficulty}" difficulty.`;
  }

  let prompt = `Generate ${count} college-level multiple-choice questions about: "${topic}".
  Focus on conceptual understanding and application.
  ${diffInstruction}
  Use Google Search to fact-check the explanation for the correct answer, and include a list of relevant citation URLs from the web.
  `;

  if (content.trim()) {
    prompt += `\n\nBase the questions mostly on the following reference material:\n${content.substring(0, 40000)}`;
  }
  
  prompt += `\n\nReturn only the JSON array.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            questionText: { type: Type.STRING },
            questionType: { type: Type.STRING, enum: ["MCQ"] },
            correctAnswer: { type: Type.STRING },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Provide exactly 4 options including the correct answer."
            },
            explanation: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ["easy", "medium", "hard"] },
            citations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of reference URLs grounding the explanation."
            }
          },
          required: ["questionText", "questionType", "correctAnswer", "options", "explanation", "difficulty", "citations"]
        }
      }
    }
  });

  const textStr = response.text || '[]';
  const cleanJson = textStr.replace(/^\s*```json\s*/, '').replace(/\s*```\s*$/, '');
  return JSON.parse(cleanJson);
}

export interface AIInsights {
  weak_areas_identified: string;
  performance_trend: string;
  recommended_focus: string;
}

export async function generateAIInsights(results: any[]): Promise<AIInsights> {
  const model = "gemini-3-flash-preview";
  
  const textSummary = results.map(r => `Question: ${r.questionText} | Correct Answer: ${r.correctAnswer} | User Answer: ${r.userAnswer} | Was Correct: ${r.isCorrect}`).join('\n');
  
  const prompt = `Analyze this student's quiz performance and provide brief, constructive learning insights. Do not be overly critical. Identify a single weak area, deduce a short performance trend, and recommend a focus. \n\nPerformance Data:\n${textSummary}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          weak_areas_identified: { type: Type.STRING },
          performance_trend: { type: Type.STRING, description: "A few words analyzing their trend based on these responses, eg. 'Struggles with application-level questions'" },
          recommended_focus: { type: Type.STRING }
        },
        required: ["weak_areas_identified", "performance_trend", "recommended_focus"]
      }
    }
  });

  const textStr = response.text || '{}';
  const cleanJson = textStr.replace(/^\s*\`\`\`json\s*/, '').replace(/\s*\`\`\`\s*$/, '');
  return JSON.parse(cleanJson);
}
