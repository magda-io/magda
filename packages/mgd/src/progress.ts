export interface Progress {
    update: (done: number, total?: number) => void;
    done: () => void;
}

export function makeProgress(label: string): Progress {
    if (!process.stderr.isTTY || process.env.NO_COLOR) {
        return { update: () => {}, done: () => {} };
    }
    let lastRender = 0;
    return {
        update(done, total) {
            const now = Date.now();
            if (now - lastRender < 100) return;
            lastRender = now;
            const totalStr = total ? `/${formatBytes(total)}` : "";
            process.stderr.write(
                `\r${label}: ${formatBytes(done)}${totalStr}   `
            );
        },
        done() {
            process.stderr.write("\r\x1b[2K");
        }
    };
}

export function formatBytes(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
    return `${(n / 1024 ** 3).toFixed(2)}GB`;
}
