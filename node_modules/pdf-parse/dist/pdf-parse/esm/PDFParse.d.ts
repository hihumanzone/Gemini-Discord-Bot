import { ImageResult } from './ImageResult.js';
import { InfoResult } from './InfoResult.js';
import type { LoadParameters } from './LoadParameters.js';
import { type ParseParameters } from './ParseParameters.js';
import { ScreenshotResult } from './ScreenshotResult.js';
import { TableResult } from './TableResult.js';
import { TextResult } from './TextResult.js';
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
//# sourceMappingURL=PDFParse.d.ts.map