import SleutherOptions from "./SleutherOptions";

export default function getHookUrl(options: SleutherOptions) {
    return `${options.argv.internalUrl}/hook`;
}
