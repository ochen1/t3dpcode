import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import type { DesktopBridge } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isElectron } from "../env";
import {
  DEFAULT_THEME_STATE,
  type ChromeTheme,
  type ThemeFonts,
  type ThemeMode,
  type ThemePack,
  type ThemeState,
  type ThemeVariant,
  areThemePacksEqual,
  buildThemeCssVariables,
  canParseThemeShareString,
  createThemeShareString,
  parseStoredThemeState,
  resetThemeVariant as resetThemeVariantState,
  resolveThemePack,
  resolveThemeVariant,
  serializeThemeState,
  setThemeCodeThemeId,
  setThemeFonts,
  updateChromeTheme,
  updateThemePackFromShareString,
} from "../theme/theme.logic";

const ThemePreferenceSchema = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreferenceSchema.Type;

type ThemeSnapshot = {
  state: ThemeState;
  systemDark: boolean;
};

type DesktopThemeBridge = Pick<DesktopBridge, "setTheme">;

const STORAGE_KEY = "t3code:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLOR_META_NAME = "theme-color";
const DYNAMIC_THEME_COLOR_SELECTOR = `meta[name="${THEME_COLOR_META_NAME}"][data-dynamic-theme-color="true"]`;

export class ThemeStorageError extends Schema.TaggedErrorClass<ThemeStorageError>()(
  "ThemeStorageError",
  {
    operation: Schema.Literals(["read", "write"]),
    storageKey: Schema.String,
    theme: Schema.optional(ThemePreferenceSchema),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} theme preference for ${this.storageKey}.`;
  }
}

export const isThemeStorageError = Schema.is(ThemeStorageError);

export class DesktopThemeSyncError extends Schema.TaggedErrorClass<DesktopThemeSyncError>()(
  "DesktopThemeSyncError",
  {
    theme: ThemePreferenceSchema,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to sync the ${this.theme} theme to the desktop shell.`;
  }
}

export const isDesktopThemeSyncError = Schema.is(DesktopThemeSyncError);

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastSnapshotKey = "";
let lastDesktopTheme: ThemeMode | null = null;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function hasThemeStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getSystemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MEDIA_QUERY).matches
  );
}

function logThemeStorageError(cause: unknown, operation: "read" | "write", theme?: ThemeMode) {
  const error = isThemeStorageError(cause)
    ? cause
    : new ThemeStorageError({
        operation,
        storageKey: STORAGE_KEY,
        theme,
        cause,
      });
  console.error(error.message, {
    operation: error.operation,
    storageKey: error.storageKey,
    theme: error.theme,
    ...safeErrorLogAttributes(error),
  });
}

function readStoredThemeState(): ThemeState {
  if (!hasThemeStorage()) {
    return DEFAULT_THEME_STATE;
  }

  try {
    return parseStoredThemeState(localStorage.getItem(STORAGE_KEY));
  } catch (cause) {
    logThemeStorageError(cause, "read");
    return DEFAULT_THEME_STATE;
  }
}

export function readThemePreference(): ThemePreference {
  if (!hasThemeStorage()) {
    return DEFAULT_THEME_STATE.mode;
  }

  try {
    return parseStoredThemeState(localStorage.getItem(STORAGE_KEY)).mode;
  } catch (cause) {
    throw new ThemeStorageError({
      operation: "read",
      storageKey: STORAGE_KEY,
      cause,
    });
  }
}

export function writeThemePreference(theme: ThemePreference) {
  if (!hasThemeStorage()) {
    return;
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      serializeThemeState({
        ...readStoredThemeState(),
        mode: theme,
      }),
    );
  } catch (cause) {
    throw new ThemeStorageError({
      operation: "write",
      storageKey: STORAGE_KEY,
      theme,
      cause,
    });
  }
}

function writeStoredThemeState(state: ThemeState) {
  if (!hasThemeStorage()) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, serializeThemeState(state));
  } catch (cause) {
    throw new ThemeStorageError({
      operation: "write",
      storageKey: STORAGE_KEY,
      theme: state.mode,
      cause,
    });
  }
}

