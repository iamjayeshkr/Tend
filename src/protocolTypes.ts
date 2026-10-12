export const MISSION_STATUSES = ['SCHEDULED', 'DUE', 'ACTIVE', 'AWAITING_PROOF', 'VERIFYING', 'VERIFIED', 'PARTIAL', 'REJECTED', 'MISSED', 'RECOVERY_REQUIRED'] as const;
export type MissionStatus = typeof MISSION_STATUSES[number];
export const EVIDENCE_TYPES = ['GITHUB', 'STRAVA', 'IMAGE', 'QUIZ', 'WRITTEN_RESPONSE', 'FOCUS_SESSION', 'WORKOUT_LOG', 'ACTIVITY_LOG', 'DEVICE_SIGNAL', 'MANUAL_REVIEW'] as const;
export type EvidenceType = typeof EVIDENCE_TYPES[number];
export const MISSION_CATEGORIES = ['PHYSICAL', 'SOFTWARE', 'FITNESS', 'CDS', 'LEARNING', 'KNOWLEDGE', 'DEBRIEF', 'CUSTOM'] as const;
export type MissionCategory = typeof MISSION_CATEGORIES[number];
export type VerificationOutcome = 'PASS' | 'PARTIAL' | 'FAIL' | 'NEEDS_REVIEW';
export type EvidenceStrength = 'DIRECT_SOURCE' | 'DEVICE_RECORD' | 'AI_REVIEW' | 'SELF_REPORT';
export type QuizCategory = 'arithmetic' | 'percentages' | 'english' | 'general-studies' | 'programming';

export interface ProofPolicy {
  required: true;
  types: EvidenceType[];
  requireAll: boolean;
  requirement: string;
  minimumMinutes?: number;
  minimumKm?: number;
  minimumSets?: number;
  minimumWords?: number;
  quizCategory?: QuizCategory;
  quizPassPercent?: number;
  expectedRepository?: string;
  challengeRequired?: boolean;
  allowReuse?: boolean;
}
export interface MissionTemplate {
  id: string; title: string; description: string; category: MissionCategory;
  time: string; deadlineTime: string; expectedMinutes: number; priority: 1 | 2 | 3;
  proofPolicy: ProofPolicy;
}
export interface StrictPolicy {
  enabled: boolean; packages: string[];
  unlockPolicy: 'ALL_PRIORITY' | 'ALL_MISSIONS';
  allowRecovery: boolean; allowanceMinutes: number;
}
export interface Protocol {
  id: string; objective: string; startDate: string; days: number; createdAt: number;
  templates: MissionTemplate[]; status: 'ACTIVE' | 'COMPLETED' | 'STOPPED';
  strict: StrictPolicy; officerTheme: boolean;
}
export interface ProtocolInput {
  objective: string; startDate: string; days?: number; templates: MissionTemplate[];
  strict?: Partial<StrictPolicy>; officerTheme?: boolean;
}
export interface Mission {
  id: string; protocolId: string; templateId: string; protocolDay: number;
  title: string; description: string; category: MissionCategory;
  scheduledAt: number; deadline: number; expectedMinutes: number; priority: 1 | 2 | 3;
  proofPolicy: ProofPolicy; status: MissionStatus; createdAt: number;
  startedAt?: number; finishedAt?: number; evidenceSubmittedAt?: number; verifiedAt?: number;
  linkedFocusSessions: string[]; evidenceIds: string[];
  challengeCode: string; failureReason?: string; recoveryActionId?: string; recoveryFor?: string;
}
export interface VerificationResult {
  outcome: VerificationOutcome; provider: string; confidence: number; reason: string;
  strength: EvidenceStrength; metrics?: Record<string, number>; sourceId?: string;
}
export interface EvidenceInput {
  type: EvidenceType; source: string; capturedAt: number;
  text?: string; referenceIds?: string[]; localHash?: string;
  sourceMetadata?: Record<string, string | number | boolean>;
  imageDataUrl?: string;
}
export interface Evidence extends EvidenceInput {
  id: string; missionId: string; submittedAt: number;
  verificationStatus: 'PENDING' | VerificationOutcome;
  result?: VerificationResult;
}
export interface QuizQuestion {
  id: string; prompt: string; options?: string[]; answer: string; explanation: string;
}
export interface QuizAttempt {
  id: string; missionId?: string; category: QuizCategory; kind: 'MASTERY' | 'BRAIN_DRILL' | 'RECALL';
  createdAt: number; finishedAt?: number; questions: QuizQuestion[]; answers: Record<string, string>;
  correct: number; total: number; passPercent: number;
}
export interface DailyQuestion {
  id: string; protocolId: string; protocolDay: number; date: string;
  question: string; topic: string; answer: string; notebookPageId?: string; answeredAt?: number;
  recallDueAt?: number;
}
export interface RecoveryAction {
  id: string; missionId: string; recoveryMissionId: string; reason: string; correctiveAction: string; createdAt: number;
}
export interface BypassEvent {
  id: string; at: number; protocolId: string; packages: string[]; reason: string;
  allowanceMinutes: number; missionStates: Record<string, MissionStatus>;
}
export interface ProtocolData {
  schemaVersion: 1; protocols: Protocol[]; missions: Mission[]; evidence: Evidence[];
  quizzes: QuizAttempt[]; dailyQuestions: DailyQuestion[]; recovery: RecoveryAction[]; bypassEvents: BypassEvent[];
}
