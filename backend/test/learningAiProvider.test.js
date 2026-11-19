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
    moduleBehavior: "Use analogies and ask one question at a time.",
    topicBehavior: "Give a visual analogy before the formal definition.",
    validationInstructions: "Ask the authored check question and offer a hint before feedback.",
    advancedSettings: { temperature: 0.3, num_predict: 512, model: "untrusted-override" },
    history: [{ role: "user", content: "What is a variable?" }],
    language: "en",
  });

  assert.equal(requestUrl, "http://localhost:11434/api/chat");
  assert.equal(requestBody.model, "configured-model");
  assert.equal(requestBody.stream, false);
  assert.deepEqual(requestBody.options, { temperature: 0.3, num_predict: 512 });
  assert.match(requestBody.messages[0].content, /A variable stores a value/);
  assert.match(requestBody.messages[0].content, /Do not fetch, cite, or invent external/);
  assert.match(requestBody.messages[0].content, /Use analogies and ask one question at a time/);
  assert.match(requestBody.messages[0].content, /visual analogy before the formal definition/);
  assert.match(requestBody.messages[0].content, /authored check question/);
  assert.match(requestBody.messages[0].content, /Do not reveal hidden expected answers/);
  assert.match(requestBody.messages[0].content, /highest priority/);
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

test("Groq tutor sends configured model, bearer key, approved prompt, and conversation history", async () => {
  let requestUrl;
  let requestOptions;
  const provider = createTutorProvider(
    {
      AI_PROVIDER: "groq",
      AI_MODEL: "openai/gpt-oss-20b",
      AI_BASE_URL: "https://api.groq.com/openai/v1/",
      AI_API_KEY: "test-groq-key",
    },
    {
      fetchImpl: async (url, options) => {
        requestUrl = url;
        requestOptions = options;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "Let's try a small example." } }],
          }),
        };
      },
    },
  );
  const response = await provider.generateReply({
    topic: { title: "Variables" },
    approvedContent: '{"explanation":"A variable stores a value."}',
    progressContext: { completedTopics: 0 },
    moduleBehavior: "Use friendly analogies.",
    topicBehavior: "Explain one idea at a time.",
    validationInstructions: "Offer a hint before feedback.",
    advancedSettings: { temperature: 0.4, top_p: 0.9, num_predict: 300, top_k: 30 },
    history: [
      { role: "user", content: "What is a variable?" },
      { role: "assistant", content: "It is a named place to store a value." },
      { role: "user", content: "Can you show me an example?" },
    ],
    language: "en",
  });
  const body = JSON.parse(requestOptions.body);

  assert.equal(requestUrl, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-groq-key");
  assert.equal(body.model, "openai/gpt-oss-20b");
  assert.equal(body.stream, false);
  assert.deepEqual(
    body.messages.slice(1).map(({ role, content }) => ({ role, content })),
    [
      { role: "user", content: "What is a variable?" },
      { role: "assistant", content: "It is a named place to store a value." },
      { role: "user", content: "Can you show me an example?" },
    ],
  );
  assert.deepEqual(
    {
      temperature: body.temperature,
      top_p: body.top_p,
      max_completion_tokens: body.max_completion_tokens,
      top_k: body.top_k,
    },
    { temperature: 0.4, top_p: 0.9, max_completion_tokens: 300, top_k: undefined },
  );
  assert.match(body.messages[0].content, /A variable stores a value/);
  assert.match(body.messages[0].content, /Use friendly analogies/);
  assert.match(body.messages[0].content, /Explain one idea at a time/);
  assert.match(body.messages[0].content, /Offer a hint before feedback/);
  assert.match(body.messages[0].content, /Never claim assessment completion/);
  assert.deepEqual(response, {
    content: "Let's try a small example.",
    provider: "groq",
    model: "openai/gpt-oss-20b",
  });
});

test("Groq tutor reports authentication, model, and rate-limit failures safely", async () => {
  const cases = [
    [401, /could not authenticate/, 503],
    [403, /could not authenticate/, 503],
    [400, /configured AI model or request/, 503],
    [404, /configured AI model or request/, 503],
    [429, /rate limit/, 429],
    [408, /too long to respond/, 503],
    [500, /temporarily unavailable/, 503],
  ];

  for (const [status, message, statusCode] of cases) {
    const provider = createTutorProvider(
      {
        AI_PROVIDER: "groq",
        AI_MODEL: "openai/gpt-oss-20b",
        AI_BASE_URL: "https://api.groq.com/openai/v1",
        AI_API_KEY: "test-groq-key",
      },
      { fetchImpl: async () => ({ ok: false, status }) },
    );

    await assert.rejects(
      provider.generateReply({
        topic: { title: "Variables" },
        approvedContent: "Approved lesson",
        history: [],
        language: "en",
      }),
      (error) =>
        error instanceof AiProviderError &&
        error.statusCode === statusCode &&
        message.test(error.message),
    );
  }
});

test("Groq tutor requires a backend API key and reports request timeouts", async () => {
  let fetchCalled = false;
  const missingKeyProvider = createTutorProvider({
    AI_PROVIDER: "groq",
    AI_MODEL: "openai/gpt-oss-20b",
    AI_BASE_URL: "https://api.groq.com/openai/v1",
    AI_API_KEY: "",
  }, {
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    },
  });

  await assert.rejects(
    missingKeyProvider.generateReply({
      topic: { title: "Variables" },
      approvedContent: "Approved lesson",
      history: [],
      language: "en",
    }),
    (error) => error instanceof AiProviderError && /API key/.test(error.message),
  );
  assert.equal(fetchCalled, false);

  const timeoutProvider = createTutorProvider(
    {
      AI_PROVIDER: "groq",
      AI_MODEL: "openai/gpt-oss-20b",
      AI_BASE_URL: "https://api.groq.com/openai/v1",
      AI_API_KEY: "test-groq-key",
      AI_TIMEOUT_MS: "5",
    },
    {
      timeoutMs: 5,
      fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("Request aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    },
  );

  await assert.rejects(
    timeoutProvider.generateReply({
      topic: { title: "Variables" },
      approvedContent: "Approved lesson",
      history: [],
      language: "en",
    }),
    (error) =>
      error instanceof AiProviderError &&
      error.statusCode === 503 &&
      /too long to respond/.test(error.message),
  );
});

test("provider selection is independent and rejects unimplemented provider adapters", () => {
  assert.throws(
    () => createTutorProvider({ AI_PROVIDER: "gemini" }),
    (error) => error instanceof AiProviderError && error.statusCode === 503,
  );
});
