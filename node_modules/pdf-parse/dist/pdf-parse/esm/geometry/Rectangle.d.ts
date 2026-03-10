import { Line } from './Line.js';
import { Point } from './Point.js';
import { Shape } from './Shape.js';
export declare class Rectangle extends Shape {
    from: Point;
    width: number;
    height: number;
    constructor(from: Point, width: number, height: number);
    get to(): Point;
    getLines(): Line[];
    transform(matrix: Array<number>): this;
}
//# sourceMappingURL=Rectangle.d.ts.map