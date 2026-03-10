// source/parsers/excel.ts
// The text extracter for Excel files.

import Xlsx, { utils as sheetUtils } from 'xlsx'
import { dump as convertToYaml } from 'js-yaml'
import type { TextExtractionMethod } from '../lib.js'

const parseExcelFile = Xlsx.read
const convertSheetToJson = sheetUtils.sheet_to_json

export class ExcelExtractor implements TextExtractionMethod {
	/**
	 * The type(s) of input acceptable to this method.
	 */
	mimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

	/**
	 * Extract text from a Excel file if possible.
	 *
	 * @param payload The input and its type.
	 * @returns The text extracted from the input.
	 */
	apply = async (input: Uint8Array): Promise<string> => {
		// Read the contents of the Excel file and convert them to JSON.
		const workbook = parseExcelFile(input, { type: 'buffer' })

		// Get the names of all the sheets, loop through the sheets and return
		// nicely formatted text.
		const sheets = workbook.SheetNames
		let formattedText = ''
		for (const sheet of sheets) {
			// Add the sheet separator to indicate a new sheet has started.
			formattedText += '===\n'

			const sheetJson = convertSheetToJson(workbook.Sheets[sheet])
			for (const row of sheetJson) {
				formattedText += '---\n'
				formattedText += convertToYaml(row)
					// If the column header is empty, the YAML converter replaces it with '__EMPTY'.
					// Replace that with just underscore + the column number instead.
					.replaceAll(/__EMPTY*:/g, ':')
					.replaceAll(/__EMPTY_\d?:/g, ':')
			}
		}

		return formattedText
	}
}
