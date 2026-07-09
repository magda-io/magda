export function captureStdout(fn: () => Promise<unknown>): Promise<string> {
    const orig = process.stdout.write;
    let out = "";
    (process.stdout as any).write = (chunk: any) => {
        out += String(chunk);
        return true;
    };
    return fn().then(
        () => {
            process.stdout.write = orig;
            return out;
        },
        (e) => {
            process.stdout.write = orig;
            throw e;
        }
    );
}
