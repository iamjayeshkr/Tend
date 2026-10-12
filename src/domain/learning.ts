import type { DailyQuestion, ProtocolData, QuizAttempt, QuizCategory, QuizQuestion } from '../protocolTypes';
import { identifier, num, str } from './validation';

const RESEARCH_PROMPTS: Array<[string, string]> = [
  ['Science', 'Why does the sky appear blue, and why does it often look red at sunset?'],
  ['History', 'What made the Indian Constitution a significant change in how the country was governed?'],
  ['Technology', 'What happens between typing a website address and seeing its page?'],
  ['Geography', 'How do monsoon winds change direction, and why does that matter for India?'],
  ['Economics', 'What is inflation, and why can prices rise even when people buy less?'],
  ['Defence', 'How do logistics influence the outcome of a military operation?'],
  ['Reasoning', 'How can a correlation exist without one event causing the other?'],
  ['Science', 'What is the difference between mass and weight? Explain using the Moon.'],
  ['Software', 'When would a queue solve a problem better than a stack?'],
  ['History', 'Which factors contributed to the growth of the Indian independence movement?'],
  ['Environment', 'How does groundwater recharge, and what can prevent it?'],
  ['Citizenship', 'How do Fundamental Rights and Directive Principles serve different purposes?'],
  ['Technology', 'Why is a password hash different from encrypted text?'],
  ['Science', 'Why does regular sleep support memory and learning?'],
  ['Geography', 'Why do some regions lie in a rain shadow?'],
  ['Economics', 'How do opportunity costs affect an everyday choice you make?'],
  ['Defence', 'What are the different roles of the Army, Navy and Air Force in joint operations?'],
  ['Software', 'How can you recognize and resolve a race condition?'],
  ['Reasoning', 'What makes a source credible? Compare two sources on one claim.'],
  ['Current affairs', 'Choose one current national event. What happened, which sources agree, and what remains uncertain?'],
  ['Reflection', 'Which belief changed during these 21 days, and what evidence changed it?'],
];

export function researchQuestion(protocolId: string, day: number, date: string): DailyQuestion {
  const [topic, question] = RESEARCH_PROMPTS[(day - 1) % RESEARCH_PROMPTS.length];
  return { id: identifier(), protocolId, protocolDay: day, date, question, topic, answer: '' };
}

