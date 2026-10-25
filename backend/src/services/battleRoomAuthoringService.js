/**
 * battleRoomAuthoringService.js
 * ------------------------------------------------------------------
 * Orchestrates the production-ready problem authoring pipeline for battle
 * room questions:
 *
 *   1. Normalize a question payload (structured signature + parameter-based
 *      test cases, or the legacy raw signature + raw input format).
 *   2. Convert parameter-based test-case values into the canonical judge
 *      input string (one JSON line per parameter).
 *   3. Generate Java starter code from one structured signature
 *   4. Generate the Java judge wrapper
 *   5. Generate expected outputs via the reference solution
 *   6. Validate a question before publishing (detailed errors)
 *
 * Important: Starter code is NEVER saved to the database. It is generated
 * fresh each time the question is loaded. Only the structured signature
 * metadata is persisted.
 */

import { parseSignature, validateSignature, getStoredSignature } from "./signatureParser.js";
import {
  validateStructuredSignature,
  generateSignaturePreviews,
} from "./structuredSignature.js";
import {
  convertParameterValuesToInput,
  validateParameterTestCases,
  parseInputToParameterValues,
} from "./parameterConverter.js";
import { composeStarterFile } from "./languageTemplates.js";
import { generateExpectedOutputs } from "./referenceSolutionService.js";

export const PROBLEM_TYPES = [
  "array",
  "string",
  "linked-list",
  "tree",
  "graph",
  "matrix",
  "dynamic-programming",
  "greedy",
  "stack",
  "queue",
  "binary-search",
  "math",
  "bit-manipulation",
  "custom",
];

export const CATEGORY_VALUES = [
  "Array", "String", "Matrix", "Linked List", "Binary Tree", "Graph",
  "Stack", "Queue", "Heap", "HashMap", "Sorting", "Searching",
  "Dynamic Programming", "Greedy", "Backtracking", "Bit Manipulation", "Math", "Custom",
];

export const TAG_SUGGESTIONS = [
  "array", "hash-map", "two-pointers", "sorting", "stack", "queue", "sliding-window",
  "binary-search", "recursion", "linked-list", "tree", "graph", "dfs", "bfs",
  "dynamic-programming", "greedy", "backtracking", "bit-manipulation", "math",
  "string", "matrix", "prefix-sum", "heap", "memoization", "topological-sort",
];

/**
 * Split a raw bulk editor textarea into individual test-case blocks.
 */
export function splitBulkTestCases(raw) {
  if (!raw || typeof raw !== "string") return [];
  const blocks = raw
    .split(/\r?\n---\s*\r?\n|\r?\n---\r?\n?|^---\s*$/m)
    .map((b) => b.trim())
    .filter((b) => b !== "");
  return blocks;
}

/**
 * Deduplicate test cases (by input string, and by input+expected).
 */
export function deduplicateTestCases(testCases) {
  const seenInputs = new Set();
  const seenFull = new Set();
  const unique = [];
  for (const tc of testCases) {
    if (!tc || tc.input === undefined || tc.input === null || String(tc.input).trim() === "") continue;
    const inputKey = String(tc.input).trim();
    const fullKey = inputKey + "|||" + String(tc.expectedOutput ?? "").trim();
    if (seenFull.has(fullKey)) continue;
    seenInputs.add(inputKey);
    seenFull.add(fullKey);
    unique.push(tc);
  }
  return unique;
}

function normalizeExamples(examples) {
  if (!Array.isArray(examples)) return [];
  return examples
    .filter((ex) => ex && (ex.input || ex.input === "") && (ex.output || ex.output === ""))
    .map((ex) => ({
      input: String(ex.input || ""),
      output: String(ex.output || ""),
      explanation: String(ex.explanation || ""),
    }));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter((t) => t !== "");
}

function normalizeHints(hints) {
  if (!Array.isArray(hints)) return [];
  return hints.map((h) => String(h).trim()).filter((h) => h !== "");
}

/**
 * Build the canonical signature for a question.
 *
 * Priority:
 *   1. Structured signature input ({ name, returnType, parameters })
 *      (the new parameter-based workflow).
 *   2. Stored structured signature (q.signature) — legacy + edit flow.
 *   3. Raw signature string (q.functionSignature) — legacy fallback.
 *
 * @returns {{ signature: Object|null, functionSignature: string, functionName: string }}
 */
