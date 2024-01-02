import MinionOptions from "./MinionOptions.js";

export default function getHookUrl(options: MinionOptions) {
    return `${options.argv.internalUrl}/hook`;
}
