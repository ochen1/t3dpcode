import * as Schema from "effect/Schema";
import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const ExternalConversationProvider = Schema.Literals(["claudeAgent", "codex"]);
export type ExternalConversationProvider = typeof ExternalConversationProvider.Type;

export const ExternalConversationSummary = Schema.Struct({
  externalThreadId: TrimmedNonEmptyString,
  provider: ExternalConversationProvider,
  providerInstanceId: ProviderInstanceId,
  providerLabel: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  preview: Schema.String,
  cwd: Schema.optional(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  importedThreadId: Schema.optional(ThreadId),
});
export type ExternalConversationSummary = typeof ExternalConversationSummary.Type;

export const ExternalConversationListInput = Schema.Struct({
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 }))),
});
export type ExternalConversationListInput = typeof ExternalConversationListInput.Type;

export const ExternalConversationListResult = Schema.Struct({
  conversations: Schema.Array(ExternalConversationSummary),
});
export type ExternalConversationListResult = typeof ExternalConversationListResult.Type;

export const ExternalConversationImportInput = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  externalThreadId: TrimmedNonEmptyString,
  projectId: ProjectId,
});
export type ExternalConversationImportInput = typeof ExternalConversationImportInput.Type;

export const ExternalConversationImportResult = Schema.Struct({
  threadId: ThreadId,
  alreadyImported: Schema.Boolean,
});
export type ExternalConversationImportResult = typeof ExternalConversationImportResult.Type;

export class ExternalConversationImportError extends Schema.TaggedError<ExternalConversationImportError>()(
  "ExternalConversationImportError",
  {
    reason: Schema.Literals([
      "source-not-found",
      "invalid-history",
      "project-not-found",
      "provider-unavailable",
      "unsupported-provider",
      "import-failed",
    ]),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
