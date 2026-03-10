import type { Metadata } from 'pdfjs-dist/types/src/display/metadata.js';
export type { Metadata } from 'pdfjs-dist/types/src/display/metadata.js';
/**
 * @public
 * Node representing a single item in the PDF outline (bookmarks).
 * This mirrors the structure returned by PDF.js' getOutline() API.
 */
export interface OutlineNode {
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
 * Consolidated date information gathered from different PDF sources.
 * The PDF 'Info' dictionary contains CreationDate / ModDate and
 * the XMP/XAP metadata can contain several timestamps as well. This
 * structure collects those values (if present) as JavaScript Date objects
 * or null when the property exists but cannot be parsed.
 */
export type DateNode = {
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
 * Per-page link extraction result.
 * - pageNumber: the physical page index (1-based) within the PDF document.
 * - pageLabel: optional printed page label shown by PDF viewers (e.g. "iii", "1", "A-1");
 *              this can differ from the physical page number and may be undefined
 *              when the document does not provide labels.
 * - links: array of text-&gt;URL mappings that were found/overlaid on the page.
 * - width/height: page dimensions in PDF units for the viewport used.
 */
export type PageLinkResult = {
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
//# sourceMappingURL=InfoResult.d.ts.map