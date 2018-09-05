import MinionOptions from "./MinionOptions";

export default function getHookUrl(options: MinionOptions) {
    return `${options.argv.internalUrl}/hook`;
}
