export function normalizeLearningAnswer(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function evaluateLearningAssessment(questions, answers, passingScorePercent = 70) {
  const validQuestions = Array.isArray(questions) ? questions : [];
  if (!validQuestions.length || !answers || typeof answers !== "object") {
    return { passed: false, scorePercent: 0, results: [] };
  }

  const results = validQuestions.map((question) => {
    const submitted = normalizeLearningAnswer(answers[String(question._id)]);
    const accepted = [
      question.expectedAnswer,
      ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []),
    ].map(normalizeLearningAnswer).filter(Boolean);
    return { questionId: String(question._id), correct: accepted.includes(submitted) };
  });
  const scorePercent = Math.round(
    (results.filter((result) => result.correct).length / results.length) * 100,
  );
  return {
    passed: scorePercent >= passingScorePercent,
    scorePercent,
    results,
  };
}

export function meetsModuleCompletionRequirements(module, progress) {
  const requirements = module.completionRequirements || {};
  const completedTopicIds = new Set((progress.completedTopicIds || []).map(String));
  const topics = module.topics || [];
  const exerciseCount = (progress.completedExerciseIds || []).length;
  return (
    topics.length > 0 &&
    topics.every((topic) => completedTopicIds.has(String(topic._id))) &&
    completedTopicIds.size >= Number(requirements.minCompletedTopics || 0) &&
    exerciseCount >= Number(requirements.requiredExercises || 0) &&
    (!requirements.requireAssessment || progress.assessmentPassed === true)
  );
}
