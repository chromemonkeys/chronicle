export type DocumentStatus = "Draft" | "In review" | "Ready for approval";
export type ThreadOutcome = "Accepted" | "Rejected" | "Deferred";

export type MockDocument = {
  id: string;
  title: string;
  status: DocumentStatus;
  updatedBy: string;
  openThreads: number;
};

export type MockThread = {
  id: string;
  anchor: string;
  type: "Technical" | "Security" | "Commercial" | "Editorial";
  outcome: ThreadOutcome;
  message: string;
};

export const mockDocuments: MockDocument[] = [
  {
    id: "adr-142",
    title: "ADR-142: Event Retention Model",
    status: "In review",
    updatedBy: "Avery",
    openThreads: 3
  },
  {
    id: "rfc-auth",
    title: "RFC: OAuth and Magic Link Session Flow",
    status: "Draft",
    updatedBy: "Sam",
    openThreads: 5
  },
  {
    id: "policy-sec",
    title: "Security Policy Update",
    status: "Ready for approval",
    updatedBy: "Jordan",
    openThreads: 1
  }
];

export const mockEditorBlocks = [
  "Chronicle treats deliberation as first-class data, not disposable comments.",
  "Approval chains are hard gates: publication is blocked until required sign-offs are complete.",
  "Decision logs remain queryable and permanent, including accepted, rejected, and deferred outcomes."
];

export const mockThreads: MockThread[] = [
  {
    id: "t-1",
    anchor: "Paragraph 2",
    type: "Security",
    outcome: "Deferred",
    message: "Add DDoS mitigation language before approval."
  },
  {
    id: "t-2",
    anchor: "Heading 3",
    type: "Commercial",
    outcome: "Accepted",
    message: "Include explicit self-hosting cost framing."
  },
  {
    id: "t-3",
    anchor: "Paragraph 5",
    type: "Editorial",
    outcome: "Rejected",
    message: "Avoid over-specific SDK implementation detail in policy."
  }
];
