const fs = require("fs");
const path = require("path");
const util = require("util");

const Choices = require("inquirer/lib/objects/choices");
const InquirerAutocomplete = require("inquirer-autocomplete-prompt");
const stripAnsi = require("strip-ansi");
const style = require("ansi-styles");
const fuzzy = require("fuzzy");

const readdir_ = util.promisify(fs.readdir);
const maxScanDepth = 2;

/**
 * A customized UI input (A file picker).
 * It's modified from: https://github.com/adelsz/inquirer-fuzzy-path
 * Differences & improvements are:
 * - Support validator
 * - Fixed: cannot handle `ENOENT` correctly
 * - Limit the file searching to 2 level deep to improve the performance
 */
class InquirerFuzzyPath extends InquirerAutocomplete {
    constructor(question, rl, answers) {
        const rootPath = question.rootPath || ".";
        const pathFilter = question.pathFilter || (() => true);
        const _question = Object.assign({}, question, {
            source: (_, pattern) => getPaths(rootPath, pattern, pathFilter)
        });
        super(_question, rl, answers);
    }

    search(searchTerm) {
        return super.search(searchTerm).then(value => {
            this.currentChoices.getChoice = choiceIndex => {
                let choice = Choices.prototype.getChoice.call(
                    this.currentChoices,
                    choiceIndex
                );
                if (!choice) {
                    return null;
                }
                return {
                    value: stripAnsi(choice.value),
                    name: stripAnsi(choice.name),
                    short: stripAnsi(choice.name)
                };
            };
        });
    }

    onSubmit(line) {
        if (typeof this.opt.validate === "function") {
            const choice = this.currentChoices.getChoice(this.selected);
            if (!choice) {
                this.render(
                    "You need to select a file. Make sure the json file is in the current directory or its sub-directory"
                );
                return;
            }
            const validationResult = this.opt.validate(
                this.currentChoices.getChoice(this.selected)
            );
            if (validationResult !== true) {
                this.render(validationResult || "You need to select a file");
                return;
            }
        }
        super.onSubmit(stripAnsi(line));
    }
}

function getPaths(rootPath, pattern, pathFilter) {
    const fuzzOptions = {
        pre: style.green.open,
        post: style.green.close
    };

    function nodeOption(nodePath, isDirectory) {
        return pathFilter(isDirectory, nodePath) ? [nodePath] : [];
    }

    async function listNodes(nodePath, depth = 0) {
        try {
            if (depth >= maxScanDepth) {
                return nodeOption(nodePath, false);
            }
            const nodes = await readdir_(nodePath);
            const currentNode = nodeOption(nodePath, true);
            if (nodes.length > 0) {
                const nodex = nodes.map(dirName =>
                    listNodes(path.join(nodePath, dirName), depth + 1)
                );
                const subNodes = await Promise.all(nodex);
                return subNodes.reduce(
                    (acc, val) => acc.concat(val),
                    currentNode
                );
            } else {
                return currentNode;
            }
        } catch (err) {
            if (err.code === "ENOENT" || err.code === "ENOTDIR") {
                return nodeOption(nodePath, false);
            } else {
                throw err;
            }
        }
    }

    const nodes = listNodes(rootPath);
    const filterPromise = nodes.then(nodeList =>
        fuzzy.filter(pattern || "", nodeList, fuzzOptions).map(e => e.string)
    );
    return filterPromise;
}

module.exports = InquirerFuzzyPath;
