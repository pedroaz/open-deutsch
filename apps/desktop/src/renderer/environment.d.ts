export type RendererDocumentEnvironment = Document;

// @ts-expect-error Renderer code must not inherit Node.js ambient globals.
export type RendererNodeProcessLeak = typeof process;
