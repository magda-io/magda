import treeKillSync from "@magda/tree-kill";

async function treeKill(
    pid: number,
    signal: string | number = "SIGTERM"
): Promise<void> {
    return new Promise((resolve, reject) => {
        treeKillSync(pid, signal, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

export default treeKill;
