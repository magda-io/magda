import { config } from "../config.js";

export default async function addDynamicContent() {
    const response = await fetch(`${config.contentApiURL}includeHtml.text`);

    if (response.status === 200) {
        const text = await response.text();
        document.write(text);
    }
}
