// Types for shared/seal.js (plain JS so the Worker, Node and the browser bundles can all import it).
export function qrMatrix(text: string): boolean[][];
export const CODE_ALPHABET: string;
export function normalizeLicenseCode(input: unknown): string | null;
export function sealSvg(options: { url: string; code: string; issuer?: string; id?: string; title?: string }): string;
