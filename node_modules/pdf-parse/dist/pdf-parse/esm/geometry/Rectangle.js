import { Line } from './Line.js';
import { Point } from './Point.js';
import { Shape } from './Shape.js';
export class Rectangle extends Shape {
    from;
    width;
    height;
    constructor(from, width, height) {
        super();
        this.from = from;
        this.width = width;
        this.height = height;
    }
    get to() {
        return new Point(this.from.x + this.width, this.from.y + this.height);
    }
    getLines() {
        const to = this.to;
        const lines = [
            new Line(this.from, new Point(to.x, this.from.y)),
            new Line(this.from, new Point(this.from.x, to.y)),
            new Line(new Point(to.x, this.from.y), to),
            new Line(new Point(this.from.x, to.y), to),
        ];
        return lines.filter((l) => l.valid);
    }
    transform(matrix) {
        const p1 = Shape.applyTransform([this.from.x, this.from.y], matrix);
        const p2 = Shape.applyTransform([this.from.x + this.width, this.from.y + this.height], matrix);
        const x = Math.min(p1[0], p2[0]);
        const y = Math.min(p1[1], p2[1]);
        const width = Math.abs(p1[0] - p2[0]);
        const height = Math.abs(p1[1] - p2[1]);
        this.from = new Point(x, y);
        this.width = width;
        this.height = height;
        return this;
    }
}
//# sourceMappingURL=Rectangle.js.map