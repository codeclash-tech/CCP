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
    approvedContent: '{"objectives":["Explain that a variable stores a value."]}',
    advancedSettings: { temperature: 0.3, num_predict: 512, model: "untrusted-override" },
    history: [{ role: "user", content: "What is a variable?" }],
    language: "en",
  });

  assert.equal(requestUrl, "http://localhost:11434/api/chat");
  assert.equal(requestBody.model, "configured-model");
  assert.equal(requestBody.stream, false);
  assert.deepEqual(requestBody.options, { temperature: 0.3, num_predict: 512 });
  assert.match(requestBody.messages[0].content, /Explain that a variable stores a value/);
  assert.match(requestBody.messages[0].content, /Do not fetch, cite, or invent external/);
  assert.match(requestBody.messages[0].content, /Teach one incomplete objective at a time/);
  assert.match(requestBody.messages[0].content, /relatable, technically accurate story/);
  assert.match(requestBody.messages[0].content, /never provide the final answer or complete solution/);
  assert.match(requestBody.messages[0].content, /objectiveEvidence/);
  assert.match(requestBody.messages[0].content, /application validates evidence and alone decides mastery/);
  assert.match(requestBody.messages[0].content, /highest priority/);
  assert.equal(response.content, "Let's review the idea together.");
  assert.deepEqual(response.objectiveEvidence, []);
  assert.deepEqual(response.usage, {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  });
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

test("legacy AI mastery index claims are ignored by the provider parser", async () => {
  const provider = createTutorProvider(
    {
      AI_PROVIDER: "ollama",
      AI_MODEL: "configured-model",
      AI_BASE_URL: "http://localhost:11434",
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              reply: "Let's check that idea.",
              masteredObjectiveIndexes: [0],
            }),
          },
        }),
      }),
    },
  );
  const result = await provider.generateReply({
    topic: { title: "Variables" },
    approvedContent: "Approved lesson",
    history: [],
    language: "en",
  });
  assert.deepEqual(result.objectiveEvidence, []);
  assert.equal(Object.hasOwn(result, "masteredObjectiveIndexes"), false);
});

test("tutor parser extracts cited criterion evidence and clamps its confidence", async () => {
  const provider = createTutorProvider(
    {
      AI_PROVIDER: "ollama",
      AI_MODEL: "configured-model",
      AI_BASE_URL: "http://localhost:11434",
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              reply: "That explanation shows how it works.",
              teachingComplete: true,
              objectiveEvidence: [{
                objectiveKey: "objective-1",
                criteria: [{
                  criterionKey: "criterion-1",
                  demonstrated: true,
                  evidenceQuote: "It routes packets",
                  confidence: 1.4,
                  rationale: "Explains the routing role.",
                }],
              }],
            }),
          },
        }),
      }),
    },
  );
  const result = await provider.generateReply({
    topic: { title: "Routing" },
    approvedContent: "Approved lesson",
    history: [],
  });

  assert.equal(result.objectiveEvidence[0].criteria[0].evidenceQuote, "It routes packets");
  assert.equal(result.objectiveEvidence[0].criteria[0].confidence, 1);
  assert.equal(result.objectiveEvidence[0].criteria[0].rationale, "Explains the routing role.");
  assert.equal(result.teachingComplete, true);
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
    approvedContent: '{"objectives":["Explain that a variable stores a value."]}',
    progressContext: { completedTopics: 0 },
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
    { temperature: 0.4, top_p: 0.9, max_completion_tokens: 2048, top_k: undefined },
  );
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.include_reasoning, false);
  assert.match(body.messages[0].content, /Explain that a variable stores a value/);
  assert.match(body.messages[0].content, /Use only the active objective and its approved knowledge/);
  assert.match(body.messages[0].content, /When the answer is incorrect or incomplete/);
  assert.match(body.messages[0].content, /Never claim assessment completion/);
  assert.deepEqual(response, {
    content: "Let's try a small example.",
    objectiveEvidence: [],
    provider: "groq",
    model: "openai/gpt-oss-20b",
    truncated: false,
    usage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
  });
});

test("reasoning-model responses with empty content use the reasoning text instead of failing", async () => {
  const groq = createTutorProvider(
    {
      AI_PROVIDER: "groq",
      AI_MODEL: "openai/gpt-oss-20b",
      AI_BASE_URL: "https://api.groq.com/openai/v1",
      AI_API_KEY: "test-key",
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: "",
              reasoning: JSON.stringify({
                reply: "A variable stores a value under a name.",
                objectiveEvidence: [],
              }),
            },
          }],
        }),
      }),
    },
  );
  const reply = await groq.generateReply({
    topic: { title: "Test" },
    approvedContent: "",
    history: [],
  });
  assert.equal(reply.content, "A variable stores a value under a name.");
});

test("truly empty Groq responses fail with an actionable message", async () => {
  const groq = createTutorProvider(
    {
      AI_PROVIDER: "groq",
      AI_MODEL: "openai/gpt-oss-20b",
      AI_BASE_URL: "https://api.groq.com/openai/v1",
      AI_API_KEY: "test-key",
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "", reasoning: "" } }] }),
      }),
    },
  );
  await assert.rejects(
    groq.generateReply({ topic: { title: "Test" }, approvedContent: "", history: [] }),
    (error) => error instanceof AiProviderError && /num_predict|AI_MODEL/i.test(error.message),
  );
});

test("AI providers expose token usage only when the provider reports it", async () => {
  const ollama = createTutorProvider(
    {
      AI_PROVIDER: "ollama",
      AI_MODEL: "configured-model",
      AI_BASE_URL: "http://localhost:11434",
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          message: { content: "Reply" },
          prompt_eval_count: 7,
          eval_count: 5,
        }),
      }),
    },
  );
  const groq = createTutorProvider(
    {
      AI_PROVIDER: "groq",
      AI_MODEL: "configured-model",
      AI_BASE_URL: "https://api.groq.com/openai/v1",
      AI_API_KEY: "test-key",
    },
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Reply" } }],
          usage: { prompt_tokens: 11, completion_tokens: 13, total_tokens: 24 },
        }),
      }),
    },
  );
  const [ollamaReply, groqReply] = await Promise.all([
    ollama.generateReply({ topic: { title: "Test" }, approvedContent: "", history: [] }),
    groq.generateReply({ topic: { title: "Test" }, approvedContent: "", history: [] }),
  ]);

  assert.deepEqual(ollamaReply.usage, {
    promptTokens: 7,
    completionTokens: 5,
    totalTokens: 12,
  });
  assert.deepEqual(groqReply.usage, {
    promptTokens: 11,
    completionTokens: 13,
    totalTokens: 24,
  });
});

test("Groq tutor reports authentication, model, and rate-limit failures safely", async () => {
  const cases = [
    [401, /could not authenticate/, 503],
    [403, /could not authenticate/, 503],
    [400, /configured AI model or request/, 502],
    [404, /configured AI model or request/, 502],
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
