import fs from "fs";

export async function deleteTempFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        try {
            await fs.promises.unlink(filePath);
        } catch {
            console.error("Error deleting file");
        }
    }
}
