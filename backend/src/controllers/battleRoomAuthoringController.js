/**
 * battleRoomAuthoringController.js
 * ------------------------------------------------------------------
 * Endpoints used by the authoring wizard (admin/creator only):
 *   POST /api/battle-rooms/authoring/generate-signature
 *   POST /api/battle-rooms/authoring/generate-starter
 *   POST /api/battle-rooms/authoring/generate-outputs
 *   POST /api/battle-rooms/authoring/validate
 *
 * These are stateless helpers — they do NOT create a room. Room creation
 * still goes through the existing POST /api/battle-rooms/create endpoint.
 */

import {
  normalizeQuestion,
  generateJavaStarterCode,
  generateExpectedOutputsForQuestion,
  validateQuestion,
} from "../services/battleRoomAuthoringService.js";
import {
  validateStructuredSignature,
  generateSignaturePreviews,
} from "../services/structuredSignature.js";
import { validateSignature } from "../services/signatureParser.js";

/**
 * POST /authoring/generate-signature
 *
 * Body: { name, returnType, parameters: [{name, type}] }
 * Returns the canonical signature + Java signature preview.
 */
export async function generateSignature(req, res) {
  try {
    const { name, returnType, parameters } = req.body;
    if (!name || !returnType || !Array.isArray(parameters)) {
      return res.status(400).json({ error: "Function name, return type, and parameters are required." });
    }

    const sigResult = validateStructuredSignature({ name, returnType, parameters });
    if (!sigResult.valid) {
      return res.status(400).json({ error: sigResult.errors[0] || "Invalid function definition.", errors: sigResult.errors });
    }

    const signature = sigResult.signature;
    return res.status(200).json({
      signature,
      signaturePreview: generateSignaturePreviews(signature),
      functionName: signature.name,
      returnType: signature.returnType,
      parameters: signature.params.map((p) => ({ name: p.name, type: p.type })),
    });
  } catch (error) {
    console.error("Generate signature error:", error.message);
    return res.status(500).json({ error: "Failed to generate signature: " + error.message });
  }
}

export async function generateStarterCode(req, res) {
  try {
    const { functionSignature, signature, starterCodeByLanguage, language } = req.body;
    if (language && String(language).trim().toLowerCase() !== "java") {
      return res.status(400).json({ error: "Only Java starter code is supported." });
    }

    let question;
    if (signature && signature.name) {
      // New structured flow — signature already canonical.
      question = normalizeQuestion({ signature });
    } else if (functionSignature) {
      const sigResult = validateSignature(functionSignature);
      if (!sigResult.valid) {
        return res.status(400).json({ error: "Invalid signature: " + sigResult.error });
      }
      question = normalizeQuestion({ functionSignature });
    } else {
      return res.status(400).json({ error: "A structured signature or function signature is required." });
    }

    const generated = generateJavaStarterCode(question);
    const merged = {
      java: generated.java || (starterCodeByLanguage || {}).java || "",
    };

    return res.status(200).json({
      signature: question.signature,
      signaturePreview: question.signaturePreview,
      starterCodeByLanguage: merged,
      functionName: question.signature?.name || "",
      language: "java",
    });
  } catch (error) {
    console.error("Generate starter code error:", error.message);
    return res.status(500).json({ error: "Failed to generate starter code: " + error.message });
  }
}

export async function generateOutputs(req, res) {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question payload is required." });
    }

    const normalized = normalizeQuestion(question);
    const errors = [];
    if (!normalized.signature || !normalized.signature.name) {
      errors.push("A valid function signature is required.");
    }
    if (!normalized.referenceSolution || !normalized.referenceSolution.trim()) {
      errors.push("Reference solution is required.");
    }
    if (!normalized.visibleTestCases || normalized.visibleTestCases.length === 0) {
      errors.push("At least one visible test case is required.");
    }
    if (!normalized.hiddenTestCases || normalized.hiddenTestCases.length === 0) {
      errors.push("At least one hidden test case is required.");
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(" "), errors });
    }

    const generated = await generateExpectedOutputsForQuestion(normalized);

    return res.status(200).json({
      message: "Expected outputs generated successfully.",
      accepted: true,
      visibleTestCases: generated.visibleTestCases,
      hiddenTestCases: generated.hiddenTestCases,
    });
  } catch (error) {
    console.error("Generate outputs error:", error.message);
    const status = error.message.includes("temporarily rate-limiting") ? 503 : 500;
    return res.status(status).json({ error: error.message });
  }
}

export async function validateQuestionEndpoint(req, res) {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question payload is required." });
    }

    const normalized = normalizeQuestion(question);
    const errors = validateQuestion(normalized);

    return res.status(200).json({
      valid: errors.length === 0,
      errors,
      normalizedQuestion: normalized,
    });
  } catch (error) {
    console.error("Validate question error:", error.message);
    return res.status(500).json({ error: "Failed to validate question: " + error.message });
  }
}

export default {
  generateSignature,
  generateStarterCode,
  generateOutputs,
  validateQuestionEndpoint,
};
