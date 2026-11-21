import katex from "katex";

const MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g;

export function parseMathContent(value) {
  const segments = [];
  let previousIndex = 0;
  for (const match of String(value || "").matchAll(MATH_PATTERN)) {
    const index = match.index ?? 0;
    if (index > previousIndex) {
      segments.push({ type: "text", content: String(value).slice(previousIndex, index) });
    }
    const display = match[0].startsWith("$$");
    const source = match[0].slice(display ? 2 : 1, display ? -2 : -1).trim();
    segments.push({
      type: display ? "display-math" : "inline-math",
      html: katex.renderToString(source, {
        displayMode: display,
        output: "htmlAndMathml",
        strict: "warn",
        throwOnError: false,
        trust: false,
      }),
    });
    previousIndex = index + match[0].length;
  }
  if (previousIndex < String(value || "").length) {
    segments.push({ type: "text", content: String(value).slice(previousIndex) });
  }
  return segments;
}
