export interface IVideoRecorder {
  readonly isRecording: boolean;
  start(): void;
  stop(): Promise<Blob>;
  dispose(): void;
}
