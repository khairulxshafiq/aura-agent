import { askLLM } from "../llm.js";
import { supabaseInsert } from "../tools/supabase.js";

export async function trainingAgent(step) {
  const { action, params = {} } = step;
  console.log(`Training Agent: ${action}`);

  switch (action) {
    case "create_module": {
      const module = await askLLM(`
        Create a training module outline:
        Topic: ${params.topic || "N/A"}
        Audience: ${params.audience || "Staff / team members"}
        Duration: ${params.duration || "1 hour"}
        Level: ${params.level || "Beginner"}
        Include: objectives, topics, activities, assessment method.
      `, { maxTokens: 800 });
      return { module };
    }

    case "create_slides": {
      const slides = await askLLM(`
        Create slide content (text for each slide):
        Topic: ${params.topic || "N/A"}
        Number of slides: ${params.slides || 10}
        Style: ${params.style || "Professional, clear"}
        Format each slide as:
        SLIDE [Title]
        - Point 1
        - Point 2
        - Point 3
        [Speaker notes: ...]
      `, { maxTokens: 1500 });
      return { slides };
    }

    case "create_quiz": {
      const quiz = await askLLM(`
        Create a quiz/assessment:
        Topic: ${params.topic || "N/A"}
        Questions: ${params.numQuestions || 10}
        Type: ${params.type || "Multiple choice"}
        Difficulty: ${params.difficulty || "Medium"}
        Include answer key at the end.
      `, { maxTokens: 1000 });
      return { quiz };
    }

    case "create_sop": {
      const sop = await askLLM(`
        Create a Standard Operating Procedure (SOP):
        Process: ${params.process || "N/A"}
        Department: ${params.department || "Operations"}
        Include: purpose, scope, responsibilities, step-by-step procedure, safety notes.
      `, { maxTokens: 1000 });
      await supabaseInsert("sop_documents", {
        title: params.process,
        content: sop,
        department: params.department,
        version: "1.0",
        created_at: new Date().toISOString()
      });
      return { sop, saved: true };
    }

    case "onboarding_checklist": {
      const checklist = await askLLM(`
        Create an onboarding checklist:
        Role: ${params.role || "New employee"}
        Department: ${params.department || "General"}
        Duration: ${params.duration || "First 2 weeks"}
        Include: day-by-day tasks, who to meet, systems to learn.
      `, { maxTokens: 800 });
      return { checklist };
    }

    default: {
      const response = await askLLM(
        `You are a training expert. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 600 }
      );
      return { response };
    }
  }
}
