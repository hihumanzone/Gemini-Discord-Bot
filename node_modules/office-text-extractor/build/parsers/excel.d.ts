import type { TextExtractionMethod } from '../lib.js';
export declare class ExcelExtractor implements TextExtractionMethod {
    /**
     * The type(s) of input acceptable to this method.
     */
    mimes: string[];
    /**
     * Extract text from a Excel file if possible.
     *
     * @param payload The input and its type.
     * @returns The text extracted from the input.
     */
    apply: (input: Uint8Array) => Promise<string>;
}