export function resolveQuestionSignature(q) {
  const structuredInput = {
    name: q.functionName || q.name,
    returnType: q.returnType,
    parameters: q.parameters || q.params,
  };

  // 1. New structured workflow.
  if (structuredInput.parameters || (structuredInput.name && structuredInput.returnType)) {
    const sigResult = validateStructuredSignature(structuredInput);
    if (sigResult.valid && sigResult.signature) {
      return {
        signature: sigResult.signature,
        functionSignature: "",
        functionName: sigResult.signature.name,
        signaturePreview: generateSignaturePreviews(sigResult.signature),
        signatureErrors: [],
      };
    }
    // If the author explicitly used the builder but it is invalid, surface
    // the structured errors (do not silently fall back to raw parsing).
    if (Array.isArray(q.parameters) && q.parameters.length > 0) {
      return {
        signature: null,
        functionSignature: "",
        functionName: (q.functionName || "").trim(),
        signaturePreview: null,
        signatureErrors: sigResult.errors,
      };
    }
  }

  // 2. Stored structured signature.
  if (q.signature && q.signature.name) {
    const sig = getStoredSignature(q.signature);
    if (sig) {
      return {
        signature: sig,
        functionSignature: (q.functionSignature || "").trim(),
        functionName: sig.name,
        signaturePreview: generateSignaturePreviews(sig),
        signatureErrors: [],
      };
    }
  }

  // 3. Legacy raw signature string.
  const raw = (q.functionSignature || "").trim();
  if (raw) {
    const sigResult = validateSignature(raw);
    if (sigResult.valid) {
      return {
        signature: sigResult.parsed,
        functionSignature: raw,
        functionName: sigResult.parsed.name,
        signaturePreview: generateSignaturePreviews(sigResult.parsed),
        signatureErrors: [],
      };
    }
    return {
      signature: null,
      functionSignature: raw,
      functionName: (q.functionName || "").trim(),
      signaturePreview: null,
      signatureErrors: [sigResult.error],
    };
  }

  return {
    signature: null,
    functionSignature: "",
    functionName: (q.functionName || "").trim(),
    signaturePreview: null,
    signatureErrors: [],
  };
}

/**
 * Normalize test cases. When a signature is available and test cases provide
 * `parameterValues`, convert them to the canonical judge input string. Legacy
 * raw `input` strings are preserved unchanged.
 */
export function normalizeTestCases(rawTestCases, signature) {
  if (!Array.isArray(rawTestCases)) return [];
  const out = [];
  for (const tc of rawTestCases) {
    if (!tc) continue;
const hasParameterValues = tc.parameterValues && typeof tc.parameterValues === "object";
    if (hasParameterValues && signature && signature.name) {
      const input = convertParameterValuesToInput(signature, tc.parameterValues);
      out.push({
        input,
        expectedOutput: String(tc.expectedOutput ?? ""),
        description: tc.description || "",
        parameterValues: tc.parameterValues,
      });
    } else {
      out.push({
        input: String(tc.input ?? ""),
        expectedOutput: String(tc.expectedOutput ?? ""),
        description: tc.description || "",
        parameterValues: tc.parameterValues || undefined,
      });
    }
  }
  return out;
}

/**
 * Build a question object from the authoring form.
 * Stores structured signature metadata (never generated code).
 */
export function normalizeQuestion(rawQuestion) {
  const q = rawQuestion || {};
  const resolved = resolveQuestionSignature(q);

  const normalized = {
    title: (q.title || "").trim(),
    description: (q.description || "").trim(),
    explanation: (q.explanation || "").trim(),
    constraints: (q.constraints || "").trim(),
    difficulty: q.difficulty || "MEDIUM",
    points: q.points || 100,
    problemType: q.problemType || "array",
    category: CATEGORY_VALUES.includes(q.category) ? q.category : "Custom",
    tags: normalizeTags(q.tags),
    examples: normalizeExamples(q.examples),
    hints: normalizeHints(q.hints),
    functionSignature: resolved.functionSignature,
    functionName: resolved.functionName,
    signature: resolved.signature,
    signaturePreview: resolved.signaturePreview,
    signatureErrors: resolved.signatureErrors,
  };

  // New structured workflow — if the builder was used, require a valid
  // structured signature so the UI can never emit an invalid one.
  if (resolved.signature) {
    normalized.returnType = resolved.signature.returnType;
    normalized.parameters = resolved.signature.params.map((p) => ({ name: p.name, type: p.type }));
  }

  // Bulk inputs -> test cases (legacy flow).
  const legacyCases = [
    ...(Array.isArray(q.visibleTestCases) ? q.visibleTestCases : []),
    ...(Array.isArray(q.hiddenTestCases) ? q.hiddenTestCases : []),
  ];
  const sourceCases = Array.isArray(q.testCases) && q.testCases.length > 0
    ? q.testCases
    : legacyCases.length
      ? legacyCases
      : [
          ...splitBulkTestCases(q.bulkVisibleTestCases || q.visibleBulkInputs || ""),
          ...splitBulkTestCases(q.bulkHiddenTestCases || q.hiddenBulkInputs || ""),
        ].map((input) => ({ input, expectedOutput: "", description: "" }));
  const testCases = deduplicateTestCases(
    normalizeTestCases(sourceCases, resolved.signature),
  );

  normalized.testCases = testCases;

  normalized.referenceSolution = q.referenceSolution || "";
  normalized.referenceSolutionLanguage = q.referenceSolutionLanguage || "java";
  normalized.expectedOutputSource = q.expectedOutputSource || "reference";

  // Starter code: NEVER persist generated code. Generate fresh on load.
  normalized.starterCodeByLanguage = {};

  // Wrappers: if explicit provided, keep them; else generated on demand.
  const explicitWrappers = q.wrapperByLanguage && Object.keys(q.wrapperByLanguage).length > 0
    ? q.wrapperByLanguage
    : {};
  normalized.wrapperByLanguage = explicitWrappers;

  return normalized;
}

