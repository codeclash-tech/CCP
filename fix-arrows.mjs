const fs = require("fs");
const path = require("path");

const root =
  "E:/My Works/Completed Products/coding-challenge-platform/frontend/src";
// These are mojibake sequences that appear as literal bytes in the files.
const pairs = [
  ["â†—", "↗"],
  ["â†“", "↓"],
  ["â†‘", "↑"],
  ["â†", "←"],
  ["â†’", "→"],
  ["â†", "→"],
  ["â€¢", "•"],
  ["â€“", "—"],
  ["â€”", "—"],
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx|js|css|html)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      let next = text;
      for (const [bad, good] of pairs) next = next.split(bad).join(good);
      if (next !== text) {
        fs.writeFileSync(full, next, "utf8");
        console.log("fixed", path.basename(full));
      }
    }
  }
}
walk(root);
console.log("done");
