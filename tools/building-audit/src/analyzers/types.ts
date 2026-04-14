import type { AnalyzedFile } from '../types/index.js';

/**
 * The seam for future language support.
 * v1 ships only the TypeScript/JavaScript analyzer.
 * The interface exists so future languages plug in without changing checks.
 */
export interface LanguageAnalyzer {
  language: string;
  extensions: string[];
  parseFile(filePath: string, content: string): AnalyzedFile;
}
