import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const VERSION: string = require("../package.json").version;
