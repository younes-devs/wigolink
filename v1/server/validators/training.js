const TRAINING_ANSWERS = {
  q1: 'b',
  q2: 'c',
  q3: 'a',
};

export function invalidTrainingAnswers(answers) {
  return Object.entries(TRAINING_ANSWERS)
    .filter(([question, expected]) => answers[question] !== expected)
    .map(([question]) => question);
}
