/**
 * Result information from getHeader.
 * @public
 */
export interface HeaderResult {
    ok: boolean;
    status?: number;
    size?: number;
    magic: boolean | null;
    headers?: Record<string, string>;
    error?: Error;
}
/**
 * Perform an HTTP HEAD request to retrieve the file size and verify existence;
 * when `check` is true, fetch a small range and inspect the magic number to confirm the URL points to a valid PDF.
 * If the server does not support range requests, `isPdf` will be set to `false`.
 * @param url - The URL of the PDF file to check. Can be a string or URL object.
 * @param check - When `true`, download a small byte range (first 4 bytes) to validate the file signature by checking for '%PDF' magic bytes. Default: `false`.
 * @returns - A Promise that resolves to a HeaderResult object containing the response status, size, headers, and PDF validation result.
 * @public
 */
export declare function getHeader(url: string | URL, check?: boolean): Promise<HeaderResult>;
//# sourceMappingURL=getHeader.d.ts.map