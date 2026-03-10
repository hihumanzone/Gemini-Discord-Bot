import { Point } from './Point.js';
import { Shape } from './Shape.js';
export declare enum LineDirection {
    None = 0,
    Horizontal = 1,
    Vertical = 2
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
//# sourceMappingURL=Line.d.ts.map