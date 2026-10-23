import assert from "node:assert/strict";
import test from "node:test";
import { isLocallyValidatedDesktopRequest } from "../src/controllers/challengeController.js";

const desktopRequest = {
  user: { role: "ADMIN" },
  headers: { origin: "codeclash://app" },
  body: { referenceSolutionValidatedLocally: true },
};

test("skips server reference execution only for locally validated desktop admin requests", () => {
  assert.equal(isLocallyValidatedDesktopRequest(desktopRequest), true);
  assert.equal(
    isLocallyValidatedDesktopRequest({
      ...desktopRequest,
      headers: { origin: "https://codeclash.amux.in" },
    }),
    false,
  );
  assert.equal(
    isLocallyValidatedDesktopRequest({
      ...desktopRequest,
      body: { referenceSolutionValidatedLocally: false },
    }),
    false,
  );
  assert.equal(
    isLocallyValidatedDesktopRequest({
      ...desktopRequest,
      user: { role: "USER" },
    }),
    false,
  );
});
