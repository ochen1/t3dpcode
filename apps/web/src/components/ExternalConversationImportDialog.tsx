import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ExternalConversationSummary,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, DownloadIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { msg, T, useGT } from "gt-react";
import { m } from "../i18n/messages";

import { orchestrationEnvironment } from "../state/orchestration";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useProjects, useServerConfigs, useThreadShells } from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../threadRoutes";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { cn } from "../lib/utils";
import { ClaudeAI, OpenAI } from "./Icons";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Spinner } from "./ui/spinner";

function conversationKey(conversation: ExternalConversationSummary): string {
  return `${conversation.providerInstanceId}\u0000${conversation.externalThreadId}`;
}

function errorMessage(value: unknown): string {
  return value instanceof Error && value.message.trim().length > 0
    ? value.message
    : m(msg("The conversation could not be imported."));
}

export function ExternalConversationImportDialog({
  onBack,
  onClose,
}: {
  readonly onBack: () => void;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const threads = useThreadShells();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeThread =
    routeTarget?.kind === "server"
      ? threads.find(
          (thread) =>
            thread.environmentId === routeTarget.threadRef.environmentId &&
            thread.id === routeTarget.threadRef.threadId,
        )
      : undefined;
  const defaultEnvironmentId =
    routeThread?.environmentId ?? primaryEnvironmentId ?? projects[0]?.environmentId ?? null;
  const [selectedEnvironmentId, setEnvironmentId] = useState<EnvironmentId | null>(
    defaultEnvironmentId,
  );
  const [selectedProjectId, setProjectId] = useState<ProjectId | null>(
    routeThread?.projectId ?? null,
  );
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importConversation = useAtomCommand(orchestrationEnvironment.importExternalConversation, {
    reportFailure: false,
  });
  const environmentItems = Array.from(
    new Set(
      projects
        .filter(
          (project) =>
            serverConfigs.get(project.environmentId)?.environment.capabilities
              .externalConversationImport === true,
        )
        .map((project) => project.environmentId),
    ),
  ).map((id) => ({
    value: id,
    label: environments.find((environment) => environment.environmentId === id)?.label ?? id,
  }));

  const environmentId =
    environmentItems.find((item) => item.value === selectedEnvironmentId)?.value ??
    environmentItems[0]?.value ??
    null;
  const conversationQuery = useEnvironmentQuery(
    environmentId === null ||
      serverConfigs.get(environmentId)?.environment.capabilities.externalConversationImport !== true
      ? null
      : orchestrationEnvironment.externalConversations({
          environmentId,
          input: { limit: 500 },
        }),
  );
  const environmentProjects = projects.filter((project) => project.environmentId === environmentId);
  const normalized = query.trim().toLowerCase();
  const visibleConversations = (conversationQuery.data?.conversations ?? []).filter(
    (conversation) =>
      normalized.length === 0 ||
      [
        conversation.title,
        conversation.preview,
        conversation.cwd ?? "",
        conversation.providerLabel,
      ].some((candidate) => candidate.toLowerCase().includes(normalized)),
  );
  const selectedConversation =
    visibleConversations.find((conversation) => conversationKey(conversation) === selectedKey) ??
    visibleConversations[0] ??
    null;
  const projectId =
    environmentProjects.find((project) => project.id === selectedProjectId)?.id ??
    environmentProjects.find((project) => project.workspaceRoot === selectedConversation?.cwd)
      ?.id ??
    environmentProjects[0]?.id ??
    null;
  const projectItems = environmentProjects.map((project) => ({
    value: project.id,
    label: project.title,
  }));

  const navigateToThread = async (threadId: ThreadId) => {
    if (environmentId === null) return;
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
    });
    onClose();
  };

  const handleImport = async () => {
    if (!selectedConversation || !environmentId || !projectId) return;
    if (selectedConversation.importedThreadId) {
      await navigateToThread(selectedConversation.importedThreadId);
      return;
    }
    const key = conversationKey(selectedConversation);
    setError(null);
    setImportingKey(key);
    const result = await importConversation({
      environmentId,
      input: {
        providerInstanceId: selectedConversation.providerInstanceId,
        externalThreadId: selectedConversation.externalThreadId,
        projectId,
      },
    });
    setImportingKey(null);
    if (result._tag === "Failure") {
      setError(errorMessage(squashAtomCommandFailure(result)));
      return;
    }
    await navigateToThread(result.value.threadId);
  };

  return (
    <div className="flex h-[min(620px,calc(100vh-5rem))] flex-col">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <Button aria-label={gt("Back to commands")} size="icon-sm" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base">
            <T>Import conversation</T>
          </h2>
          <p className="text-muted-foreground text-xs">
            <T>Bring in Claude Code or Codex messages and complete tool history.</T>
          </p>
        </div>
      </div>

      <div className="grid gap-2 border-b p-3 sm:grid-cols-2">
        <Select
          value={environmentId}
          items={environmentItems}
          onValueChange={(value) => {
            setEnvironmentId(value as EnvironmentId);
            setProjectId(null);
            setSelectedKey(null);
            setError(null);
          }}
        >
          <SelectTrigger aria-label={gt("Import from environment")} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {environmentItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={gt("Search conversations")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {conversationQuery.isPending && conversationQuery.data === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              <T>Finding local conversations…</T>
            </div>
          ) : conversationQuery.error ? (
            <div className="p-8 text-center text-destructive text-sm">
              <p>{conversationQuery.error}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={conversationQuery.refresh}
              >
                <T>Try again</T>
              </Button>
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {environmentItems.length === 0
                ? gt("No connected environment supports conversation imports.")
                : query.trim()
                  ? gt("No conversations match your search.")
                  : gt("No Claude Code or Codex conversations were found on this environment.")}
            </div>
          ) : (
            visibleConversations.map((conversation) => {
              const key = conversationKey(conversation);
              const selected =
                selectedConversation !== null && conversationKey(selectedConversation) === key;
              const ProviderIcon = conversation.provider === "claudeAgent" ? ClaudeAI : OpenAI;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    selected ? "border-ring/50 bg-accent" : "border-transparent hover:bg-accent/60",
                  )}
                  onClick={() => {
                    setSelectedKey(key);
                    setProjectId(null);
                    setError(null);
                  }}
                  onDoubleClick={() => {
                    setSelectedKey(key);
                    setProjectId(null);
                    if (conversation.importedThreadId)
                      void navigateToThread(conversation.importedThreadId);
                  }}
                >
                  <ProviderIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-sm">
                        {conversation.title}
                      </span>
                      <span className="shrink-0 text-muted-foreground text-2xs">
                        {formatRelativeTimeLabel(conversation.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                      {conversation.preview || conversation.cwd || conversation.providerLabel}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-muted-foreground/75 text-2xs">
                      <span>{conversation.providerLabel}</span>
                      {conversation.cwd ? (
                        <span className="truncate">{conversation.cwd}</span>
                      ) : null}
                      {conversation.importedThreadId ? (
                        <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-success">
                          <CheckIcon className="size-3" /> <T>Imported</T>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t bg-muted/35 p-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground text-xs">
            <T>Add to</T>
          </span>
          <Select
            value={projectId}
            items={projectItems}
            onValueChange={(value) => setProjectId(value as ProjectId)}
          >
            <SelectTrigger aria-label={gt("Target project")} className="min-w-0 flex-1" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {environmentProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <span className="flex min-w-0 flex-col">
                    <span>{project.title}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {project.workspaceRoot}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button
            size="sm"
            disabled={!selectedConversation || !projectId || importingKey !== null}
            onClick={() => void handleImport()}
          >
            {importingKey !== null ? (
              <Spinner className="size-3.5" />
            ) : selectedConversation?.importedThreadId ? (
              <CheckIcon />
            ) : (
              <DownloadIcon />
            )}
            {selectedConversation?.importedThreadId ? gt("Open") : gt("Import")}
          </Button>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </div>
  );
}
