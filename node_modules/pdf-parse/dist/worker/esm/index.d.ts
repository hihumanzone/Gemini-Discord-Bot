import { Canvas } from '@napi-rs/canvas';
import { SKRSContext2D } from '@napi-rs/canvas';

declare interface CanvasAndContext {
    canvas: Canvas | null;
    context: SKRSContext2D | null;
}

export declare class CanvasFactory {
    create(width: number, height: number): CanvasAndContext;
    reset(canvasAndContext: CanvasAndContext, width: number, height: number): void;
    destroy(canvasAndContext: CanvasAndContext): void;
}

export declare function getData(): string;

export declare function getPath(): string;

export { }
