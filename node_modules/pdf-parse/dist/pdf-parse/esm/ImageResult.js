/**
 * @public
 * ImageResult
 * Helper container for extracted images grouped per page.
 */
export class ImageResult {
    pages = [];
    total = 0;
    getPageImage(num, name) {
        for (const pageData of this.pages) {
            if (pageData.pageNumber === num) {
                for (const img of pageData.images) {
                    if (img.name === name) {
                        return img;
                    }
                }
            }
        }
        return null;
    }
    constructor(total) {
        this.total = total;
    }
}
//# sourceMappingURL=ImageResult.js.map