export const MAX_DISPLAYED_TEST_CASES = 3;

export function formatInputWithParameters(input, signature) {
  const rawInput = String(input ?? "");
  const parameters = signature?.params;
  if (
    !Array.isArray(parameters) ||
    parameters.length === 0 ||
    parameters.some((parameter) => !parameter?.name)
  ) {
    return rawInput;
  }

  const values = rawInput.split(/\r?\n/);
  if (values.length !== parameters.length) return rawInput;

  return parameters
    .map((parameter, index) => {
      const equalsIndex = values[index].indexOf("=");
      const existingName = values[index].slice(0, equalsIndex).trim();
      const value = equalsIndex >= 0 && existingName === parameter.name
        ? values[index].slice(equalsIndex + 1).trimStart()
        : values[index];
      return `${parameter.name} = ${value}`;
    })
    .join("\n");
}

export function formatTime(seconds) {
  if (!seconds || seconds < 0) return "0s";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function formatMemory(kb) {
  if (!kb || kb < 0) return "0 KB";
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function calculateScore(passed, total, timeToSolve, executionTime, memoryUsed) {
  if (total === 0) return 0;
  const passRatio = passed / total;
  const timePenalty = timeToSolve * 0.5;
  const executionPenalty = executionTime * 0.1;
  const memoryPenalty = memoryUsed * 0.05;

  const score = passRatio * 1000 - timePenalty - executionPenalty - memoryPenalty;
  return Math.max(0, Math.round(score * 100) / 100);
}

export function getDifficultyColor(difficulty) {
  const colors = {
    EASY: "#2ea043",
    MEDIUM: "#d29922",
    HARD: "#da3633",
  };
  return colors[difficulty] || "#7d8590";
}

export function getStatusColor(status) {
  const colors = {
    PASSED: "#2ea043",
    FAILED: "#da3633",
    ERROR: "#f85149",
    PENDING: "#d29922",
    ACCEPTED: "#2ea043",
    REJECTED: "#da3633",
    DISQUALIFIED: "#f85149",
    PROCESSING: "#d29922",
    SYSTEM_ERROR: "#f85149",
    WRONG_ANSWER: "#da3633",
    COMPILE_ERROR: "#f85149",
    COMPILATION_ERROR: "#f85149",
    RUNTIME_ERROR: "#da3633",
    TIME_LIMIT_EXCEEDED: "#d29922",
    MEMORY_LIMIT_EXCEEDED: "#d29922",
    RUN_COMPLETED: "#2ea043",
    SUBMITTED: "#2ea043",
  };
  return colors[status] || "#7d8590";
}

export function truncate(str, length = 50) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.substring(0, length) + "...";
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function getRandomQuote(quotes) {
  if (!quotes || quotes.length === 0) return { quote: "", author: "" };
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function extractEmailName(email) {

  if (!email) return "";
  const localPart = email.split("@")[0];
  return localPart
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
