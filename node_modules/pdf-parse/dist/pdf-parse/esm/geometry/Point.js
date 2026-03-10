import { Shape } from './Shape.js';
export class Point extends Shape {
    x;
    y;
    constructor(x, y) {
        super();
        this.x = x;
        this.y = y;
    }
    equal(point) {
        return point.x === this.x && point.y === this.y;
    }
    transform(matrix) {
        const p = Shape.applyTransform([this.x, this.y], matrix);
        this.x = p[0];
        this.y = p[1];
        return this;
    }
}
//# sourceMappingURL=Point.js.map