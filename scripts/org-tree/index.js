#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");

program
    .version(pkg.version)
    .description(
        `A tool for managing magda authentication & access control data. Version: ${pkg.version}\n\n` +
            `If a database connection is required, the following environment variables will be used to create a connection:\n` +
            `  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.\n` +
            `  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.\n` +
            `  POSTGRES_PORT: database port; If not available in env var, 5432 will be used.\n` +
            `  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.\n` +
            `  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.`
    )
    .command("view", "\n\tDisplay the entire tree in text .\n")
    .command(
        "create <rootNodeName>",
        "\n\tCreate a root tree node with specified name.\n"
    )
    .command(
        "insert <parentNodeNameOrId> <nodeName>",
        "\n\tInsert a node as a child node of the specified the parent node with specified name. \n" +
            "\tIf the parent node name is given instead of the parent node Id, the newly created child node will be inserted to the first located parent node.\n"
    )
    .command(
        "delete <nodeNameOrId> -o, --only",
        "\n\tDelete the node specified and all its dependents from the tree. \n" +
            "\tIf the node name is given instead of the node Id, the first located node (and its dependents) will be removed.\n"
    )
    .command(
        "move <nodeNameOrId> <parentNodeNameOrId>",
        "\n\tMove the node specified and all its dependents to the specified parent node. \n" +
            "\tIf the node name is given instead of the node Id, the first located node (and its dependents) will be moved.\n" +
            "\tIf the parent node name is given instead of the parent node Id, the specifed node will be moved to the first located parent node.\n"
    )
    .command(
        "assign <userNameOrId> <nodeNameOrId>",
        "\n\tAssign the specified user to the nominated node. \n" +
            "\tBoth `userNameOrId` & `nodeNameOrId` can be either entity name or Id.\n" +
            "\tIf more than one entities are located by entity name, the first one will be used."
    )
    .command(
        "unassign <userNameOrId>",
        "\n\tAssign the specified user from any node"
    )
    .on("command:*", function (cmds) {
        if (
            [
                "view",
                "create",
                "insert",
                "delete",
                "move",
                "assign",
                "unassign"
            ].indexOf(cmds[0]) === -1
        ) {
            console.error(
                chalk.red(
                    `Invalid command: ${program.args.join(
                        " "
                    )}\nSee --help for a list of available commands.`
                )
            );
            process.exit(1);
        }
    })
    .parse(process.argv);
