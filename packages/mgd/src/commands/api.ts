import fs from "node:fs/promises";
import { Command } from "commander";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { clientFromProfile } from "../client.js";
import { UsageError } from "../errors.js";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

async function readBody(opts: {
    body?: string;
    bodyFile?: string;
}): Promise<string | undefined> {
    if (opts.bodyFile === "-") {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks).toString("utf8");
    }
    if (opts.bodyFile) return fs.readFile(opts.bodyFile, "utf8");
    return opts.body;
}

export function registerApiCommands(program: Command): void {
    const api = program.command("api").description("Raw API access");

    api.command("request <method> <path>")
        .description("Send an authenticated request to a documented MAGDA API")
        .option("--query <k=v...>", "query parameter (repeatable)", collect, [])
        .option("--body <json>", "inline request body")
        .option(
            "--body-file <path>",
            "read request body from file, - for stdin"
        )
        .option("--content-type <ct>", "request content type")
        .option("--json", "(default for JSON responses)")
        .action(async (methodArg: string, path: string, opts) => {
            const method = methodArg.toUpperCase();
            if (!METHODS.has(method)) {
                throw new UsageError(`Unsupported method: ${methodArg}`);
            }
            if (!path.startsWith("/")) {
                throw new UsageError(
                    `Path must start with "/" (got: ${path}). Example: /v0/registry/records`
                );
            }
            const client = await clientFromProfile();
            const body = await readBody(opts);
            const query: [string, string][] = (opts.query as string[]).map(
                (pair: string) => {
                    const idx = pair.indexOf("=");
                    if (idx < 1) {
                        throw new UsageError(
                            `--query must be k=v (got: ${pair})`
                        );
                    }
                    return [pair.slice(0, idx), pair.slice(idx + 1)];
                }
            );
            const res = await client.request(method, path, {
                query,
                body,
                headers: body
                    ? {
                          "content-type": opts.contentType || "application/json"
                      }
                    : opts.contentType
                    ? { "content-type": opts.contentType }
                    : undefined
            });
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("json")) {
                const data = await res.json();
                process.stdout.write(JSON.stringify(data, null, 2) + "\n");
            } else if (res.body) {
                await pipeline(
                    Readable.fromWeb(res.body as any),
                    process.stdout
                );
            }
        });
}

function collect(value: string, previous: string[]): string[] {
    return [...previous, value];
}
