import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const XMP_DATE_PROPERTIES = [
    'xmp:createdate',
    'xmp:modifydate',
    'xmp:metadatadate',
    'xap:createdate',
    'xap:modifydate',
    'xap:metadatadate',
];
/**
 * @public
 * Aggregated information about a PDF document returned by getInfo().
 * The object contains high-level metadata, outline/bookmark structure,
 * per-page extracted hyperlinks and utility helpers for parsing dates.
 */
export class InfoResult {
    // Total number of pages in the PDF document (count of physical pages).
    total;
    /**
     * The PDF 'Info' dictionary. Typical fields include title, author, subject,
     * Creator, Producer and Creation/Modification dates. The exact structure is
     * determined by the PDF and as returned by PDF.js.
     */
    // biome-ignore lint/suspicious/noExplicitAny: <unsupported underline type>
    info;
    // Low-level document metadata object (XMP). Use this to access extended
    // properties that are not present in the Info dictionary.
    metadata;
    /**
     * An array of document fingerprint strings provided by PDF.js. Useful
     * for caching, de-duplication or identifying a document across runs.
     */
    fingerprints;
    /**
     * Permission flags for the document as returned by PDF.js (or null).
     * These flags indicate capabilities such as printing, copying and
     * other restrictions imposed by the PDF security settings.
     */
    permission;
    /**
     * Optional document outline (bookmarks). When present this is the
     * hierarchical navigation structure which viewers use for quick access.
     */
    outline;
    // Results with per-page hyperlink extraction. Empty array by default.
    pages = [];
    /**
     * Collects dates from different sources (Info dictionary and XMP/XAP metadata)
     * and returns them as a DateNode where available. This helps callers compare
     * and choose the most relevant timestamp (for example a creation date vs XMP date).
     */
    getDateNode() {
        const result = {};
        // The Info dictionary may contain CreationDate/ModDate in PDF date string format.
        // biome-ignore lint/suspicious/noExplicitAny: <unsupported underline type>
        const CreationDate = this.info?.CreationDate;
        if (CreationDate) {
            result.CreationDate = pdfjs.PDFDateString.toDateObject(CreationDate);
        }
        // biome-ignore lint/suspicious/noExplicitAny: <unsupported underline type>
        const ModDate = this.info?.ModDate;
        if (ModDate) {
            result.ModDate = pdfjs.PDFDateString.toDateObject(ModDate);
        }
        // If no XMP metadata is present, return the Info-based dates only.
        if (!this.metadata) {
            return result;
        }
        // Extract several XMP/XAP date properties (if present) and attempt to
        // parse them as ISO-like strings. Parsed values are added to the
        // corresponding DateNode fields.
        for (const prop of XMP_DATE_PROPERTIES) {
            const value = this.metadata?.get(prop);
            const date = this.parseISODateString(value);
            switch (prop) {
                case XMP_DATE_PROPERTIES[0]:
                    result.XmpCreateDate = date;
                    break;
                case XMP_DATE_PROPERTIES[1]:
                    result.XmpModifyDate = date;
                    break;
                case XMP_DATE_PROPERTIES[2]:
                    result.XmpMetadataDate = date;
                    break;
                case XMP_DATE_PROPERTIES[3]:
                    result.XapCreateDate = date;
                    break;
                case XMP_DATE_PROPERTIES[4]:
                    result.XapModifyDate = date;
                    break;
                case XMP_DATE_PROPERTIES[5]:
                    result.XapMetadataDate = date;
                    break;
            }
        }
        return result;
    }
    /**
     * Try to parse an ISO-8601 date string from XMP/XAP metadata. If the
     * value is falsy or cannot be parsed, undefined is returned to indicate
     * absence or unparsable input.
     */
    parseISODateString(isoDateString) {
        if (!isoDateString)
            return undefined;
        const parsedDate = Date.parse(isoDateString);
        if (!Number.isNaN(parsedDate)) {
            return new Date(parsedDate);
        }
        return undefined;
    }
    constructor(total) {
        this.total = total;
    }
}
//# sourceMappingURL=InfoResult.js.map