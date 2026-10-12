/**
 * Node.js server helpers. `@hum/core/server` is the entry production server
 * bundles use; it depends on `@hono/node-server`.
 */
import {
  getRequestListener,
  serve as nodeServe,
  type ServerType,
} from "@hono/node-server";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { HumApp } from "../app.js";

export interface ServeOptions {
  port?: number;
  hostname?: string;
  /** Called once the server starts listening. */
  onListen?: (info: { port: number; address: string }) => void;
}

/** Converts a Hum app into a Node request listener. */
export function createListener(
  app: HumApp,
): (req: IncomingMessage, res: ServerResponse) => void {
  return getRequestListener(app.fetch);
}

/** Starts an HTTP server for a Hum app. */
export function serve(app: HumApp, options: ServeOptions = {}): ServerType {
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const hostname = options.hostname ?? process.env.HOST ?? "0.0.0.0";

  return nodeServe(
    {
      fetch: app.fetch,
      port,
      hostname,
      overrideGlobalObjects: false,
    },
    (info) => {
      if (options.onListen !== undefined) {
        options.onListen({ port: info.port, address: info.address });
        return;
      }
      console.log(
        `hum: listening on http://localhost:${info.port}`,
      );
    },
  );
}

export { getRequestListener };