function getSnapshot(): ThemeSnapshot {
  const state = readStoredThemeState();
  const systemDark = state.mode === "system" ? getSystemDark() : false;
  const snapshotKey = `${serializeThemeState(state)}|${systemDark ? "dark" : "light"}`;

  if (lastSnapshot && lastSnapshotKey === snapshotKey) {
    return lastSnapshot;
  }

  lastSnapshotKey = snapshotKey;
  lastSnapshot = { state, systemDark };
  return lastSnapshot;
}

function updateStoredThemeState(update: (state: ThemeState) => ThemeState) {
  const nextState = update(readStoredThemeState());
  try {
    writeStoredThemeState(nextState);
  } catch (cause) {
    logThemeStorageError(cause, "write", nextState.mode);
    return;
  }
  applyThemeState(nextState, true);
  emitChange();
}

export function setThemePreference(next: ThemePreference) {
  updateStoredThemeState((state) => ({
    ...state,
    mode: next,
  }));
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.push(listener);

  const mediaQuery =
    typeof window.matchMedia === "function" ? window.matchMedia(MEDIA_QUERY) : null;
  const handleMediaChange = () => {
    const state = readStoredThemeState();
    if (state.mode === "system") {
      applyThemeState(state, true);
    }
    emitChange();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }
    applyThemeState(readStoredThemeState(), true);
    emitChange();
  };

  mediaQuery?.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners = listeners.filter((currentListener) => currentListener !== listener);
    mediaQuery?.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function ensureThemeColorMetaTag(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>(DYNAMIC_THEME_COLOR_SELECTOR);
  if (element) {
    return element;
  }

  element = document.createElement("meta");
  element.name = THEME_COLOR_META_NAME;
  element.setAttribute("data-dynamic-theme-color", "true");
  document.head.append(element);
  return element;
}

function normalizeThemeColor(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return null;
  }

  return value?.trim() ?? null;
}

function resolveBrowserChromeSurface(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']") ??
    document.querySelector<HTMLElement>("[data-slot='sidebar-inner']") ??
    document.body
  );
}

export function syncBrowserChromeTheme() {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") {
    return;
  }

  const surfaceColor = normalizeThemeColor(
    getComputedStyle(resolveBrowserChromeSurface()).backgroundColor,
  );
  const fallbackColor = normalizeThemeColor(getComputedStyle(document.body).backgroundColor);
  const backgroundColor = surfaceColor ?? fallbackColor;
  if (!backgroundColor) {
    return;
  }

  document.documentElement.style.backgroundColor = backgroundColor;
  document.body.style.backgroundColor = backgroundColor;
  ensureThemeColorMetaTag().setAttribute("content", backgroundColor);
}

function applyThemeState(state: ThemeState, suppressTransitions = false) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const root = document.documentElement;
  if (suppressTransitions) {
    root.classList.add("no-transitions");
  }

  const variant = resolveThemeVariant(state.mode, getSystemDark());
  const activeTheme = resolveThemePack(state, variant);
  const cssVariableBuild = buildThemeCssVariables(activeTheme, variant, {
    electron: isElectron,
  });

  root.classList.toggle("dark", variant === "dark");
  root.dataset.codeThemeId = activeTheme.codeThemeId;
  root.dataset.themeMode = state.mode;
  root.dataset.themeVariant = variant;
  root.dataset.windowMaterial = cssVariableBuild.material;

  for (const [name, value] of Object.entries(cssVariableBuild.variables)) {
    if (value.trim().length === 0) {
      root.style.removeProperty(name);
      continue;
    }
    root.style.setProperty(name, value);
  }

  syncBrowserChromeTheme();
  syncDesktopTheme(state.mode);

  if (suppressTransitions) {
    // Force a reflow so the no-transitions class takes effect before removal.
    // oxlint-disable-next-line no-unused-expressions
    root.offsetHeight;
    requestAnimationFrame(() => {
      root.classList.remove("no-transitions");
    });
  }
}

export async function syncDesktopThemePreference(
  bridge: DesktopThemeBridge,
  theme: ThemePreference,
): Promise<void> {
  try {
    await bridge.setTheme(theme);
  } catch (cause) {
    throw new DesktopThemeSyncError({ theme, cause });
  }
}

