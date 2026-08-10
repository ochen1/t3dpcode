import type { OrchestrationQueuedTurn } from "@t3tools/contracts";
import { CornerDownRightIcon, Trash2Icon } from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function shouldShowComposerQueuedHeader(input: {
  readonly queuedTurnCount: number;
  readonly isComposerCollapsedMobile: boolean;
}): boolean {
  return input.queuedTurnCount > 0;
}

function previewQueuedText(text: string): string {
  const normalized = text
    .replace(/```[\s\S]*?```/g, "code block")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : "Queued message";
}

export const ComposerQueuedHeader = memo(function ComposerQueuedHeader(props: {
  readonly queuedTurns: ReadonlyArray<OrchestrationQueuedTurn>;
  readonly onSteer: (queuedTurn: OrchestrationQueuedTurn) => void;
  readonly onRemove: (queuedTurn: OrchestrationQueuedTurn) => void;
}) {
  if (props.queuedTurns.length === 0) {
    return null;
  }

  return (
    <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground sm:px-4">
        <span className="font-medium text-foreground/75">Queued {props.queuedTurns.length}</span>
      </div>
      <div className="grid">
        {props.queuedTurns.map((queuedTurn, index) => (
          <div
            key={queuedTurn.id}
            className="flex min-w-0 items-center gap-2 border-t border-border/55 px-3 py-2 sm:px-4"
          >
            <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/55">
              {index + 1}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-foreground/85">
              {previewQueuedText(queuedTurn.message.text)}
            </p>
            <Button
              type="button"
              size="sm"
              variant={queuedTurn.steerRequestedAt === null ? "outline" : "secondary"}
              className="h-7 shrink-0 gap-1.5 px-2.5"
              onClick={() => props.onSteer(queuedTurn)}
            >
              <CornerDownRightIcon className="size-3.5" />
              Steer
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove queued message"
                    onClick={() => props.onRemove(queuedTurn)}
                  />
                }
              >
                <Trash2Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Remove queued message</TooltipPopup>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
});