/**
 * Generate Java starter code from the question's signature.
 * Returns { java: starterFile }.
 * NEVER saves to DB — always fresh generation.
 */
export function generateJavaStarterCode(question) {
  if (!question.signature || !question.signature.name) {
    throw new Error("A valid function signature is required before generating starter code.");
  }
  return { java: composeStarterFile(question.signature, "java") };
}

/**
 * Generate expected outputs for all test cases using the
 * reference solution. Mutates and returns the question object.
 * On failure the reference solution service throws with the message:
 * "Reference solution failed. Fix the solution before publishing."
 */
export async function generateExpectedOutputsForQuestion(question) {
  if (!question.referenceSolution || !question.referenceSolution.trim()) {
    throw new Error("A reference solution is required to auto-generate expected outputs.");
  }
  if (!question.signature || !question.signature.name) {
    throw new Error("A valid function signature is required before generating expected outputs.");
  }
  if (
    question.referenceSolutionLanguage &&
    question.referenceSolutionLanguage !== "java"
  ) {
    throw new Error("Only Java reference solutions are supported.");
  }
  const allTestCases = question.testCases || [];
  const generated = await generateExpectedOutputs(
    question,
    question.referenceSolution,
    "java",
    allTestCases
  );

  question.testCases = generated;
  question.expectedOutputSource = "reference";
  return question;
}

/**
 * Validate a question before publishing. Returns detailed errors array.
 */
export function validateQuestion(question) {
  const errors = [];
  if (!question.title) errors.push("Question title is required.");
  if (!question.description) errors.push("Question description is required.");
  if (!question.constraints) errors.push("Constraints are required.");
  if (!["EASY", "MEDIUM", "HARD"].includes(question.difficulty)) {
    errors.push("Difficulty must be EASY, MEDIUM, or HARD.");
  }

  if (!question.signature || !question.signature.name) {
    if (Array.isArray(question.signatureErrors) && question.signatureErrors.length > 0) {
      errors.push(...question.signatureErrors);
    } else if (!question.functionSignature) {
      errors.push("A function is required. Provide the function name, return type, and parameters.");
    } else {
      errors.push("Function signature is invalid — include the function name and parameters.");
    }
  } else {
    const sig = question.signature;
    if (!sig.name) errors.push("Function name is required.");
    else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sig.name)) {
      errors.push("Function name is not a valid identifier.");
    }
    if (!sig.returnType) errors.push("Return type is required.");
    const names = (sig.params || []).map((p) => String(p.name || "").toLowerCase());
    if (new Set(names).size !== names.length) {
      errors.push("Parameter names must be unique.");
    }
    for (const p of sig.params || []) {
      if (!p.name || !String(p.name).trim()) {
        errors.push("Every parameter must have a name.");
        break;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(p.name).trim())) {
        errors.push("Parameter name \"" + p.name + "\" is not a valid identifier.");
      }
      if (!p.type || !String(p.type).trim()) {
        errors.push("Parameter \"" + p.name + "\" is missing a type.");
      }
    }
  }

  // Parameter-based test cases: validate the parameter values are complete
  // and well-formed for the declared signature.
  if (question.signature && question.signature.name) {
    errors.push(...validateParameterTestCases(question.signature, question.testCases));
  }

  if (!question.testCases || question.testCases.length === 0) {
    errors.push("At least one test case is required.");
  } else {
    const withMissingInput = question.testCases.filter((tc) => !tc.input || String(tc.input).trim() === "" || Object.keys(tc.parameterValues || {}).length === 0);
    if (withMissingInput.length > 0) errors.push("Some test cases are missing input values.");
  }

  const missing = (question.testCases || []).filter((tc) => tc.expectedOutput === undefined || tc.expectedOutput === null || String(tc.expectedOutput).trim() === "");
  if (missing.length > 0) {
    errors.push("Expected outputs are missing for " + missing.length + " test case(s). Re-run reference solution generation.");
  }

  const allInputs = (question.testCases || []).map((tc) => String(tc.input || "").trim());
  const uniqueInputs = new Set(allInputs);
  if (uniqueInputs.size !== allInputs.length) {
    errors.push("Duplicate test case inputs detected. Remove duplicates before publishing.");
  }

  if (question.referenceSolution && !question.referenceSolution.trim()) {
    errors.push("Reference solution is empty.");
  }
  if (!question.referenceSolution || !question.referenceSolution.trim()) {
    errors.push("A reference solution is required. The platform generates expected outputs from it.");
  }
  if (
    question.referenceSolutionLanguage &&
    question.referenceSolutionLanguage !== "java"
  ) {
    errors.push("Reference solution must use Java.");
  }

  return errors;
}

export default {
  PROBLEM_TYPES,
  CATEGORY_VALUES,
  TAG_SUGGESTIONS,
  splitBulkTestCases,
  deduplicateTestCases,
  resolveQuestionSignature,
  normalizeTestCases,
  normalizeQuestion,
  generateJavaStarterCode,
  generateExpectedOutputsForQuestion,
  validateQuestion,
  parseInputToParameterValues,
};
