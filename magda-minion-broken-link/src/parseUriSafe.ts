import * as URI from "urijs";

export default function parseUriSafe(url: string): uri.URI | undefined {
    try {
        return new URI(url);
    } catch (e) {
        return undefined;
    }
}
