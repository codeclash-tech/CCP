import ExcelJS from "exceljs";
import LearningStrictAttempt from "../models/LearningStrictAttempt.js";
import LearningModule from "../models/LearningModule.js";

function cell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/**
 * Build the admin Excel export for one Strict Evaluation module with the
 * required sheets: Overview, Student Results, Objective Analysis,
 * Knowledge Gaps, Improvement Suggestions.
 * Only the calling controller decides authorization; this module stays pure.
 */
export async function buildStrictResultsWorkbook(moduleId) {
  const moduleDoc = await LearningModule.findOne({
    _id: moduleId,
    evaluationMode: "STRICT_EVALUATION",
    deletedAt: null,
  }).lean();
  if (!moduleDoc) {
    throw Object.assign(new Error("Strict Evaluation module not found."), {
      statusCode: 404,
    });
  }
  const attempts = await LearningStrictAttempt.find({ moduleId })
    .sort({ createdAt: -1 })
    .limit(1000)
    .populate("userId", "name email")
    .lean();

  const completed = attempts.filter(
    (attempt) => attempt.status === "COMPLETED",
  );
  const participants = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.userId?._id || attempt.userId || "");
    if (key) participants.set(key, attempt.userId);
  }
  const levelDistribution = completed.reduce((distribution, attempt) => {
    const level = attempt.result?.overallLevel || "UNKNOWN";
    distribution[level] = (distribution[level] || 0) + 1;
    return distribution;
  }, {});

  const objectiveTally = new Map();
  const gapCount = new Map();
  const suggestionCount = new Map();
  for (const attempt of completed) {
    for (const entry of attempt.result?.objectiveResults || []) {
      const tally = objectiveTally.get(entry.objectiveKey) || {
        objectiveKey: entry.objectiveKey,
        objectiveTitle: entry.objectiveTitle || entry.objectiveKey,
        total: 0,
        sum: 0,
        weak: 0,
      };
      tally.total += 1;
      tally.sum += Number(entry.scorePercent) || 0;
      if ((Number(entry.scorePercent) || 0) < 60) tally.weak += 1;
      objectiveTally.set(entry.objectiveKey, tally);
    }
    for (const gap of attempt.result?.knowledgeGaps || []) {
      gapCount.set(gap, (gapCount.get(gap) || 0) + 1);
    }
    for (const suggestion of attempt.result?.improvementSuggestions || []) {
      suggestionCount.set(
        suggestion,
        (suggestionCount.get(suggestion) || 0) + 1,
      );
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "COGNICLASH";
  workbook.created = new Date();

  const overview = workbook.addWorksheet("Overview");
  overview.columns = [{ width: 42 }, { width: 24 }];
  overview.addRows([
    ["Module", moduleDoc.title],
    ["Evaluation mode", moduleDoc.evaluationMode],
    ["Eligible participants", participants.size],
    [
      "Started assessments",
      attempts.filter((attempt) => attempt.status !== "EXPIRED").length,
    ],
    ["Completed assessments", completed.length],
    [],
    ["Knowledge-level distribution", ""],
    ...Object.entries(levelDistribution).map(([level, count]) => [
      level,
      count,
    ]),
  ]);

  const students = workbook.addWorksheet("Student Results");
  students.columns = [
    { header: "Student", width: 28 },
    { header: "Email", width: 32 },
    { header: "Status", width: 14 },
    { header: "Score %", width: 10 },
    { header: "Overall level", width: 16 },
    { header: "Completed at", width: 26 },
    { header: "Strengths", width: 40 },
    { header: "Weaknesses", width: 40 },
  ];
  for (const attempt of attempts) {
    students.addRow([
      cell(attempt.userId?.name),
      cell(attempt.userId?.email),
      attempt.status,
      attempt.result?.scorePercent ?? "",
      attempt.result?.overallLevel ?? "",
      attempt.completedAt ?? attempt.createdAt,
      (attempt.result?.strengths || []).join("; "),
      (attempt.result?.weaknesses || []).join("; "),
    ]);
  }

  const objectives = workbook.addWorksheet("Objective Analysis");
  objectives.columns = [
    { header: "Objective", width: 36 },
    { header: "Key", width: 24 },
    { header: "Samples", width: 10 },
    { header: "Average %", width: 12 },
    { header: "Below 60%", width: 12 },
  ];
  for (const tally of objectiveTally.values()) {
    objectives.addRow([
      tally.objectiveTitle,
      tally.objectiveKey,
      tally.total,
      tally.total ? Math.round(tally.sum / tally.total) : 0,
      tally.weak,
    ]);
  }

  const gaps = workbook.addWorksheet("Knowledge Gaps");
  gaps.columns = [
    { header: "Knowledge gap", width: 70 },
    { header: "Students affected", width: 18 },
  ];
  for (const [gap, count] of [...gapCount.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    gaps.addRow([gap, count]);
  }

  const suggestions = workbook.addWorksheet("Improvement Suggestions");
  suggestions.columns = [
    { header: "Suggestion", width: 70 },
    { header: "Times suggested", width: 18 },
  ];
  for (const [suggestion, count] of [...suggestionCount.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    suggestions.addRow([suggestion, count]);
  }

  return workbook;
}

export default buildStrictResultsWorkbook;
