import fs from "fs";

export async function deleteTempFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("Error deleting file");
            }
        });
    }
}
