import type { ObjectiveRecord, PackRecord, QuestionRecord, SourceRecord } from "../accounts/store.ts";

export const SAMPLE_PACK_ID = "pack-sample-notice";
export const SAMPLE_OWNER_ID = "lessoncraft-sample";

export const samplePack: PackRecord = {
  id: SAMPLE_PACK_ID,
  ownerId: SAMPLE_OWNER_ID,
  title: "LessonCraft sample: reading a short notice",
  subject: "Workplace communication",
  level: "Introductory",
  language: "en",
  countryCode: "",
  curriculum: "",
  createdAt: "2026-10-26T00:00:00.000Z",
  sharedWith: [],
  published: true,
};

export const sampleObjectives: ObjectiveRecord[] = [
  {
    id: "obj-sample-action",
    packId: SAMPLE_PACK_ID,
    text: "Identify the action a short notice asks the reader to take.",
    reviewed: true,
  },
  {
    id: "obj-sample-limit",
    packId: SAMPLE_PACK_ID,
    text: "Say what the notice does not decide.",
    reviewed: true,
  },
];

export const sampleSource: SourceRecord = {
  id: "src-sample-notice",
  packId: SAMPLE_PACK_ID,
  ownerId: SAMPLE_OWNER_ID,
  creator: "LessonCraft by Empowered Nexus",
  title: "Original sample notice",
  url: "",
  license: "Original LessonCraft sample text. Not an official curriculum, syllabus, or exam.",
  permissionNote: "Written for this demo by LessonCraft.",
  attribution: "LessonCraft by Empowered Nexus. Original sample, not an official exam question.",
  subject: "Workplace communication",
  level: "Introductory",
  topic: "Reading a notice",
  language: "en",
  reviewStatus: "approved",
  excerpt: "Wednesday team check-in. The Monday meeting is now on Wednesday at the same time. This notice does not change anyone's job.",
  privateUse: true,
  classShare: false,
  publish: true,
  training: false,
  uploadedByRole: "teacher",
};

export const sampleQuestions: QuestionRecord[] = [
  {
    id: "q-sample-practice",
    packId: SAMPLE_PACK_ID,
    objectiveId: "obj-sample-action",
    prompt: "The notice says the Monday meeting is now on Wednesday. What should the reader do?",
    requiredIdeas: ["wednesday"],
    solution: "The reader should plan for Wednesday instead of Monday. This is a reviewed sample answer, not a grade.",
    sourceId: sampleSource.id,
    kind: "practice",
  },
  {
    id: "q-sample-transfer",
    packId: SAMPLE_PACK_ID,
    objectiveId: "obj-sample-limit",
    prompt: "The notice moves the meeting to Wednesday. What does the notice say it does not change?",
    requiredIdeas: ["job"],
    solution: "The notice does not change anyone's job. This is a reviewed sample answer, not a grade.",
    sourceId: sampleSource.id,
    kind: "transfer",
  },
];

export function isSamplePack(packId: string): boolean {
  return packId === SAMPLE_PACK_ID;
}
