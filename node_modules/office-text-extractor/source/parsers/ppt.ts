// source/parsers/ppt.ts
// The text extracter for MS PowerPoint files.

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { unzip } from 'fflate'
import { parseStringPromise as xmlToJson } from 'xml2js'
import encoding from 'text-encoding'
import type { TextExtractionMethod } from '../lib.js'

export class PptExtractor implements TextExtractionMethod {
	decoder = new encoding.TextDecoder()

	/**
	 * The type(s) of input acceptable to this method.
	 */
	mimes = [
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	]

	/**
	 * Extract text from a PPT file if possible.
	 *
	 * @param payload The input and its type.
	 * @returns The text extracted from the input.
	 */
	apply = async (input: Uint8Array): Promise<string> => {
		const files = await unzipBuffer(input)
		const slides = []

		for (const file of files) {
			const { buffer } = file.content
			const contents = this.decoder.decode(buffer)

			const slide = await xmlToJson(contents)
			const lines = await parseSlideSection(slide)

			slides.push(lines?.join('\n'))
		}

		const formattedText = slides.join('\n---\n') + '\n'
		return formattedText
	}
}

/**
 * A slide file.
 */
type SlideFile = {
	name: string
	content: Uint8Array
}

/**
 * Unzip a PPT file, and return a list of slides.
 *
 * @param buffer The buffer containing the file.
 * @returns The slide files.
 */
const unzipBuffer = async (input: Uint8Array): Promise<SlideFile[]> => {
	const ppt = (await new Promise((resolve, reject) => {
		unzip(input, (error, result) => {
			if (error) reject(error)
			else resolve(result)
		})
	})) as any

	// Filter out the files that don't contain the text on the slides.
	const files = Object.keys(ppt)
		.filter((name) => /ppt\/slides\/slide\d*.xml/.test(name))
		.map((name) => {
			return { name, content: ppt[name] }
		})

	return files
}

/**
 * Extracts text from a section of the slide, recursively.
 *
 * @param slideSection The section of the slide, converted to JSON from XML.
 * @param collectedText The lines of text parsed from the slide so far.
 *
 * @returns The lines of text on the slide.
 */
const parseSlideSection = async (
	slideSection: any,
	collectedText?: string[],
): Promise<string[] | undefined> => {
	// Keep track of the text being collected.
	const beingCollectedText = collectedText ?? []

	// Parse the section according to what type it is.
	if (Array.isArray(slideSection)) {
		// If it is, loop through the elements of the array.
		for (const element of slideSection) {
			// Collect all the pieces of text from the array.
			if (typeof element === 'string' && element !== '') {
				beingCollectedText.push(element)
			} else {
				// However, if it is an object or another array, call this function
				// again to parse that.
				await parseSlideSection(element, beingCollectedText)
			}
		}

		// Finally, return the collected text.
		return beingCollectedText
	}

	// If the section is an object, loop through its properties.
	if (typeof slideSection === 'object') {
		for (const property of Object.keys(slideSection)) {
			// Get the value of the property.
			const value = slideSection[property]

			// The `pptx` format stores the actual text inside the `a:t` or `_`
			// properties, so extract text from those properties.

			// Check if it is a string or array that contains a string. If it is
			// either, then collect the text content.
			if (typeof value === 'string') {
				if ((property === 'a:t' || property === '_') && value !== '') {
					beingCollectedText.push(value)
				}
			} else if (typeof value[0] === 'string') {
				if ((property === 'a:t' || property === '_') && value[0] !== '') {
					beingCollectedText.push(value[0])
				}
			} else {
				// However, if it is an object or another array, call this function
				// again to parse that.
				await parseSlideSection(value, beingCollectedText)
			}
		}

		// Finally, return the collected text.
		return beingCollectedText
	}
}
