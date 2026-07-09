import { MgdApiError } from "./errors.js";

export type OutputMode = "human" | "json" | "jsonl";

export function resolveMode(opts: {
    json?: boolean;
    jsonl?: boolean;
}): OutputMode {
    if (opts?.jsonl) return "jsonl";
    if (opts?.json) return "json";
    return "human";
}

// The --json/--jsonl flags live on subcommands, so the top-level error
// handler cannot read them from the root program's opts. Derive the mode
// straight from argv so errors honor the same output contract as data.
export function resolveModeFromArgv(argv: readonly string[]): OutputMode {
    if (argv.includes("--jsonl")) return "jsonl";
    if (argv.includes("--json")) return "json";
    return "human";
}

export function printData(
    mode: OutputMode,
    data: unknown,
    items?: unknown[]
): void {
    if (mode === "json") {
        process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    } else if (mode === "jsonl") {
        const list = items ?? (Array.isArray(data) ? data : [data]);
        for (const item of list) {
            process.stdout.write(JSON.stringify(item) + "\n");
        }
    }
    // human mode: commands print their own layout
}

export function printError(e: unknown, mode: OutputMode): void {
    if (mode === "json" || mode === "jsonl") {
        const error =
            e instanceof MgdApiError
                ? {
                      code: e.code,
                      message: e.message,
                      status: e.status,
                      ...(e.hint ? { hint: e.hint } : {})
                  }
                : {
                      code: "error",
                      message: e instanceof Error ? e.message : String(e)
                  };
        process.stderr.write(JSON.stringify({ error }) + "\n");
    } else {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(colors.red(`Error: ${msg}`) + "\n");
        if (e instanceof MgdApiError && e.hint) {
            process.stderr.write(colors.dim(`Hint: ${e.hint}`) + "\n");
        }
    }
}

export function note(msg: string): void {
    process.stderr.write(msg + "\n");
}

const useColor = !process.env.NO_COLOR && process.stderr.isTTY;

function wrap(open: number, close: number) {
    return (s: string) => (useColor ? `[${open}m${s}[${close}m` : s);
}

export const colors = {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39)
};