export function syncDesktopTheme(theme: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  const bridge = window.desktopBridge;
  if (!bridge || typeof bridge.setTheme !== "function" || lastDesktopTheme === theme) {
    return;
  }

  lastDesktopTheme = theme;
  void syncDesktopThemePreference(bridge, theme).catch((cause: unknown) => {
    const error = isDesktopThemeSyncError(cause)
      ? cause
      : new DesktopThemeSyncError({ theme, cause });
    console.error(error.message, {
      theme: error.theme,
      ...safeErrorLogAttributes(error),
    });
    if (lastDesktopTheme === theme) {
      lastDesktopTheme = null;
    }
  });
}

if (typeof document !== "undefined") {
  applyThemeState(readStoredThemeState());
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => ({
    state: DEFAULT_THEME_STATE,
    systemDark: false,
  }));
  const theme = snapshot.state.mode;
  const resolvedTheme = resolveThemeVariant(theme, snapshot.systemDark);
  const activeTheme = resolveThemePack(snapshot.state, resolvedTheme);
  const darkTheme = resolveThemePack(snapshot.state, "dark");
  const lightTheme = resolveThemePack(snapshot.state, "light");
  const defaultActiveTheme = resolveThemePack(DEFAULT_THEME_STATE, resolvedTheme);
  const isDefaultActiveTheme = areThemePacksEqual(activeTheme, defaultActiveTheme);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    updateStoredThemeState((state) => ({
      ...state,
      mode: nextTheme,
    }));
  }, []);

  const canImportThemeString = useCallback(
    (value: string, variant: ThemeVariant = resolvedTheme) =>
      canParseThemeShareString(value, variant),
    [resolvedTheme],
  );

  const importThemeString = useCallback(
    (value: string, variant: ThemeVariant = resolvedTheme) => {
      updateStoredThemeState((state) => updateThemePackFromShareString(state, value, variant));
    },
    [resolvedTheme],
  );

  const exportThemeString = useCallback(
    (variant: ThemeVariant = resolvedTheme) =>
      createThemeShareString(variant, resolveThemePack(snapshot.state, variant)),
    [resolvedTheme, snapshot.state],
  );

  const resetActiveTheme = useCallback(() => {
    updateStoredThemeState((state) => resetThemeVariantState(state, resolvedTheme));
  }, [resolvedTheme]);

  const resetThemeVariant = useCallback((variant: ThemeVariant) => {
    updateStoredThemeState((state) => resetThemeVariantState(state, variant));
  }, []);

  const resetAllThemes = useCallback(() => {
    updateStoredThemeState(() => DEFAULT_THEME_STATE);
  }, []);

  const updateThemePack = useCallback((variant: ThemeVariant, patch: Partial<ChromeTheme>) => {
    updateStoredThemeState((state) => updateChromeTheme(state, variant, patch));
  }, []);

  const updateThemeFonts = useCallback((variant: ThemeVariant, patch: Partial<ThemeFonts>) => {
    updateStoredThemeState((state) => setThemeFonts(state, variant, patch));
  }, []);

  const setCodeThemeId = useCallback((variant: ThemeVariant, codeThemeId: string) => {
    updateStoredThemeState((state) => setThemeCodeThemeId(state, variant, codeThemeId));
  }, []);

  const isDefaultThemePack = useCallback(
    (variant: ThemeVariant) =>
      areThemePacksEqual(
        resolveThemePack(snapshot.state, variant),
        resolveThemePack(DEFAULT_THEME_STATE, variant),
      ),
    [snapshot.state],
  );

  useEffect(() => {
    applyThemeState(snapshot.state);
  }, [snapshot.state]);

  return {
    activeTheme,
    canImportThemeString,
    darkTheme,
    defaultActiveTheme,
    exportThemeString,
    importThemeString,
    isDefaultActiveTheme,
    isDefaultThemePack,
    lightTheme,
    resetActiveTheme,
    resetAllThemes,
    resetThemeVariant,
    resolvedTheme,
    setCodeThemeId,
    setTheme,
    theme,
    themeState: snapshot.state,
    updateThemeFonts,
    updateThemePack,
  } as const;
}

export type { ChromeTheme, ThemeFonts, ThemeMode, ThemePack, ThemeState, ThemeVariant };
