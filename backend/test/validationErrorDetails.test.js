/**
 * Verifies that a Mongoose ValidationError now returns the specific failing
 * fields in the "error" message instead of a bare "Validation failed".
 */
import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

test("validation error handler surfaces failing fields", async () => {
  const schema = new mongoose.Schema({
    sequence: { type: Number, required: true, min: 1 },
  });
  const Model = mongoose.model("TestModule", schema);
  let validationError;
  try {
    await new Model({}).validate();
  } catch (error) {
    validationError = error;
  }
  assert.ok(validationError);
  assert.equal(validationError.name, "ValidationError");
  const fieldErrors = Object.entries(validationError.errors).map(
    ([path, detail]) => ({ field: path, message: detail.message }),
  );
  assert.equal(fieldErrors[0].field, "sequence");
  assert.match(fieldErrors[0].message, /required|Path `sequence`/);
});
