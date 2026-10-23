import { generateExpectedOutputsLocally } from "./localExecutionService.js";

export function generateReferenceOutputs(question, desktopBridge, generateViaBackend) {
  if (typeof desktopBridge?.engine?.execute === "function") {
    return generateExpectedOutputsLocally(question, desktopBridge);
  }
  return generateViaBackend(question);
}