// Static recall items are foundational practice, not a comprehensive CDS exam.
const BANKS: Record<'english' | 'general-studies' | 'programming', Array<[string, string[], number, string]>> = {
  english: [
    ['Choose the correctly punctuated sentence.', ['Its raining.', 'It’s raining.', 'Its’ raining.'], 1, '“It’s” is the contraction of “it is”.'],
    ['Choose the synonym of “concise”.', ['Brief', 'Careless', 'Complicated'], 0, 'Concise means expressing something clearly in few words.'],
    ['Choose the correct sentence.', ['She have two books.', 'She has two books.', 'She having two books.'], 1, 'The singular subject “she” takes “has”.'],
    ['Choose the antonym of “scarce”.', ['Rare', 'Limited', 'Abundant'], 2, 'Abundant means plentiful, the opposite of scarce.'],
    ['Which word is an adverb in “He spoke softly”?', ['He', 'spoke', 'softly'], 2, '“Softly” describes how he spoke.'],
    ['Choose the correct past tense of “go”.', ['Goed', 'Went', 'Gone'], 1, '“Went” is the simple past; “gone” is the past participle.'],
    ['Choose the correct comparative form.', ['More better', 'Gooder', 'Better'], 2, 'The comparative of “good” is “better”.'],
    ['Complete: Neither answer ___ correct.', ['are', 'is', 'were'], 1, '“Neither answer” takes a singular verb.'],
    ['Choose the correctly spelled word.', ['Separate', 'Seperate', 'Separete'], 0, 'Separate is spelled with “a” after “p”.'],
    ['Choose the passive form of “The team completed the task.”', ['The task completed the team.', 'The task was completed by the team.', 'The task is completing.'], 1, 'The object becomes the subject in the passive construction.'],
  ],
  'general-studies': [
    ['Which gas makes up most of Earth’s atmosphere?', ['Oxygen', 'Nitrogen', 'Carbon dioxide'], 1, 'Nitrogen is about 78% of the dry atmosphere.'],
    ['What is the SI unit of electric current?', ['Volt', 'Ohm', 'Ampere'], 2, 'The ampere is the SI base unit of electric current.'],
    ['Which process lets green plants convert light into chemical energy?', ['Photosynthesis', 'Condensation', 'Evaporation'], 0, 'Photosynthesis uses light energy to produce sugars.'],
    ['What causes day and night on Earth?', ['Earth’s rotation', 'The Moon’s orbit', 'Changes in Earth’s distance from the Sun'], 0, 'Earth rotates, taking a location into and out of sunlight.'],
    ['At standard atmospheric pressure, water boils at approximately…', ['0 °C', '50 °C', '100 °C'], 2, 'The boiling point is approximately 100 °C at one atmosphere.'],
    ['Which layer lies directly below Earth’s crust?', ['Mantle', 'Outer core', 'Inner core'], 0, 'The mantle lies below the crust and above the core.'],
    ['Which instrument measures atmospheric pressure?', ['Thermometer', 'Barometer', 'Ammeter'], 1, 'A barometer measures atmospheric pressure.'],
    ['What does a light-year measure?', ['Time', 'Distance', 'Brightness'], 1, 'A light-year is the distance light travels in one year.'],
    ['Which blood cells primarily carry oxygen?', ['Red blood cells', 'Platelets', 'White blood cells'], 0, 'Haemoglobin in red blood cells carries oxygen.'],
    ['A substance with pH below 7 is usually…', ['Acidic', 'Neutral', 'Alkaline'], 0, 'On the usual aqueous pH scale, values below 7 are acidic.'],
  ],
  programming: [
    ['What does a stack remove first?', ['The earliest item added', 'The most recent item added', 'A random item'], 1, 'A stack uses last in, first out.'],
    ['What does a queue remove first?', ['The earliest item added', 'The most recent item added', 'The largest item'], 0, 'A queue uses first in, first out.'],
    ['Which JavaScript comparison checks value and type without coercion?', ['=', '==', '==='], 2, 'Strict equality uses ===.'],
    ['What should a UI display when a network request fails?', ['Only a blank area', 'A clear error and suitable retry action', 'A fabricated success'], 1, 'An explicit error state preserves truthful feedback and recovery.'],
    ['Which operation mutates an existing JavaScript array?', ['map', 'filter', 'push'], 2, 'push modifies the array; map and filter return new arrays.'],
    ['What is the purpose of a React key in a list?', ['Help identify items between renders', 'Encrypt the list', 'Fetch data'], 0, 'Stable keys help React match list items when they change.'],
    ['What does HTTP 404 usually indicate?', ['Successful creation', 'Requested resource not found', 'Authentication accepted'], 1, '404 is the Not Found status.'],
    ['What is a unit test intended to check?', ['A small isolated behavior', 'Only visual color', 'Only network speed'], 0, 'A unit test verifies a focused behavior with controlled inputs.'],
    ['What does a Promise represent?', ['Only an already completed string', 'An eventual completion or failure', 'A CSS selector'], 1, 'Promises represent the eventual outcome of an asynchronous operation.'],
    ['What is a race condition?', ['An output that depends on timing of competing operations', 'A syntax error', 'A slow loop'], 0, 'Unsynchronized operations can produce timing-dependent results.'],
  ],
};

