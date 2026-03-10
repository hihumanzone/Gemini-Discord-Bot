// source/util.ts
// Utility functions to help with the handling of input.

export const readFile = async (filePath: string): Promise<Uint8Array> => {
	let read
	try {
		const fs = await import('node:fs/promises')
		read = fs.readFile
	} catch {
		read = undefined
	}

	if (!read) {
		const message = `text-extractor: could not import node:fs/promises`
		throw new Error(message)
	}

	return read(filePath)
}

export const fetchUrl = async (url: string): Promise<Uint8Array> => {
	if (typeof fetch === 'undefined') {
		const message = `text-extractor: built-in fetch is undefined`
		throw new Error(message)
	}

	const response = await fetch(url)
	const buffer = await response.arrayBuffer()
	return new Uint8Array(buffer)
}
