import mongoose from "mongoose";
import AssessmentIntegritySession from "../models/AssessmentIntegritySession.js";
import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklyRosterEntry from "../models/WeeklyRosterEntry.js";
import { calculateIntegrityRisk } from "../services/assessmentIntegrityService.js";

const EVENT_TYPES = new Set([
  "ASSESSMENT_START",
  "FULLSCREEN_EXIT",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "COPY_ATTEMPT",
  "PASTE_ATTEMPT",
  "DEVTOOLS_OPEN",
  "KEYBOARD_SHORTCUT",
  "ASSESSMENT_SUBMIT",
]);

async function authorizeAssessmentEvent({ assessmentType, assessmentId, userId }) {
  if (assessmentType === "DAILY_CHALLENGE") {
    const [cycle, roster] = await Promise.all([
      WeeklyCycle.findOne({
        _id: assessmentId,
        startAt: { $lte: new Date() },
        endAt: { $gt: new Date() },
        status: { $in: ["SCHEDULED", "ACTIVE"] },
      }).select("_id"),
      WeeklyRosterEntry.findOne({
        cycleId: assessmentId,
        candidateId: userId,
        participationStatus: { $ne: "DISQUALIFIED" },
      }).select("_id"),
    ]);
    return Boolean(cycle && roster);
  }

  const [room, submission] = await Promise.all([
    BattleRoom.findOne({
      _id: assessmentId,
      isActive: true,
      isDeleted: false,
      startTime: { $lte: new Date() },
      endTime: { $gt: new Date() },
    }).select("_id"),
    BattleRoomSubmission.findOne({
      roomId: assessmentId,
      userId,
      status: { $nin: ["DISQUALIFIED", "COMPLETED"] },
    }).select("_id"),
  ]);
  return Boolean(room && submission);
}

export async function recordAssessmentIntegrityEvent(req, res) {
  const body = req.body || {};
  const {
    assessmentType,
    assessmentId,
    sessionId,
    sequence,
    eventType,
    timestamp,
    reason,
  } = body;
  if (
    !["DAILY_CHALLENGE", "BATTLE_ROOM"].includes(assessmentType) ||
    !mongoose.Types.ObjectId.isValid(assessmentId) ||
    typeof sessionId !== "string" ||
    !/^[a-f\d-]{36}$/i.test(sessionId) ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > 200 ||
    !EVENT_TYPES.has(eventType) ||
    typeof timestamp !== "string" ||
    !Number.isFinite(Date.parse(timestamp)) ||
    (reason !== undefined &&
      (typeof reason !== "string" || reason.length > 200))
  ) {
    return res.status(400).json({ error: "The integrity event is invalid." });
  }
  const occurredAt = new Date(timestamp);
  const now = new Date();
  if (
    occurredAt.getTime() > now.getTime() + 60_000 ||
    occurredAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000
  ) {
    return res.status(400).json({ error: "The integrity event timestamp is outside the accepted window." });
  }
  if (
    !(await authorizeAssessmentEvent({
      assessmentType,
      assessmentId,
      userId: req.userId,
    }))
  ) {
    return res.status(403).json({ error: "This account is not participating in the active assessment." });
  }

  const key = {
    assessmentType,
    assessmentId,
    userId: req.userId,
    sessionId,
  };
  const event = {
    sequence,
    eventType,
    occurredAt,
    receivedAt: now,
    reason: reason || "",
  };
  try {
    let session;
    if (sequence === 1) {
      session = await AssessmentIntegritySession.create({
        ...key,
        lastSequence: 1,
        startedAt: occurredAt,
        lastEventAt: occurredAt,
        events: [event],
      });
    } else {
      const previous = await AssessmentIntegritySession.findOne(key)
        .select("lastSequence events");
      if (!previous || previous.lastSequence >= sequence) {
        return res.status(409).json({
          error: "The integrity event sequence is duplicated or out of order.",
          expectedSequence: previous ? previous.lastSequence + 1 : 1,
        });
      }
      event.sequenceGapBefore = Math.max(0, sequence - previous.lastSequence - 1);
      session = await AssessmentIntegritySession.findOneAndUpdate(
        {
          ...key,
          finalizedAt: null,
          lastSequence: previous.lastSequence,
          "events.199": { $exists: false },
        },
        {
          $set: { lastSequence: sequence, lastEventAt: occurredAt },
          $push: { events: event },
        },
        { new: true, runValidators: true },
      );
      if (!session) {
        return res.status(409).json({
          error: "The integrity session is finalized or has reached its event limit.",
        });
      }
    }
    return res.status(201).json({
      accepted: true,
      sequence,
      ...calculateIntegrityRisk(session.events),
      evidenceOnly: true,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await AssessmentIntegritySession.findOne(key)
        .select("lastSequence");
      return res.status(409).json({
        error: "The integrity event sequence is duplicated.",
        expectedSequence: (existing?.lastSequence || 1) + 1,
      });
    }
    console.error("[AssessmentIntegrity] Could not record event:", error.message);
    return res.status(500).json({ error: "Could not record the integrity event." });
  }
}

export async function getAssessmentIntegrityReport(req, res) {
  const { assessmentType, assessmentId } = req.params;
  if (
    !["DAILY_CHALLENGE", "BATTLE_ROOM"].includes(assessmentType) ||
    !mongoose.Types.ObjectId.isValid(assessmentId)
  ) {
    return res.status(400).json({ error: "A valid assessment type and ID are required." });
  }
  try {
    const sessions = await AssessmentIntegritySession.find({
      assessmentType,
      assessmentId,
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({
      reports: sessions.map((session) => ({
        assessmentType: session.assessmentType,
        assessmentId: session.assessmentId,
        user: session.userId
          ? { id: session.userId._id, name: session.userId.name, email: session.userId.email }
          : null,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        lastEventAt: session.lastEventAt,
        lastSequence: session.lastSequence,
        events: session.events.sort((left, right) => left.sequence - right.sequence),
        ...calculateIntegrityRisk(session.events),
        evidenceOnly: true,
      })),
    });
  } catch (error) {
    console.error("[AssessmentIntegrity] Could not load report:", error.message);
    return res.status(500).json({ error: "Could not load assessment integrity reports." });
  }
}
