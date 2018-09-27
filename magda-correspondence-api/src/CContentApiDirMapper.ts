import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import * as rp from "request-promise-native";
import * as mime from "mime-types";
import * as recursiveReadDir from "recursive-readdir";
import * as fse from "fs-extra";
import * as path from "path";

class CContentApiDirMapper {
    public url: string;
    public userId: string;
    private jwtSecret: string;

    constructor(url: string, userId: string = "", jwtSecret: string = "") {
        this.url = url;
        this.userId = userId;
        this.jwtSecret = jwtSecret;
        if (this.url === "") {
            throw new Error(
                "CContentApiDirMapper: content API URL canot be empty!"
            );
        }
    }

    public async getFileContent(localPath: string) {
        return await rp.get(`${this.url}/commonAssets/${localPath}`);
    }

    public async saveFile(localPath: string, fileContent: Buffer) {
        let mimeType = mime.lookup(localPath);
        if (mimeType === false) {
            mimeType = "application/octet-stream";
        }
        return await rp(`${this.url}/commonAssets/${localPath}`, {
            method: "POST",
            resolveWithFullResponse: true,
            headers: {
                "X-Magda-Session": buildJwt(this.jwtSecret, this.userId),
                "Content-type": mimeType
            },
            body: fileContent
        });
    }

    public async syncFolder(
        localFolderPath: string,
        remoteFolerName: string = ""
    ) {
        const absLocalFolderPath = path.resolve(localFolderPath);
        let targetRemoteFolderName = remoteFolerName;
        if (remoteFolerName === "") {
            targetRemoteFolderName = path.basename(absLocalFolderPath);
        }
        const files = await recursiveReadDir(localFolderPath, [
            (file, stats) => {
                if (stats.isDirectory()) {
                    return true;
                }
                return false;
            }
        ]);
        if (!files || !files.length) {
            return;
        }
        for (let i = 0; i < files.length; i++) {
            const fileContent = await fse.readFile(`${files[i]}`);
            await this.saveFile(
                `${targetRemoteFolderName}${files[i].replace(
                    absLocalFolderPath,
                    ""
                )}`,
                fileContent
            );
        }
    }
}

export default CContentApiDirMapper;
