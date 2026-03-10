/**
 * Error thrown when the parsed data is not a valid PDF document.
 *
 * Use this exception to signal that the input cannot be interpreted as a PDF
 * (corrupt file, invalid header, etc.).
 *
 * @public
 */
export declare class InvalidPDFException extends Error {
    /**
     * Create a new InvalidPDFException.
     * @param message - Optional error message.
     * @param cause - Optional underlying cause (preserved on modern runtimes).
     */
    constructor(message?: string, cause?: unknown);
}
/**
 * Error indicating a PDF file requires a password or the provided password is incorrect.
 *
 * @public
 */
export declare class PasswordException extends Error {
    /**
     * Create a new PasswordException.
     * @param message - Optional error message.
     * @param cause - Optional underlying cause.
     */
    constructor(message?: string, cause?: unknown);
}
/**
 * Error thrown when the PDF structure/contents are malformed and cannot be parsed.
 *
 * This is raised for low-level format problems detected while reading PDF objects.
 * Errors caused during parsing PDF data.
 *
 * @public
 */
export declare class FormatError extends Error {
    /**
     * Create a new FormatError.
     * @param message - Optional message describing the format problem.
     * @param cause - Optional underlying cause.
     */
    constructor(message?: string, cause?: unknown);
}
/**
 * Generic wrapper for errors where the library cannot classify the cause.
 *
 * The `details` property may contain additional information provided by the
 * underlying PDF library.
 *
 * @public
 */
export declare class UnknownErrorException extends Error {
    /**
     * Create a new UnknownErrorException.
     * @param message - Optional error message.
     * @param details - Optional additional details from the PDF library.
     * @param cause - Optional underlying cause.
     */
    constructor(message?: string, details?: unknown, cause?: unknown);
}
/**
 * Represents an HTTP/network response error encountered while fetching PDF data.
 *
 * The `status` and `missing` properties mirror values that may be provided
 * by the underlying PDF library's network layer.
 *
 * @public
 */
export declare class ResponseException extends Error {
    /**
     * Create a new ResponseException.
     * @param message - Optional error message.
     * @param status - Optional numeric HTTP/status code.
     * @param missing - Optional field describing missing resources.
     * @param cause - Optional underlying cause.
     */
    constructor(message?: string, status?: number, missing?: unknown, cause?: unknown);
}
/**
 * Error used to indicate that an operation was aborted (for example by an AbortSignal).
 *
 * @public
 */
export declare class AbortException extends Error {
    /**
     * Create a new AbortException.
     * @param message - Optional error message.
     * @param cause - Optional underlying cause.
     */
    constructor(message?: string, cause?: unknown);
}
/**
 * Normalize arbitrary thrown values into an Error instance used by the library.
 *
 * Known Error instances with specific names are mapped to the library's
 * typed exceptions in order to preserve type information and any additional
 * fields (for example `details`, `status`, etc.). If the value is not an
 * Error it is converted to a generic Error containing the stringified value.
 *
 * @public
 * @param error - The thrown value to normalize.
 * @returns An Error instance representing the provided value.
 */
export declare function getException(error: unknown): Error;
//# sourceMappingURL=Exception.d.ts.map