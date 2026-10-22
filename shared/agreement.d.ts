// Types for shared/agreement.js (plain JS so the Worker, Node and the portal bundle can all import it).
export interface AgreementDefaults {
  legalName: string; tradingName: string; address: string; city: string; email: string;
  advancePercent: number; cancelStartedPercent: number; cancelDraftPercent: number; revisions: number; revisionFee: string;
  paymentDays: number; inactivityDays: number; paymentDetails: string; portfolioUse: boolean; extraTerms: string;
}
export interface AgreementProject {
  clientCompany: string; clientAddress: string; clientPhone: string; scope: string; deliverables: string; timeline: string; startDate: string;
  fee: number; currency: 'INR' | 'USD'; taxNote: string; balanceTerms: string; rights: 'full' | 'license'; usage: string; confidential: boolean;
  paymentLink: string; notes: string; advancePercent: number; cancelStartedPercent: number; cancelDraftPercent: number; revisions: number;
}
export interface AgreementDoc {
  number: string; title: string; date: string; parties: { creator: string[]; client: string[] }; summary: [string, string][];
  sections: { heading: string; paras: string[] }[];
  figures: { fee: number; currency: string; advance: number; advancePercent: number; started: number; draft: number };
}
export const AGREEMENT_DEFAULTS: AgreementDefaults;
export const AGREEMENT_RANGES: Record<string, [number, number]>;
export const PROJECT_DEFAULTS: Omit<AgreementProject, 'advancePercent' | 'cancelStartedPercent' | 'cancelDraftPercent' | 'revisions'>;
export function cleanDefaults(input?: Partial<AgreementDefaults>): AgreementDefaults;
export function cleanProject(input?: Partial<AgreementProject>, defaults?: AgreementDefaults): AgreementProject;
export function money(amount: number, currency: string): string;
export function buildAgreement(input: { number: string; title: string; clientName: string; clientEmail: string; date: string; project: Partial<AgreementProject>; defaults: Partial<AgreementDefaults>; ownerEmail?: string }): AgreementDoc;
export function agreementText(doc: AgreementDoc): string;
