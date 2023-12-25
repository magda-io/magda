import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { argv } from "node:process";
import { createRequire } from "node:module";
import callerPath from "caller-path";

/**
 * Allow to require modules relative to the caller file.
 * require() is not support in ESM modules. This function provides a workaround when you have to use require() in ESM modules.
 * e.g. use to load JSON files.
 * Or use to load legacy commonjs modules where formal `import` syntax is not convenient.
 * e.g. load legacy commonjs modules without type definition files.
 *
 * Please note: before use this function, you should try to use `import` syntax whenever possible.
 *
 * @param {string} id
 * @return {*}  {*}
 */
export function require(id: string): any {
    const requireFrom = createRequire(callerPath({ depth: 1 }));
    return requireFrom(id);
}

export function requireResolve(id: string): string {
    const requireFrom = createRequire(callerPath({ depth: 1 }));
    return requireFrom.resolve(id);
}

/**
 * This is an ESM replacement for `__filename`.
 *
 * Use it like this: `__filename()`.
 */
export const __filename = (): string => fileURLToPath(callerPath({ depth: 1 }));

/**
 * This is an ESM replacement for `__dirname`.
 *
 * Use it like this: `__dirname()`.
 */
export const __dirname = (): string =>
    dirname(fileURLToPath(callerPath({ depth: 1 })));

/**
 * Indicates that the script was run directly.
 * This is an ESM replacement for `require.main === module`.
 *
 * Use it like this: `isMain()`.
 */
export const isMain = (): boolean => {
    if (!argv[1]) return false;
    const currentPath = callerPath({ depth: 1 });
    const require = createRequire(currentPath);
    const scriptPath = require.resolve(argv[1]);
    // get file path of caller module path
    const modulePath = fileURLToPath(currentPath);
    return scriptPath === modulePath;
};
