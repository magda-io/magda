import { Command } from "commander";
import { VERSION } from "./version.js";
import { printError, resolveModeFromArgv } from "./output.js";
import { exitCodeFor } from "./errors.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProfileCommands } from "./commands/profileCmd.js";
import { registerSearchCommands } from "./commands/search.js";
import { registerDatasetCommands } from "./commands/dataset.js";
import { registerDistCommands } from "./commands/dist.js";
import { registerApiCommands } from "./commands/api.js";
import { registerFileCommands } from "./commands/file.js";
import { registerAspectCommands } from "./commands/aspect.js";
import { registerSkillsCommands } from "./commands/skills.js";

const program = new Command();

program
    .name("mgd")
    .description("MAGDA local command-line interface")
    .version(VERSION);

registerAuthCommands(program);
registerProfileCommands(program);
registerSearchCommands(program);
registerDatasetCommands(program);
registerDistCommands(program);
registerApiCommands(program);
registerFileCommands(program);
registerAspectCommands(program);
registerSkillsCommands(program);

try {
    await program.parseAsync(process.argv);
} catch (e) {
    printError(e, resolveModeFromArgv(process.argv));
    process.exit(exitCodeFor(e));
}
