import type { ModelSelection } from "@t3tools/contracts";

function serviceTier(selection: ModelSelection) {
  return selection.options?.find((option) => option.id === "serviceTier")?.value ?? "default";
}

export function overridesServiceTier(current: ModelSelection, requested: ModelSelection) {
  return (
    current.instanceId !== requested.instanceId ||
    current.model !== requested.model ||
    serviceTier(current) !== serviceTier(requested)
  );
}

export function withInheritedServiceTier(
  selection: ModelSelection,
  parent: ModelSelection,
): ModelSelection {
  const value = serviceTier(parent);
  if (serviceTier(selection) === value) return selection;
  return {
    ...selection,
    options: [
      ...(selection.options ?? []).filter((option) => option.id !== "serviceTier"),
      { id: "serviceTier", value },
    ],
  };
}
