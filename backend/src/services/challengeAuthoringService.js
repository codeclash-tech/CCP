import { parseSignature, validateSignature, getStoredSignature } from './signatureParser.js';
import { composeProgram } from './wrapperGenerator.js';
import { executionService } from './executionService.js';
import { generateStarterCode, composeStarterFile } from './languageTemplates.js';
import { getChallengeTestCases } from './challengeTestCases.js';

const CATEGORY_VALUES = [
  'Array', 'String', 'Matrix', 'Linked List', 'Binary Tree', 'Graph', 'Stack', 'Queue', 'Heap', 'HashMap', 'Sorting', 'Searching', 'Dynamic Programming', 'Greedy', 'Backtracking', 'Bit Manipulation', 'Math', 'Custom'
];

const DIFFICULTY_MAP = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeTestCases(testCases) {
  return (Array.isArray(testCases) ? testCases : [])
    .filter((tc) => tc && (tc.input || tc.expectedOutput))
    .map((tc) => ({
      input: String(tc.input || '').trim(),
      expectedOutput: String(tc.expectedOutput || '').trim(),
      description: tc.description || '',
    }));
}

export function normalizeChallengePayload(payload) {
  const source = payload || {};
  const functionSignatures = source.functionSignatures || source.functionSignature || {};
  const referenceSolutions = source.referenceSolutions || source.referenceSolution || {};
  const starterCodes = source.starterCodes || source.starterCode || {};
  const javaSignature =
    typeof functionSignatures === "string"
      ? functionSignatures
      : functionSignatures.java;
  const javaReferenceSolution =
    typeof referenceSolutions === "string"
      ? referenceSolutions
      : referenceSolutions.java;
  const javaStarterCode =
    typeof starterCodes === "string" ? starterCodes : starterCodes.java;

  const normalized = {
    title: String(source.title || '').trim(),
    slug: slugify(source.slug || source.title || ''),
    difficulty: DIFFICULTY_MAP[String(source.difficulty || 'MEDIUM').toLowerCase()] || 'MEDIUM',
    category: CATEGORY_VALUES.includes(source.category) ? source.category : 'Custom',
    description: String(source.description || '').trim(),
    constraints: String(source.constraints || '').trim(),
    examples: Array.isArray(source.examples) ? source.examples.map((ex) => ({
      input: String(ex?.input || ''),
      output: String(ex?.output || ''),
      explanation: String(ex?.explanation || ''),
    })) : [],
    functionSignatures: javaSignature ? { java: String(javaSignature) } : {},
    starterCodes: javaStarterCode ? { java: String(javaStarterCode) } : {},
    referenceSolutions: javaReferenceSolution
      ? { java: String(javaReferenceSolution) }
      : {},
    testCases: normalizeTestCases(
      getChallengeTestCases(source).length > 0
        ? getChallengeTestCases(source)
        : [
            ...(source.visibleTestCases || []),
            ...(source.hiddenTestCases || []),
          ],
    ),
    createdBy: source.createdBy || null,
  };
  // Parse and store structured signature metadata from the first available signature.
  const sigEntries = Object.entries(normalized.functionSignatures);
  if (sigEntries.length > 0) {
    const firstSig = sigEntries[0][1];
    const sigResult = validateSignature(firstSig);
    if (sigResult.valid) {
      normalized.signature = sigResult.parsed;
    }
  } else if (source.signature && source.signature.name) {
    normalized.signature = getStoredSignature(source.signature);
  }

  if (Object.keys(normalized.functionSignatures).length === 0 && source.functionSignature) {
    normalized.functionSignatures = { java: String(source.functionSignature) };
  }

  return normalized;
}

export function validateChallengePayload(challenge) {
  const errors = [];
  const payload = challenge || {};

  if (!payload.title || !payload.title.trim()) errors.push('Problem title is required.');
  if (!payload.description || !payload.description.trim()) errors.push('Problem description is required.');
  if (!payload.difficulty) errors.push('Difficulty is required.');
  if (!payload.category) errors.push('Category is required.');

  if (!payload.testCases || payload.testCases.length === 0) {
    errors.push('At least one test case is required.');
  }
  const sampleCases = [
    ...(payload.examples || []).map((example) => ({
      input: example.input,
      output: example.output,
    })),
    ...(payload.testCases || []).map((testCase) => ({
      input: testCase.input,
      output: testCase.expectedOutput,
    })),
  ];
  const uniqueSampleCases = new Set(
    sampleCases
      .filter((sample) => sample.input !== undefined && sample.output !== undefined)
      .map((sample) => JSON.stringify([sample.input, sample.output])),
  );
  if (uniqueSampleCases.size < 3) {
    errors.push('At least three distinct sample test cases are required.');
  }

  const signatureEntries = Object.entries(payload.functionSignatures || {});
  if (signatureEntries.length === 0) {
    errors.push('At least one function signature is required.');
  } else {
    const validation = validateSignature(payload.functionSignatures.java);
    if (!validation.valid) {
      errors.push(`Invalid Java signature: ${validation.error}`);
    }
  }

  if (!payload.referenceSolutions || Object.keys(payload.referenceSolutions).length === 0) {
    errors.push('A reference solution is required.');
  }

  const slug = slugify(payload.slug || payload.title || '');
  if (!slug) errors.push('A valid slug is required.');

  return { valid: errors.length === 0, errors, slug };
}

export async function previewChallengeExecution(challenge) {
  const payload = challenge || {};
  const signatures = payload.functionSignatures || {};
  const refSolution = (payload.referenceSolutions || {}).java;
  const signature = signatures.java;

  if (!signature || !refSolution) {
    throw new Error('A reference solution and function signature are required for preview.');
  }

  // Use stored structured signature if available, otherwise parse the raw string.
  const parsed = payload.signature?.name ? getStoredSignature(payload.signature) : parseSignature(signature);
  const testCases = payload.testCases || [];
  const program = composeProgram({ signature: parsed }, refSolution, "java", { isFullProgram: true, forReferenceSolution: true });
  const result = await executionService.execute(program, testCases, "java", { timeLimit: 2000, memoryLimit: 65536 });
  return result;
}

/**
 * Generate fresh starter code for a challenge.
 * Uses the stored structured signature. Never persists generated code.
 */
export function generateStarterCodeForChallenge(challenge) {
  const payload = challenge || {};

  // Prefer structured signature.
  if (payload.signature && payload.signature.name) {
    const sig = getStoredSignature(payload.signature);
    const result = {};
    return { java: composeStarterFile(sig, "java") };
  }

  // Fallback: parse raw signatures.
  const signatures = payload.functionSignatures || {};
  const signature = signatures.java;
  if (!signature) {
    return {};
  }

  const parsed = parseSignature(signature);
  return { java: generateStarterCode(parsed, "java") };
}

export default {
  normalizeChallengePayload,
  validateChallengePayload,
  previewChallengeExecution,
  generateStarterCodeForChallenge,
};