function seedNumber(seed: string): number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
function randomFrom(seed: string) {
  let value = seedNumber(seed);
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function generateQuiz(category: QuizCategory, seed: string, count = 10): QuizQuestion[] {
  num(count, 'question count', 1, 10, true);
  const random = randomFrom(seed);
  if (category === 'arithmetic' || category === 'percentages') return Array.from({ length: count }, (_, i) => {
    const a = 12 + Math.floor(random() * 75), b = 3 + Math.floor(random() * 17);
    const percentage = [5, 10, 15, 20, 25, 30, 40, 50][Math.floor(random() * 8)], base = 20 * (2 + Math.floor(random() * 24));
    const mode = i % 3;
    const answer = category === 'percentages' ? percentage * base / 100 : mode === 0 ? a + b : mode === 1 ? a - b : b * (2 + i);
    const prompt = category === 'percentages' ? `What is ${percentage}% of ${base}?` : mode === 0 ? `${a} + ${b} = ?` : mode === 1 ? `${a} − ${b} = ?` : `${b} × ${2 + i} = ?`;
    return { id: `${seed}-${i}`, prompt, answer: String(answer), explanation: category === 'percentages' ? `${base} × ${percentage} ÷ 100 = ${answer}.` : `The result is ${answer}.` };
  });
  const bank = [...BANKS[category]].map(item => ({ item, order: random() })).sort((a, b) => a.order - b.order).map(({ item }) => item);
  return bank.slice(0, count).map(([prompt, options, answer, explanation], i) => ({ id: `${seed}-${i}`, prompt, options, answer: options[answer], explanation }));
}

export function startQuiz(data: ProtocolData, category: QuizCategory, options: { missionId?: string; kind?: QuizAttempt['kind']; count?: number; now?: number } = {}): ProtocolData {
  const now = options.now ?? Date.now(), id = identifier();
  const mission = options.missionId ? data.missions.find(item => item.id === options.missionId) : undefined;
  if (options.missionId && !mission) throw new Error('Mission not found.');
  if (mission && (now < mission.scheduledAt || now > mission.deadline)) throw new Error('Begin this assessment within the mission window.');
  const questions = generateQuiz(category, id, options.count ?? 10);
  const attempt: QuizAttempt = { id, ...(mission ? { missionId: mission.id } : {}), category, kind: options.kind ?? (mission ? 'MASTERY' : 'BRAIN_DRILL'), createdAt: now, questions, answers: {}, correct: 0, total: questions.length, passPercent: mission?.proofPolicy.quizPassPercent ?? 80 };
  return { ...data, quizzes: [...data.quizzes, attempt] };
}

export function answerQuiz(data: ProtocolData, quizId: string, questionId: string, answer: string): ProtocolData {
  const quiz = data.quizzes.find(item => item.id === quizId);
  if (!quiz || quiz.finishedAt !== undefined) throw new Error('This assessment is not accepting answers.');
  const question = quiz.questions.find(item => item.id === questionId);
  if (!question) throw new Error('Question not found.');
  str(answer, 'answer', 500, false);
  return { ...data, quizzes: data.quizzes.map(item => item.id === quizId ? { ...item, answers: { ...item.answers, [questionId]: answer } } : item) };
}

export function quizScore(quiz: Pick<QuizAttempt, 'questions' | 'answers'>): number {
  return quiz.questions.filter(question => {
    const answer = quiz.answers[question.id]?.trim();
    if (!answer) return false;
    return /^-?\d+(\.\d+)?$/.test(question.answer) ? /^-?\d+(\.\d+)?$/.test(answer) && Number(answer) === Number(question.answer) : answer.toLocaleLowerCase() === question.answer.trim().toLocaleLowerCase();
  }).length;
}

export function finishQuiz(data: ProtocolData, quizId: string, now = Date.now()): ProtocolData {
  const quiz = data.quizzes.find(item => item.id === quizId);
  if (!quiz || quiz.finishedAt !== undefined) throw new Error('This assessment is already finished or unavailable.');
  if (now < quiz.createdAt) throw new Error('Assessment completion cannot precede its start.');
  if (quiz.questions.some(question => !quiz.answers[question.id]?.trim())) throw new Error('Answer each question before submitting.');
  return { ...data, quizzes: data.quizzes.map(item => item.id === quizId ? { ...item, finishedAt: now, correct: quizScore(item) } : item) };
}

export function saveResearchAnswer(data: ProtocolData, questionId: string, answer: string, now = Date.now(), notebookPageId?: string): ProtocolData {
  str(answer, 'research answer', 20_000);
  if (!data.dailyQuestions.some(question => question.id === questionId)) throw new Error('Question not found.');
  return { ...data, dailyQuestions: data.dailyQuestions.map(question => question.id === questionId ? { ...question, answer, answeredAt: now, recallDueAt: now + 3 * 86400000, ...(notebookPageId ? { notebookPageId } : {}) } : question) };
}

export function recallQuestions(data: ProtocolData, now = Date.now()): DailyQuestion[] {
  return data.dailyQuestions.filter(question => question.answer.trim() && question.recallDueAt !== undefined && question.recallDueAt <= now).sort((a, b) => a.recallDueAt! - b.recallDueAt!);
}
