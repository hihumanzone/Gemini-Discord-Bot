// source/lib.ts
// The source code for the library.

import encoding from 'text-encoding'
import { fileTypeFromBuffer as getFileType } from 'file-type'
import { readFile, fetchUrl } from './util.js'

/**
 * The way to get the contents of the input file.
 */
export type InputType = 'buffer' | 'file' | 'url'
export type ExtractionPayload = { type: InputType; input: string | Uint8Array }

/**
 * A method of text extraction.
 */
export type TextExtractionMethod = {
	mimes: string[]
	apply: (input: Uint8Array) => Promise<string>
}

/**
 * The text extractor class.
 */
export class TextExtractor {
	// The list of methods supported by this instance of the extractor.
	methods: TextExtractionMethod[] = []

	// An encoder-decoder pair for buffers and strings.
	encoder = new encoding.TextEncoder()
	decoder = new encoding.TextDecoder()

	/**
	 * Registers a new method to this instance of the extractor.
	 *
	 * @param method The method of text extraction to add.
	 * @returns The current instance, for method chaining.
	 */
	addMethod = (method: TextExtractionMethod): this => {
		this.methods.push(method)
		return this
	}

	/**
	 * Extracts text from the given input.
	 *
	 * @param payload The input and type of input to extract text from.
	 * @returns The extracted text as a simple string.
	 */
	extractText = async ({ input, type }: ExtractionPayload): Promise<string> => {
		// Turn the input into a buffer containing the file's contents.
		let preparedInput: Uint8Array
		if (typeof input === 'string') {
			if (type === 'file') preparedInput = await readFile(input)
			else if (type === 'url') preparedInput = await fetchUrl(input)
			else preparedInput = this.encoder.encode(input)
		} else {
			preparedInput = input
		}

		// Check the mime type of the file. If there is no mime type, it's most
		// likely a text or CSV file. 
		const mimeDetails = await getFileType(preparedInput)
		if (!mimeDetails) return this.decoder.decode(preparedInput)

		// Find the extractor that can handle that mime type, and call it.
		const extractor = this.methods.findLast((method) =>
			method.mimes.includes(mimeDetails.mime),
		)
		if (!extractor?.apply) {
			const message = `text-extractor: could not find a method to handle ${mimeDetails.mime}`
			throw new Error(message)
		}

		return extractor.apply(preparedInput)
	}
}
