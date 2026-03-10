// source/index.ts
// This file contains the public API for the library.
import { TextExtractor } from './lib.js';
import { PdfExtractor } from './parsers/pdf.js';
import { DocExtractor } from './parsers/doc.js';
import { PptExtractor } from './parsers/ppt.js';
import { ExcelExtractor } from './parsers/excel.js';
/**
 * Create and returns a text extractor instance with the default extraction
 * methods.
 */
export const getTextExtractor = () => {
    const textExtractor = new TextExtractor();
    const methods = [
        new PdfExtractor(),
        new DocExtractor(),
        new PptExtractor(),
        new ExcelExtractor(),
    ];
    methods.map((method) => textExtractor.addMethod(method));
    return textExtractor;
};
