import readline from "node:readline/promises";

export async function promptText(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr
    });
    try {
        return (await rl.question(question)).trim();
    } finally {
        rl.close();
    }
}

export async function promptHidden(question: string): Promise<string> {
    if (!process.stdin.isTTY) {
        process.stderr.write(
            "Warning: stdin is not a TTY; input will be visible.\n"
        );
        return promptText(question);
    }
    process.stderr.write(question);
    return new Promise((resolve, reject) => {
        const chars: string[] = [];
        const stdin = process.stdin;
        stdin.setRawMode(true);
        stdin.resume();
        const onData = (buf: Buffer) => {
            const c = buf.toString("utf8");
            if (c === "\r" || c === "\n" || c === "") {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.off("data", onData);
                process.stderr.write("\n");
                resolve(chars.join("").trim());
            } else if (c === "") {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.off("data", onData);
                process.stderr.write("\n");
                reject(new Error("Input cancelled."));
            } else if (c === "" || c === "\b") {
                chars.pop();
            } else {
                chars.push(c);
            }
        };
        stdin.on("data", onData);
    });
}
