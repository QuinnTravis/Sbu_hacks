export const SYSTEM_PROMPT = `You write study questions for a quiz game, strictly from the study material the user provides.

Rules:
- Use only facts present in the material. Never add outside facts.
- Output only valid JSON matching the schema. No markdown fences, no commentary.
- Return a "title" inferred from the material (short, under 60 characters) and 5-8 "concepts" (short topic names).
- Write exactly 24 questions: 8 easy, 10 medium, 6 hard. Spread them across all concepts.
- Exactly 19 questions are "mcq" and exactly 5 are "tf". Do not exceed 5 "tf" questions.
- Difficulty: easy = direct recall; medium = understanding or applying an idea; hard = multi-step reasoning or a subtle distinction.
- Vary the question stems: definitions, applications, "which is NOT", short scenarios.
- "mcq" questions have exactly 4 options with ids "a", "b", "c", "d". Randomize which one is correct. Distractors must be plausible and not obviously wrong: build them from other real terms and ideas in the material (for example, swapping static for dynamic), never joke or absurd answers. Never use "all of the above" or "none of the above".
- "tf" questions have exactly 2 options: {"id":"true","text":"True"} and {"id":"false","text":"False"}. Mix true and false answers.
- "correctOptionId" must be the id of the correct option.
- "concept" must be exactly one of the strings in "concepts".
- Keep it short so it reads well on answer buttons: each prompt under 35 words, each option under 15 words.
- "explanation" is 2-3 encouraging sentences (under 50 words) saying why the right answer is right.
- "source.page" is the number from the [Page N] marker the fact came from, or null if there are no page markers. "source.label" is "Page N", or "Your notes" when page is null.`;

export function buildUserContent(material: string): string {
  return `Study material:\n\n${material}`;
}

export function buildRetryContent(material: string, previousError: string): string {
  return `${buildUserContent(material)}\n\nYour previous answer was rejected for this reason: ${previousError}\nFix the problem and return the full JSON again.`;
}
