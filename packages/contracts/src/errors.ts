import { correlationIdSchema, runIdSchema, sessionIdSchema, utcInstantSchema } from "./common.js";
import { boundaryUnion, strictBoundaryObject, z } from "./schema-system.js";

export const errorDefinitions = {
  validation: { code: "OD_VALIDATION_FAILED", messageKey: "errors.validation" },
  "not-found": { code: "OD_NOT_FOUND", messageKey: "errors.notFound" },
  conflict: { code: "OD_CONFLICT", messageKey: "errors.conflict" },
  "stale-data-root": { code: "OD_DATA_ROOT_STALE", messageKey: "errors.staleDataRoot" },
  database: { code: "OD_DATABASE_FAILED", messageKey: "errors.database" },
  "app-server": { code: "OD_APP_SERVER_FAILED", messageKey: "errors.appServer" },
  authentication: { code: "OD_AUTHENTICATION_REQUIRED", messageKey: "errors.authentication" },
  "unsupported-codex-version": {
    code: "OD_CODEX_VERSION_UNSUPPORTED",
    messageKey: "errors.unsupportedCodexVersion",
  },
  "rate-limit": { code: "OD_RATE_LIMITED", messageKey: "errors.rateLimit" },
  cancellation: { code: "OD_CANCELLED", messageKey: "errors.cancellation" },
  "model-output": { code: "OD_MODEL_OUTPUT_INVALID", messageKey: "errors.modelOutput" },
  mcp: { code: "OD_MCP_FAILED", messageKey: "errors.mcp" },
  handoff: { code: "OD_HANDOFF_FAILED", messageKey: "errors.handoff" },
  "unsupported-operation": {
    code: "OD_OPERATION_UNSUPPORTED",
    messageKey: "errors.unsupportedOperation",
  },
} as const;

export type ErrorKind = keyof typeof errorDefinitions;
export type ErrorCode = (typeof errorDefinitions)[ErrorKind]["code"];
export type ErrorMessageKey = (typeof errorDefinitions)[ErrorKind]["messageKey"];

const errorKinds = Object.keys(errorDefinitions) as [ErrorKind, ...ErrorKind[]];
const errorCodes = Object.values(errorDefinitions).map(({ code }) => code) as [
  ErrorCode,
  ...ErrorCode[],
];
const errorMessageKeys = Object.values(errorDefinitions).map(({ messageKey }) => messageKey) as [
  ErrorMessageKey,
  ...ErrorMessageKey[],
];

export const errorKindSchema = z.enum(errorKinds);
export const errorCodeSchema = z.enum(errorCodes);
export const errorMessageKeySchema = z.enum(errorMessageKeys);

export const logReferenceSchema = strictBoundaryObject({
  code: errorCodeSchema,
  correlationId: correlationIdSchema,
  runId: runIdSchema.optional(),
  sessionId: sessionIdSchema.optional(),
  occurredAt: utcInstantSchema,
});

const errorVariants = errorKinds.map((kind) => {
  const definition = errorDefinitions[kind];
  return strictBoundaryObject({
    schemaVersion: z.literal(1),
    kind: z.literal(kind),
    code: z.literal(definition.code),
    messageKey: z.literal(definition.messageKey),
    reference: z.strictObject({
      code: z.literal(definition.code),
      correlationId: correlationIdSchema,
      runId: runIdSchema.optional(),
      sessionId: sessionIdSchema.optional(),
      occurredAt: utcInstantSchema,
    }),
  });
});

export const openDeutschErrorSchema = boundaryUnion(
  errorVariants as unknown as [
    (typeof errorVariants)[number],
    (typeof errorVariants)[number],
    ...(typeof errorVariants)[number][],
  ],
);

export type LogReference = z.infer<typeof logReferenceSchema>;
export type OpenDeutschError = z.infer<typeof openDeutschErrorSchema>;

export const safeErrorMessages = {
  en: {
    validation: "Some information is invalid. Check it and try again.",
    "not-found": "The requested item is no longer available.",
    conflict: "This item changed before the operation could finish. Refresh and try again.",
    "stale-data-root": "The selected data folder changed. Reopen this action and try again.",
    database: "Open Deutsch could not access its local learning data.",
    "app-server": "Codex is temporarily unavailable to Open Deutsch.",
    authentication: "Connect your Codex account to continue.",
    "unsupported-codex-version": "This Codex version is not supported by Open Deutsch.",
    "rate-limit": "Codex usage is temporarily limited. Try again later.",
    cancellation: "The operation was cancelled.",
    "model-output": "Codex returned a result Open Deutsch could not safely use.",
    mcp: "The Open Deutsch Codex integration could not complete the operation.",
    handoff: "Open Deutsch could not open the related activity.",
    "unsupported-operation": "This operation is not supported.",
  },
  de: {
    validation: "Einige Angaben sind ungültig. Prüfe sie und versuche es erneut.",
    "not-found": "Das angeforderte Element ist nicht mehr verfügbar.",
    conflict:
      "Das Element wurde zwischenzeitlich geändert. Aktualisiere es und versuche es erneut.",
    "stale-data-root": "Der ausgewählte Datenordner wurde geändert. Öffne die Aktion erneut.",
    database: "Open Deutsch konnte nicht auf die lokalen Lerndaten zugreifen.",
    "app-server": "Codex ist für Open Deutsch vorübergehend nicht verfügbar.",
    authentication: "Verbinde dein Codex-Konto, um fortzufahren.",
    "unsupported-codex-version": "Diese Codex-Version wird von Open Deutsch nicht unterstützt.",
    "rate-limit": "Die Codex-Nutzung ist vorübergehend begrenzt. Versuche es später erneut.",
    cancellation: "Der Vorgang wurde abgebrochen.",
    "model-output":
      "Codex hat ein Ergebnis geliefert, das Open Deutsch nicht sicher verwenden kann.",
    mcp: "Die Codex-Integration von Open Deutsch konnte den Vorgang nicht abschließen.",
    handoff: "Open Deutsch konnte die zugehörige Aktivität nicht öffnen.",
    "unsupported-operation": "Dieser Vorgang wird nicht unterstützt.",
  },
} as const satisfies Record<"en" | "de", Record<ErrorKind, string>>;

export type ErrorLocale = keyof typeof safeErrorMessages;

export function localizedErrorMessage(kind: ErrorKind, locale: ErrorLocale): string {
  return safeErrorMessages[locale][kind];
}
