import { Line } from './Line.js';
import { TableData } from './TableData.js';
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
//# sourceMappingURL=Table.d.ts.map