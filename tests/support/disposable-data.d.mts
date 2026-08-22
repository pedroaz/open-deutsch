export interface DisposableBootstrapPointer {
  readonly schemaVersion: 1;
  readonly dataRoot: string;
  readonly rootGeneration: 1;
  readonly testRunId: string;
}

export interface DisposableDataHarness {
  readonly runId: string;
  readonly sandboxRoot: string;
  readonly dataRoot: string;
  readonly configRoot: string;
  readonly bootstrapFile: string;
  readonly bootstrap: DisposableBootstrapPointer;
  environment(inherited?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

export function createDisposableDataHarness(): Promise<DisposableDataHarness>;

export function disposablePermissions(harness: DisposableDataHarness): Promise<{
  dataRoot: number;
  configRoot: number;
  bootstrapFile: number;
}>;
