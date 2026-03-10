// source/parsers/pdf.ts
// The text extracter for PDF files.

import { PDFParse } from 'pdf-parse'
import type { TextExtractionMethod } from '../lib.js'

export class PdfExtractor implements TextExtractionMethod {
	/**
	 * The type(s) of input acceptable to this method.
	 */
	mimes = ['application/pdf']

	/**
	 * Extract text from a PDF file if possible.
	 *
	 * @param payload The input and its type.
	 * @returns The text extracted from the input.
	 */
	apply = async (input: Uint8Array): Promise<string> => {
		// Create a new parser and run it on the given input buffer.
		const parser = new PDFParse({ data: input })
		const result = await parser.getText({ parseHyperlinks: true })

		// Clean up the parser and return the text.
		await parser.destroy()
		return result.text
	}
}
