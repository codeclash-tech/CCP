const MAX_CONTEXT_MESSAGES = 24;
const MAX_CONTEXT_CONTENT_LENGTH = 16000;

export class AiProviderError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = "AiProviderError";
    this.statusCode = statusCode;
  }
}

function tutorSystemPrompt({ language, topic, approvedContent, progressContext }) {
  const responseLanguage = language === "ta" ? "Tamil" : "English";
  return [
    `You are a patient, encouraging programming tutor. Respond in ${responseLanguage}.`,
    "Teach only from the approved lesson content included below. Do not fetch, cite, or invent external educational material or official syllabus details.",
    "Simplify, explain, translate, use the included examples, and ask a short follow-up question to check understanding.",
    "When a student asks for an exercise answer, first offer a small hint; do not reveal a complete solution unless the approved content includes it and the student has already tried.",
    "Adapt the explanation to the student's earlier messages and progress summary, and review missed basics patiently.",
    "Be respectful and welcoming when questions are basic. If the approved lesson does not contain enough information, say so and invite the student to ask about the current lesson.",
    `Current topic: ${topic.title}`,
    `Student progress: ${JSON.stringify(progressContext || {})}`,
    "Approved lesson content:",
    approvedContent,
  ].join("\n\n");
}

function limitHistory(history) {
  let total = 0;
  return history
    .filter((message) =>
      ["user", "assistant"].includes(message?.role) &&
      typeof message?.content === "string",
    )
    .slice(-MAX_CONTEXT_MESSAGES)
    .reverse()
    .filter((message) => {
      if (total >= MAX_CONTEXT_CONTENT_LENGTH) return false;
      const content = message.content.slice(0, MAX_CONTEXT_CONTENT_LENGTH - total);
      total += content.length;
      message.content = content;
      return true;
    })
    .reverse();
}

export class OllamaTutorProvider {
  constructor({
    model,
    baseUrl,
    apiKey = "",
    fetchImpl = globalThis.fetch,
    timeoutMs = 45000,
  }) {
    this.model = String(model || "").trim();
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.name = "ollama";
  }

  async generateReply({ topic, approvedContent, history, language, progressContext }) {
    if (!this.model || !this.baseUrl) {
      throw new AiProviderError("The AI tutor is not configured.", 503);
    }

    const messages = [
      {
        role: "system",
        content: tutorSystemPrompt({ language, topic, approvedContent, progressContext }),
      },
      ...limitHistory(history),
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = { "Content-Type": "application/json" };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: this.model, messages, stream: false }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AiProviderError("The AI tutor is temporarily unavailable.", 503);
      }
      const result = await response.json();
      const content = result?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new AiProviderError("The AI tutor returned an empty response.", 503);
      }
      return { content: content.trim(), provider: this.name, model: this.model };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        error?.name === "AbortError"
          ? "The AI tutor took too long to respond. Please try again."
          : "The AI tutor is temporarily unavailable. Please try again.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createTutorProvider(config, options = {}) {
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  if (providerName === "ollama") {
    return new OllamaTutorProvider({
      model: config.AI_MODEL,
      baseUrl: config.AI_BASE_URL,
      apiKey: config.AI_API_KEY,
      timeoutMs: Number(config.AI_TIMEOUT_MS) || 45000,
      ...options,
    });
  }
  throw new AiProviderError(`The configured AI provider "${providerName}" is not supported.`, 503);
}
