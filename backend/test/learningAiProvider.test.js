import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderError,
  createTutorProvider,
} from "../src/services/learningAiProvider.js";

test("Ollama tutor uses configured model and only the supplied lesson context", async () => {
  let requestUrl;
  let requestBody;
  const provider = createTutorProvider(
    {
      AI_PROVIDER: "ollama",
      AI_MODEL: "configured-model",
      AI_BASE_URL: "http://localhost:11434/",
      AI_API_KEY: "",
    },
    {
      fetchImpl: async (url, options) => {
        requestUrl = url;
        requestBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({ message: { content: "Let's review the idea together." } }),
        };
      },
    },
  );
  const response = await provider.generateReply({
    topic: { title: "Variables" },
    approvedContent: '{"explanation":"A variable stores a value."}',
    history: [{ role: "user", content: "What is a variable?" }],
    language: "en",
  });

  assert.equal(requestUrl, "http://localhost:11434/api/chat");
  assert.equal(requestBody.model, "configured-model");
  assert.equal(requestBody.stream, false);
  assert.match(requestBody.messages[0].content, /A variable stores a value/);
  assert.match(requestBody.messages[0].content, /Do not fetch, cite, or invent external/);
  assert.equal(response.content, "Let's review the idea together.");
});

test("Ollama tutor reports provider failures instead of returning a fallback answer", async () => {
  const provider = createTutorProvider(
    {
      AI_PROVIDER: "ollama",
      AI_MODEL: "configured-model",
      AI_BASE_URL: "http://localhost:11434",
    },
    { fetchImpl: async () => ({ ok: false, status: 500 }) },
  );

  await assert.rejects(
    provider.generateReply({
      topic: { title: "Variables" },
      approvedContent: "Approved lesson",
      history: [],
      language: "ta",
    }),
    (error) => error instanceof AiProviderError && error.statusCode === 503,
  );
});

test("provider selection is independent and rejects unimplemented provider adapters", () => {
  assert.throws(
    () => createTutorProvider({ AI_PROVIDER: "gemini" }),
    (error) => error instanceof AiProviderError && error.statusCode === 503,
  );
});
