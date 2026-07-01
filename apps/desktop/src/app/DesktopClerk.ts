import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class DesktopClerk extends Context.Service<
  DesktopClerk,
  {
    readonly configure: Effect.Effect<void>;
  }
>()("@t3tools/desktop/app/DesktopClerk") {}

export function resolveDesktopClerkFrontendApiHostname(_publishableKey: string): undefined {
  return undefined;
}

export const desktopClerkFrontendApiHostname = undefined;

export function createDesktopClerkBridge(_stateDir: string, _isDevelopment: boolean): null {
  return null;
}

export const make = Effect.succeed(
  DesktopClerk.of({
    configure: Effect.void,
  }),
);

export const layer = Layer.effect(DesktopClerk, make);
