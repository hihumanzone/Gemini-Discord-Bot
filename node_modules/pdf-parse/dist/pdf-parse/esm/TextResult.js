/**
 * @public
 * TextResult
 */
export class TextResult {
    pages = [];
    text = '';
    total = 0;
    getPageText(num) {
        for (const pageData of this.pages) {
            if (pageData.num === num)
                return pageData.text;
        }
        return '';
    }
    constructor(total) {
        this.total = total;
    }
}
//# sourceMappingURL=TextResult.js.map