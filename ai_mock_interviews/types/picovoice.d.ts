/**
 * Type declarations for optional Picovoice Eagle SDK
 * This package is optional - install with: npm install @picovoice/eagle-web
 */
declare module "@picovoice/eagle-web" {
  export class EagleProfiler {
    static create(accessKey: string, model: { publicPath: string; forceWrite: boolean }): Promise<EagleProfiler>;
    enroll(audioData: Float32Array): Promise<{ percentage: number }>;
    export(): Uint8Array;
    release(): void;
  }

  export class Eagle {
    static create(accessKey: string, model: { publicPath: string; forceWrite: boolean }, profiles: Uint8Array[]): Promise<Eagle>;
    process(audioData: Float32Array): Promise<number[]>;
    release(): void;
  }
}
