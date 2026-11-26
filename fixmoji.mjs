import fs from "node:fs";
import path from "node:path";

const root =
  "E:/My Works/Completed Products/coding-challenge-platform/frontend/src";
// Fix the Windows-1252 mojibake produced by Set-Content with -Encoding UTF8 on a UTF-8 read as ANSI.
// Real chars that got mangled: — – ‘ ’ … ® © ·
const pairs = [
  ["Ã¢â‚¬â€", "—"], // em dash variants
  ["Ã¢â‚¬â€œ", "–"],
  ["Ã¢â‚¬Ëœ", "‘"],
  ["Ã¢â‚¬â„¢", "’"],
  ["Ã¢â‚¬Â¦", "…"],
  ["Ã¢â€žÂ¢", "™"],
  ["Ã‚Â®", "®"],
  ["Ã‚Â©", "©"],
  ["Ã‚Â·", "·"],
  ["Ã¢â‚¬Â¢", "•"],
  ["Ã†", "Æ"],
  ["Ã¦", "æ"],
  ["Ã…", "Å"],
  ["Ã", "Á"],
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx|js|css)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      let next = text;
      for (const [bad, good] of pairs) next = next.split(bad).join(good);
      // residual single-mangled forms: Ã¢â‚¬Â¦ etc handled; also handle "Â·", "â€™", "â€“", "â€”"
      next = next
        .split("Â·")
        .join("·")
        .split("â€™")
        .join("’")
        .split("â€˜")
        .join("‘")
        .split("â€“")
        .join("–")
        .split("â€”")
        .join("—")
        .split("â€¦")
        .join("…")
        .split("â€œ")
        .join("“")
        .split("â€\u009d")
        .join("”");
      if (next !== text) {
        fs.writeFileSync(full, next, "utf8");
        console.log("fixed", path.basename(full));
      }
    }
  }
}
walk(root);
