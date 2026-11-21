const UNIT_TABLE = new Map([
  ["mm", ["length", 0.001]],
  ["cm", ["length", 0.01]],
  ["m", ["length", 1]],
  ["km", ["length", 1000]],
  ["mg", ["mass", 0.000001]],
  ["g", ["mass", 0.001]],
  ["kg", ["mass", 1]],
  ["ms", ["time", 0.001]],
  ["s", ["time", 1]],
  ["min", ["time", 60]],
  ["h", ["time", 3600]],
  ["ml", ["volume", 0.001]],
  ["l", ["volume", 1]],
]);
const UNIT_SUFFIXES = [...UNIT_TABLE.keys()].sort((left, right) => right.length - left.length);

function parseExpression(source, variables = {}) {
  const text = String(source || "").trim();
  if (!text || text.length > 300) return null;
  const tokens = [];
  const tokenPattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?|([()+\-*/^%])|([a-zA-Z]+))/gy;
  let position = 0;
  while (position < text.length) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(text);
    if (!match) return null;
    tokens.push(match[1] !== undefined
      ? Number(`${match[1]}${match[2] === undefined ? "" : `e${match[2]}`}`)
      : match[3] || match[4]);
    position = tokenPattern.lastIndex;
    if (tokens.length > 128) return null;
  }
  let cursor = 0;
  const primary = () => {
    const token = tokens[cursor++];
    if (token === "(") {
      const value = add();
      if (tokens[cursor++] !== ")") throw new Error("Unbalanced expression.");
      return value;
    }
    if (token === "sqrt" && tokens[cursor] === "(") {
      cursor += 1;
      const value = add();
      if (tokens[cursor++] !== ")") throw new Error("Unbalanced expression.");
      return Math.sqrt(value);
    }
    if (typeof token === "string" && Object.hasOwn(variables, token)) {
      return variables[token];
    }
    if (typeof token === "number" && Number.isFinite(token)) {
      return tokens[cursor] === "%" ? (cursor += 1, token / 100) : token;
    }
    throw new Error("Invalid expression.");
  };
  const power = () => {
    const left = primary();
    if (tokens[cursor] === "^") {
      cursor += 1;
      return left ** unary();
    }
    return left;
  };
  const unary = () => {
    if (tokens[cursor] === "+") {
      cursor += 1;
      return unary();
    }
    if (tokens[cursor] === "-") {
      cursor += 1;
      return -unary();
    }
    return power();
  };
  const multiply = () => {
    let value = unary();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const next = unary();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };
  const add = () => {
    let value = multiply();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      const next = multiply();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };
  try {
    const value = add();
    return cursor === tokens.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function parseQuantity(value, variables) {
  const text = String(value || "").trim();
  if (Object.hasOwn(variables, text)) {
    return { value: variables[text], dimension: "", unit: "" };
  }
  const ratioParts = text.split(":");
  if (ratioParts.length === 2) {
    const numerator = parseExpression(ratioParts[0], variables);
    const denominator = parseExpression(ratioParts[1], variables);
    if (numerator === null || denominator === null || denominator === 0) return null;
    return { value: numerator / denominator, dimension: "", unit: "" };
  }
  let expression = text;
  let unit = "";
  let numericValue = null;
  for (const suffix of UNIT_SUFFIXES) {
    const match = text.match(new RegExp(`^(.*?)\\s*${suffix}$`, "i"));
    const candidateValue = match?.[1].trim()
      ? parseExpression(match[1], variables)
      : null;
    if (candidateValue !== null) {
      expression = match[1];
      unit = suffix;
      numericValue = candidateValue;
      break;
    }
  }
  numericValue ??= parseExpression(expression, variables);
  if (numericValue === null) return null;
  if (!unit) return { value: numericValue, dimension: "", unit: "" };
  const conversion = UNIT_TABLE.get(unit);
  return conversion
    ? { value: numericValue, dimension: conversion[0], unit }
    : null;
}

function toBaseQuantity(quantity, fallbackUnit = "") {
  const unit = quantity.unit || fallbackUnit;
  const conversion = unit ? UNIT_TABLE.get(unit) : null;
  if (unit && !conversion) return null;
  return {
    value: quantity.value * (conversion?.[1] || 1),
    dimension: conversion?.[0] || "",
    unit,
  };
}

function quantitiesMatch(left, right, tolerance) {
  if (!left || !right) return false;
  if (left.dimension !== right.dimension) return false;
  const scale = Math.max(1, Math.abs(right.value));
  return Math.abs(left.value - right.value) <= tolerance * scale;
}

export function evaluateMathematicsTask(exercise, response) {
  const answer = String(response?.answer || response || "").trim();
  const reasoning = String(response?.reasoning || "").trim();
  if (!answer) {
    return {
      correctness: "ambiguous",
      status: "ANSWER_REQUIRED",
      accepted: false,
      feedback: "Enter your result so I can check it.",
      demonstrated: [],
    };
  }
  if (exercise.requireReasoning && !reasoning) {
    return {
      correctness: "partially_correct",
      status: "REASONING_REQUIRED",
      accepted: false,
      feedback: "Your result is recorded. Add the calculation steps so the reasoning can be checked too.",
      demonstrated: [],
    };
  }

  const rawVariables = exercise.variables instanceof Map
    ? Object.fromEntries(exercise.variables)
    : exercise.variables || {};
  const variables = {};
  if (
    !rawVariables ||
    typeof rawVariables !== "object" ||
    Array.isArray(rawVariables) ||
    Object.keys(rawVariables).length > 20 ||
    Object.entries(rawVariables).some(([key, value]) => {
      const numericValue = Number(value);
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(key) ||
        value === null ||
        value === "" ||
        !Number.isFinite(numericValue) ||
        Math.abs(numericValue) > 1000000000000
      ) return true;
      variables[key] = numericValue;
      return false;
    })
  ) {
    return {
      correctness: "ambiguous",
      status: "UNSUPPORTED_VARIABLES",
      accepted: false,
      feedback: "This task has invalid formula values. Ask your teacher to review it.",
      demonstrated: [],
    };
  }
  const expected = parseQuantity(exercise.expectedAnswer, variables);
  const actual = parseQuantity(answer, variables);
  if (!expected || !actual) {
    return {
      correctness: "ambiguous",
      status: "UNSUPPORTED_EXPRESSION",
      accepted: false,
      feedback: "I couldn't safely evaluate that expression. Use numbers, parentheses, sqrt(...), percentages, and +, -, ×, ÷, or ^, then try again.",
      demonstrated: [],
    };
  }
  const configuredUnit = String(exercise.unit || "").trim().toLowerCase();
  const expectedUnit = expected.unit || configuredUnit;
  const actualUnit = actual.unit || (exercise.requireUnit ? "" : expectedUnit);
  if (exercise.requireUnit && !actualUnit) {
    return {
      correctness: "partially_correct",
      status: "UNIT_REQUIRED",
      accepted: false,
      feedback: `The number is readable. Include the result in ${configuredUnit || "the requested unit"}.`,
      demonstrated: [],
    };
  }
  const expectedQuantity = toBaseQuantity(expected, expectedUnit);
  if (!expectedQuantity) {
    return {
      correctness: "ambiguous",
      status: "UNSUPPORTED_EXPECTED_UNIT",
      accepted: false,
      feedback: "This task's configured unit can't be checked safely. Ask your teacher to review it.",
      demonstrated: [],
    };
  }
  const actualQuantity = toBaseQuantity(actual, actualUnit);
  if (!actualQuantity) {
    return {
      correctness: "incorrect",
      status: "UNIT_MISMATCH",
      accepted: false,
      feedback: "That unit isn't supported for this check. Use the unit requested in the task.",
      demonstrated: [],
    };
  }
  if (actualQuantity.dimension !== expectedQuantity.dimension) {
    return {
      correctness: "incorrect",
      status: "UNIT_MISMATCH",
      accepted: false,
      feedback: `Use the requested unit${expectedUnit ? ` (${expectedUnit})` : ""} for this result.`,
      demonstrated: [],
    };
  }
  const tolerance = Math.max(0, Number(exercise.numericTolerance) || 0);
  const acceptedValues = [
    exercise.expectedAnswer,
    ...(Array.isArray(exercise.acceptedAnswers) ? exercise.acceptedAnswers : []),
  ].map((value) => {
    const quantity = parseQuantity(value, variables);
    return quantity ? toBaseQuantity(quantity, expectedUnit) : null;
  }).filter(Boolean);
  const correct = quantitiesMatch(
    actualQuantity,
    expectedQuantity,
    tolerance,
  ) || acceptedValues.some((candidate) =>
    quantitiesMatch(actualQuantity, candidate, tolerance),
  );
  return {
    correctness: correct ? "correct" : "incorrect",
    status: correct ? "CORRECT" : "INCORRECT_VALUE",
    accepted: correct,
    feedback: correct
      ? "The result checks out."
      : "That result doesn't match yet. Check the calculation and try again.",
    demonstrated: correct ? ["CALCULATION"] : [],
    reasoning,
  };
}
