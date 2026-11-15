import type { ConvexReactClient } from "convex/react";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { O21ConvexClient } from "./convexAdapter.js";

/** The part of ConvexReactClient the bridge uses (lets tests pass a fake). */
export type BridgeableClient = Pick<ConvexReactClient, "watchQuery" | "mutation">;

/**
 * The Olympus 21 adapter was written for `ConvexClient` from `convex/browser`
 * (`onUpdate(name, args, onValue, onError)` + `mutation(name, args)`). The
 * arcade has one client, the ConvexReactClient that ConvexAuthProvider signs in,
 * so this gives it that shape instead of opening a second, signed-out client.
 */
export function bridgeReactClient(client: BridgeableClient): O21ConvexClient {
  return {
    onUpdate(name, args, onValue, onError) {
      const ref = makeFunctionReference<"query">(name) as FunctionReference<"query">;
      const watch = client.watchQuery(ref, args);
      const deliver = () => {
        let value: unknown;
        try {
          value = watch.localQueryResult();
        } catch (error) {
          onError?.(error);
          return;
        }
        // undefined = still loading; the adapter waits for the first real answer.
        if (value !== undefined) onValue(value);
      };
      const unsubscribe = watch.onUpdate(deliver);
      // A result already in the client's cache doesn't fire onUpdate again.
      deliver();
      return unsubscribe;
    },
    mutation(name, args) {
      const ref = makeFunctionReference<"mutation">(name) as FunctionReference<"mutation">;
      return client.mutation(ref, args);
    },
  };
}
