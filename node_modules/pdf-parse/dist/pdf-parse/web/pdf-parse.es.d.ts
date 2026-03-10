import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api.js';
import type { ImageKind } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Metadata } from 'pdfjs-dist/types/src/display/metadata.js';
import type { PDFDataRangeTransport } from 'pdfjs-dist/types/src/display/api.js';
import type { PDFWorker } from 'pdfjs-dist/types/src/display/api.js';
import { VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
 * @public
 * Consolidated date information gathered from different PDF sources.
 * The PDF 'Info' dictionary contains CreationDate / ModDate and
 * the XMP/XAP metadata can contain several timestamps as well. This
 * structure collects those values (if present) as JavaScript Date objects
 * or null when the property exists but cannot be parsed.
 */
export declare type DateNode = {
    CreationDate?: Date | null;
    ModDate?: Date | null;
    XmpCreateDate?: Date | null;
    XmpModifyDate?: Date | null;
    XmpMetadataDate?: Date | null;
    XapCreateDate?: Date | null;
    XapModifyDate?: Date | null;
    XapMetadataDate?: Date | null;
};

/**
 * @public
 * EmbeddedImage
 * - Normalized representation of an embedded image extracted from the PDF.
 * - `data`: Raw image bytes (e.g. PNG/JPEG) as Uint8Array. Use this for file writing or binary processing.
 * - `dataUrl`: Optional data URL (e.g. "data:image/png;base64,...") for directly embedding in <img> src.
 *   Storing both lets consumers choose the most convenient form; consider omitting one to save memory.
 * - `name`: Resource name for the image.
 * - `width` / `height`: Dimensions in pixels.
 * - `kind`: ImageKindValue from indicating the pixel format (e.g. GRAYSCALE_1BPP / RGB_24BPP / RGBA_32BPP).
 */
export declare interface EmbeddedImage {
    data: Uint8Array;
    dataUrl: string;
    name: string;
    width: number;
    height: number;
    kind: ImageKindValue;
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

/**
 * @public
 * ImageKindKey
 * - Represents the keys of the ImageKind enum (e.g. "GRAYSCALE_1BPP", "RGB_24BPP", "RGBA_32BPP").
 */
export declare type ImageKindKey = keyof typeof ImageKind;

/**
 * @public
 * ImageKindValue
 * - Represents the numeric values of the ImageKind enum (e.g. 1, 2, 3).
 */
export declare type ImageKindValue = (typeof ImageKind)[ImageKindKey];

/**
 * @public
 * ImageResult
 * Helper container for extracted images grouped per page.
 */
export declare class ImageResult {
    pages: Array<PageImages>;
    total: number;
    getPageImage(num: number, name: string): EmbeddedImage | null;
    constructor(total: number);
}

/**
 * @public
 * Aggregated information about a PDF document returned by getInfo().
 * The object contains high-level metadata, outline/bookmark structure,
 * per-page extracted hyperlinks and utility helpers for parsing dates.
 */
export declare class InfoResult {
    total: number;
    /**
     * The PDF 'Info' dictionary. Typical fields include title, author, subject,
     * Creator, Producer and Creation/Modification dates. The exact structure is
     * determined by the PDF and as returned by PDF.js.
     */
    info?: any;
    metadata?: Metadata;
    /**
     * An array of document fingerprint strings provided by PDF.js. Useful
     * for caching, de-duplication or identifying a document across runs.
     */
    fingerprints?: Array<string | null>;
    /**
     * Permission flags for the document as returned by PDF.js (or null).
     * These flags indicate capabilities such as printing, copying and
     * other restrictions imposed by the PDF security settings.
     */
    permission?: number[] | null;
    /**
     * Optional document outline (bookmarks). When present this is the
     * hierarchical navigation structure which viewers use for quick access.
     */
    outline?: Array<OutlineNode> | null;
    pages: Array<PageLinkResult>;
    /**
     * Collects dates from different sources (Info dictionary and XMP/XAP metadata)
     * and returns them as a DateNode where available. This helps callers compare
     * and choose the most relevant timestamp (for example a creation date vs XMP date).
     */
    getDateNode(): DateNode;
    /**
     * Try to parse an ISO-8601 date string from XMP/XAP metadata. If the
     * value is falsy or cannot be parsed, undefined is returned to indicate
     * absence or unparsable input.
     */
    private parseISODateString;
    constructor(total: number);
}

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

export declare class Line extends Shape {
    from: Point;
    to: Point;
    direction: LineDirection;
    length: number;
    intersections: Array<Point>;
    gaps: Array<Line>;
    constructor(from: Point, to: Point);
    private init;
    private _valid;
    get valid(): boolean;
    get normalized(): Line;
    addGap(line: Line): void;
    containsPoint(p: Point): boolean;
    addIntersectionPoint(point: Point): void;
    intersection(line: Line): Point | undefined;
    transform(matrix: Array<number>): this;
}

export declare enum LineDirection {
    None = 0,
    Horizontal = 1,
    Vertical = 2
}

export declare class LineStore {
    hLines: Array<Line>;
    vLines: Array<Line>;
    add(line: Line): void;
    addRectangle(rect: Rectangle): void;
    getTableData(): Array<TableData>;
    getTables(): Array<Table>;
    normalize(): void;
    normalizeHorizontal(): void;
    normalizeVertical(): void;
    private fillTable;
    private tryFill;
    private margeHorizontalLines;
    private margeVerticalLines;
}

/**
 * @public
 * LoadParameters
 * PDF loading parameters.
 */
export declare interface LoadParameters extends DocumentInitParameters {
    /**
     * The URL of the PDF.
     * Default: `undefined`.
     */
    url?: string | URL | undefined;
    /**
     * Binary PDF data.
     * Use TypedArrays (e.g., `Uint8Array`) to improve memory usage. If PDF data is BASE64-encoded, use `atob()` to convert it to a binary string first.
     * **NOTE**: If TypedArrays are used, they will generally be transferred to the worker thread, reducing main-thread memory usage but taking ownership of the array.
     * Default: `undefined`.
     */
    data?: string | number[] | ArrayBuffer | TypedArray | undefined;
    /**
     * Basic authentication headers.
     * Default: `undefined`.
     */
    httpHeaders?: Object | undefined;
    /**
     * Indicates whether cross-site Access-Control requests should be made using credentials (e.g., cookies or auth headers).
     * Default: `false`.
     */
    withCredentials?: boolean | undefined;
    /**
     * For decrypting password-protected PDFs.
     * Default: `undefined`.
     */
    password?: string | undefined;
    /**
     * The PDF file length. Used for progress reports and range requests.
     * Default: `undefined`.
     */
    length?: number | undefined;
    /**
     * Allows using a custom range transport implementation.
     * Default: `undefined`.
     */
    range?: PDFDataRangeTransport | undefined;
    /**
     * Maximum number of bytes fetched per range request.
     * Default: `65536` (`2^16`).
     */
    rangeChunkSize?: number | undefined;
    /**
     * The worker used for loading and parsing PDF data.
     * Default: `undefined`.
     */
    worker?: PDFWorker | undefined;
    /**
     * Controls logging level; use constants from `VerbosityLevel`.
     * Default: `undefined`.
     */
    verbosity?: number | undefined;
    /**
     * Base URL of the document, used to resolve relative URLs in annotations and outline items.
     * Default: `undefined`.
     */
    docBaseUrl?: string | undefined;
    /**
     * URL where predefined Adobe CMaps are located. Include trailing slash.
     * Default: `undefined`.
     */
    cMapUrl?: string | undefined;
    /**
     * Specifies if Adobe CMaps are binary-packed.
     * Default: `true`.
     */
    cMapPacked?: boolean | undefined;
    /**
     * Factory for reading built-in CMap files.
     * Default: `{DOMCMapReaderFactory}`.
     */
    CMapReaderFactory?: Object | undefined;
    /**
     * URL where predefined ICC profiles are located. Include trailing slash.
     * Default: `undefined`.
     */
    iccUrl?: string | undefined;
    /**
     * If `true`, non-embedded fonts fall back to system fonts.
     * Default: `true` in browsers, `false` in Node.js (unless `disableFontFace === true`, then always `false`).
     */
    useSystemFonts?: boolean | undefined;
    /**
     * URL for standard font files. Include trailing slash.
     * Default: `undefined`.
     */
    standardFontDataUrl?: string | undefined;
    /**
     * Factory for reading standard font files.
     * Default: `{DOMStandardFontDataFactory}`.
     */
    StandardFontDataFactory?: Object | undefined;
    /**
     * URL for WebAssembly files. Include trailing slash.
     * Default: `undefined`.
     */
    wasmUrl?: string | undefined;
    /**
     * Factory for reading WASM files.
     * Default: `{DOMWasmFactory}`.
     */
    WasmFactory?: Object | undefined;
    /**
     * Enable `fetch()` in worker thread for CMap/font/WASM files. If `true`, factory options are ignored.
     * Default: `true` in browsers, `false` in Node.js.
     */
    useWorkerFetch?: boolean | undefined;
    /**
     * Attempt to use WebAssembly for better performance (e.g., image decoding).
     * Default: `true`.
     */
    useWasm?: boolean | undefined;
    /**
     * Reject promises (e.g., `getTextContent`) on parse errors instead of recovering partially.
     * Default: `false`.
     */
    stopAtErrors?: boolean | undefined;
    /**
     * Max image size in total pixels (`width * height`). Use `-1` for no limit.
     * Default: `-1`.
     */
    maxImageSize?: number | undefined;
    /**
     * Whether evaluating strings as JS is allowed (for PDF function performance).
     * Default: `true`.
     */
    isEvalSupported?: boolean | undefined;
    /**
     * Whether `OffscreenCanvas` can be used in worker.
     * Default: `true` in browsers, `false` in Node.js.
     */
    isOffscreenCanvasSupported?: boolean | undefined;
    /**
     * Whether `ImageDecoder` can be used in worker.
     * Default: `true` in browsers, `false` in Node.js.
     * **NOTE**: Temporarily disabled in Chromium due to bugs:
     * - Crashes with BMP decoder on huge images ([issue 374807001](https://issues.chromium.org/issues/374807001))
     * - Broken JPEGs with custom color profiles ([issue 378869810](https://issues.chromium.org/issues/378869810))
     */
    isImageDecoderSupported?: boolean | undefined;
    /**
     * Used to determine when to resize images (via `OffscreenCanvas`). Use `-1` to use a slower fallback algorithm.
     * Default: `undefined`.
     */
    canvasMaxAreaInBytes?: number | undefined;
    /**
     * Disable `@font-face`/Font Loading API; use built-in glyph renderer instead.
     * Default: `false` in browsers, `true` in Node.js.
     */
    disableFontFace?: boolean | undefined;
    /**
     * Include extra (non-rendering) font properties when exporting font data from worker. Increases memory usage.
     * Default: `false`.
     */
    fontExtraProperties?: boolean | undefined;
    /**
     * Render XFA forms if present.
     * Default: `false`.
     */
    enableXfa?: boolean | undefined;
    /**
     * Explicit document context for creating elements and loading resources. Defaults to current document.
     * Default: `undefined`.
     */
    ownerDocument?: HTMLDocument | undefined;
    /**
     * Disable range requests for PDF loading.
     * Default: `false`.
     */
    disableRange?: boolean | undefined;
    /**
     * Disable streaming PDF data.
     * Default: `false`.
     */
    disableStream?: boolean | undefined;
    /**
     * Disable pre-fetching of PDF data. Requires `disableStream: true` to work fully.
     * Default: `false`.
     */
    disableAutoFetch?: boolean | undefined;
    /**
     * Enable debugging hooks (see `web/debugger.js`).
     * Default: `false`.
     */
    pdfBug?: boolean | undefined;
    /**
     * Factory for creating canvases.
     * Default: `{DOMCanvasFactory}`.
     */
    CanvasFactory?: Object | undefined;
    /**
     * Factory for creating SVG filters during rendering.
     * Default: `{DOMFilterFactory}`.
     */
    FilterFactory?: Object | undefined;
    /**
     * Enable hardware acceleration for rendering.
     * Default: `false`.
     */
    enableHWA?: boolean | undefined;
}

export { Metadata }

/**
 * @public
 * Node representing a single item in the PDF outline (bookmarks).
 * This mirrors the structure returned by PDF.js' getOutline() API.
 */
export declare interface OutlineNode {
    title: string;
    bold: boolean;
    italic: boolean;
    color: Uint8ClampedArray;
    dest: string | Array<any> | null;
    url: string | null;
    unsafeUrl?: string;
    newWindow?: boolean;
    count?: number;
    items: Array<any>;
}

/**
 * @public
 * PageImages
 * - Represents all embedded images found on a single PDF page.
 * - pageNumber: 1-based page index.
 * - images: Array of EmbeddedImage objects for this page.
 */
export declare interface PageImages {
    pageNumber: number;
    images: EmbeddedImage[];
}

/**
 * @public
 * Per-page link extraction result.
 * - pageNumber: the physical page index (1-based) within the PDF document.
 * - pageLabel: optional printed page label shown by PDF viewers (e.g. "iii", "1", "A-1");
 *              this can differ from the physical page number and may be undefined
 *              when the document does not provide labels.
 * - links: array of text-&gt;URL mappings that were found/overlaid on the page.
 * - width/height: page dimensions in PDF units for the viewport used.
 */
export declare type PageLinkResult = {
    pageNumber: number;
    pageLabel?: string | null;
    links: Array<{
        text: string;
        url: string;
    }>;
    width: number;
    height: number;
};

/**
 * @public
 * PageTableResult
 */
export declare interface PageTableResult {
    num: number;
    tables: TableArray[];
}

/**
 * @public
 * PageTextResult
 */
export declare interface PageTextResult {
    num: number;
    text: string;
}

/**
 * @public
 * ParseParameters
 * Options to control parsing behavior and output formatting.
 */
export declare interface ParseParameters {
    /**
     * Array of page numbers to parse.
     * When provided, only these pages will be parsed and returned in the same order.
     * Example: [1, 3, 5]. Parse only one page: [7].
     * Default: `undefined`.
     */
    partial?: Array<number>;
    /**
     * Parse the first N pages (pages 1..N).
     * Ignored when `partial` is provided. If both `first` and `last` are set, they define
     * an explicit inclusive page range (first..last) and this "first N" semantics is ignored.
     * Default: `undefined`.
     */
    first?: number;
    /**
     * Parse the last N pages (pages total-N+1..total).
     * Ignored when `partial` is provided. If both `first` and `last` are set, they define
     * an explicit inclusive page range (first..last) and this "last N" semantics is ignored.
     * Default: `undefined`.
     */
    last?: number;
    /**
     * Collect per-page metadata such as embedded links, title, pageLabel, and dimensions;
     * ISBN, DOI, abstract, and references are work in progress when getInfo() is used.
     * Default: `false`.
     */
    parsePageInfo?: boolean;
    /**
     * Attempt to detect and include hyperlink annotations (e.g. URLs) associated with text.
     * Detected links are formatted as Markdown inline links (for example: [text](https://example.com)).
     * Default: `false`.
     */
    parseHyperlinks?: boolean;
    /**
     * Enforce logical line breaks by inserting a newline when the vertical distance
     * between text items exceeds `lineThreshold`.
     * Useful to preserve paragraph/line structure when text items are emitted as separate segments.
     * Default: `true`.
     */
    lineEnforce?: boolean;
    /**
     * Threshold to decide whether nearby text items belong to different lines.
     * Larger values make the parser more likely to start a new line between items.
     * Default: `4.6`.
     */
    lineThreshold?: number;
    /**
     * String inserted between text items on the same line when a sufficiently large horizontal gap is detected.
     * Typically used to emulate a cell/column separator (for example, "\\t" for tabs).
     * Default: `'\t'`.
     */
    cellSeparator?: string;
    /**
     * Horizontal distance threshold to decide when two text items on the same baseline should be treated as separate cells.
     * Larger value produces fewer (wider) cells; smaller value creates more cell breaks.
     * Default: `7`.
     */
    cellThreshold?: number;
    /**
     * Optional string appended at the end of each page's extracted text to mark page boundaries.
     * Supports placeholders `page_number` and `total_number` which are substituted accordingly.
     * If omitted or empty, no page boundary marker is added.
     * Default: `'\n-- page_number of total_number --'`.
     */
    pageJoiner?: string;
    /**
     * Optional string used to join text items when returning a page's text.
     * If provided, this value is used instead of the default empty-string joining behavior.
     * Default: `undefined`.
     */
    itemJoiner?: string;
    /**
     * Minimum image dimension (in pixels) for width or height.
     * When set, images where width OR height are below or equal this value will be ignored by `getImage()`.
     * Useful for excluding tiny decorative or tracking images.
     * Default: `80`.
     * Disable: `0`.
     */
    imageThreshold?: number;
    /**
     * Screenshot scale factor: use 1 for the original size, 1.5 for a 50% larger image, etc.
     * Default: `1`.
     */
    scale?: number;
    /**
     * Desired screenshot width in pixels.
     * When set, the scale option is ignored.
     * Default: `undefined`.
     */
    desiredWidth?: number;
    /**
     * Applies to both getImage() and getScreenshot(): include the image as a base64 data URL string.
     * Default: `true`.
     */
    imageDataUrl?: boolean;
    /**
     * Applies to both getImage() and getScreenshot(): include the image as a binary buffer.
     * Default: `true`.
     */
    imageBuffer?: boolean;
    /**
     * Include marked content items in the items array of TextContent to capture PDF "marked content".
     * Enables tags (MCID, role/props) and structural/accessibility information useful for mapping text ↔ structure.
     * For plain text extraction it's usually false (trade-off: larger output).
     * Default: `false`.
     */
    includeMarkedContent?: boolean;
    /**
     * When true, text normalization is NOT performed in the worker thread.
     * For plain text extraction, normalizing in the worker (false) is usually recommended.
     * Default: `false`.
     */
    disableNormalization?: boolean;
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

export { PDFDataRangeTransport }

/**
 * @public
 * Loads PDF documents and exposes helpers for text, image, table, metadata, and screenshot extraction.
 */
export declare class PDFParse {
    private readonly options;
    private doc;
    progress: {
        loaded: number;
        total: number;
    };
    /**
     * Create a new parser with `LoadParameters`.
     * Converts Node.js `Buffer` data to `Uint8Array` automatically and ensures a default verbosity level.
     * @param options - Initialization parameters.
     */
    constructor(options: LoadParameters);
    destroy(): Promise<void>;
    static get isNodeJS(): boolean;
    static setWorker(workerSrc?: string): string;
    /**
     * Load document-level metadata (info, outline, permissions, page labels) and optionally gather per-page link details.
     * @param params - Parse options; set `parsePageInfo` to collect per-page metadata described in `ParseParameters`.
     * @returns Aggregated document metadata in an `InfoResult`.
     */
    getInfo(params?: ParseParameters): Promise<InfoResult>;
    private getPageLinks;
    /**
     * Extract plain text for each requested page, optionally enriching hyperlinks and enforcing line or cell separators.
     * @param params - Parse options controlling pagination, link handling, and line/cell thresholds.
     * @returns A `TextResult` containing page-wise text and a concatenated document string.
     */
    getText(params?: ParseParameters): Promise<TextResult>;
    private load;
    private shouldParse;
    private getPageText;
    private getHyperlinks;
    /**
     * Extract embedded images from requested pages.
     *
     * Behavior notes:
     * - Pages are selected according to ParseParameters (partial, first, last).
     * - Images smaller than `params.imageThreshold` (width OR height) are skipped.
     * - Returned ImageResult contains per-page PageImages; each image entry includes:
     *     - data: Uint8Array (present when params.imageBuffer === true)
     *     - dataUrl: string (present when params.imageDataUrl === true)
     *     - width, height, kind, name
     * - Works in both Node.js (canvas.toBuffer) and browser (canvas.toDataURL) environments.
     *
     * @param params - ParseParameters controlling page selection, thresholds and output format.
     * @returns Promise<ImageResult> with extracted images grouped by page.
     */
    getImage(params?: ParseParameters): Promise<ImageResult>;
    private convertToRGBA;
    private resolveEmbeddedImage;
    /**
     * Render pages to raster screenshots.
     *
     * Behavior notes:
     * - Pages are selected according to ParseParameters (partial, first, last).
     * - Use params.scale for zoom; if params.desiredWidth is specified it takes precedence.
     * - Each ScreenshotResult page contains:
     *     - data: Uint8Array (when params.imageBuffer === true)
     *     - dataUrl: string (when params.imageDataUrl === true)
     *     - pageNumber, width, height, scale
     * - Works in both Node.js (canvas.toBuffer) and browser (canvas.toDataURL) environments.
     *
     * @param parseParams - ParseParameters controlling page selection and render options.
     * @returns Promise<ScreenshotResult> with rendered page images.
     */
    getScreenshot(parseParams?: ParseParameters): Promise<ScreenshotResult>;
    /**
     * Detect and extract tables from pages by analysing vector drawing operators, then populate cells with text.
     *
     * Behavior notes:
     * - Scans operator lists for rectangles/lines that form table grids (uses PathGeometry and LineStore).
     * - Normalizes detected geometry and matches positioned text to table cells.
     * - Honors ParseParameters for page selection.
     *
     * @param params - ParseParameters controlling which pages to analyse (partial/first/last).
     * @returns Promise<TableResult> containing discovered tables per page.
     */
    getTable(params?: ParseParameters): Promise<TableResult>;
    private getPathGeometry;
    private getPageTables;
    private fillPageTables;
}

export { PDFWorker }

export declare class Point extends Shape {
    x: number;
    y: number;
    constructor(x: number, y: number);
    equal(point: Point): boolean;
    transform(matrix: Array<number>): this;
}

export declare class Rectangle extends Shape {
    from: Point;
    width: number;
    height: number;
    constructor(from: Point, width: number, height: number);
    get to(): Point;
    getLines(): Line[];
    transform(matrix: Array<number>): this;
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
 * @public
 * SafeParseParameters
 */
export declare type SafeParseParameters = Required<Pick<ParseParameters, 'lineThreshold' | 'cellThreshold' | 'scale'>> & ParseParameters;

/**
 * @public
 * Screenshot
 */
export declare interface Screenshot {
    data: Uint8Array;
    dataUrl: string;
    pageNumber: number;
    width: number;
    height: number;
    scale: number;
}

/**
 * @public
 * ScreenshotResult
 */
export declare class ScreenshotResult {
    pages: Array<Screenshot>;
    total: number;
    constructor(total: number);
}

export declare function setDefaultParseParameters(params: ParseParameters): SafeParseParameters;

export declare abstract class Shape {
    static tolerance: number;
    abstract transform(matrix: Array<number>): this;
    static applyTransform(p: Array<number>, m: Array<number>): Array<number>;
}

export declare class Table {
    hLines: Array<Line>;
    vLines: Array<Line>;
    constructor(line: Line);
    get isValid(): boolean;
    get rowPivots(): Array<number>;
    get colPivots(): Array<number>;
    add(line: Line): boolean;
    private intersection;
    private getSameHorizontal;
    private getSameVertical;
    private mergeHorizontalLines;
    private mergeVerticalLines;
    normalize(): void;
    verticalExists(line: Line, y1: number, y2: number): boolean;
    horizontalExists(line: Line, x1: number, x2: number): boolean;
    private findBottomLineIndex;
    private findVerticalLineIndexs;
    private getRow;
    toData(): TableData;
}

export declare type TableArray = Array<Array<string>>;

declare type TableCell = {
    minXY: Point;
    maxXY: Point;
    width: number;
    height: number;
    colspan?: number;
    rowspan?: number;
    text: Array<string>;
};

declare class TableData {
    minXY: Point;
    maxXY: Point;
    rows: Array<TableRow>;
    private rowPivots;
    private colPivots;
    constructor(minXY: Point, maxXY: Point, rowPivots: Array<number>, colPivots: Array<number>);
    findCell(x: number, y: number): TableCell | undefined;
    get cellCount(): number;
    get rowCount(): number;
    check(): boolean;
    toArray(): string[][];
}

/**
 * @public
 * TableResult
 */
export declare class TableResult {
    pages: Array<PageTableResult>;
    mergedTables: TableArray[];
    total: number;
    constructor(total: number);
}

declare type TableRow = Array<TableCell>;

/**
 * @public
 * TextResult
 */
export declare class TextResult {
    pages: Array<PageTextResult>;
    text: string;
    total: number;
    getPageText(num: number): string;
    constructor(total: number);
}

export declare type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

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

export { VerbosityLevel }

export { }
