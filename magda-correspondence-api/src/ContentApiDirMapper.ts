import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import fetch from "node-fetch";
import mime from "mime-types";
import recursiveReadDir from "recursive-readdir";
import fse from "fs-extra";
import path from "path";
import typeis from "type-is";
import { Buffer } from "node:buffer";

/**
 * A Class attempt to create an abstract access layer between content API and local directory
 */
class ContentApiDirMapper {
    public url: string;
    public userId: string;
    private jwtSecret: string;

    /**
     *
     * @param url string: Content API url access url
     * @param userId string: Admin user ID (for uploading resources to content API)
     * @param jwtSecret string: JWT secrets (for uploading resources to content API)
     */
    constructor(url: string, userId: string = "", jwtSecret: string = "") {
        this.url = url;
        this.userId = userId;
        this.jwtSecret = jwtSecret;
        if (this.url === "") {
            throw new Error(
                "ContentApiDirMapper: content API URL cannot be empty!"
            );
        }
    }

    /**
     * Get resource from content API by localPath.
     * Will return string or Buffer depends `content-type` header
     * @param localPath string: local directory path. e.g.: emailTemplates/assets/top-left-logo.jpg
     */
    public async getFileContent<T = any>(localPath: string): Promise<T> {
        const res = await fetch(`${this.url}/${localPath}`);
        if (!res.ok) {
            throw new Error(
                `Failed to get file content from ${this.url}/${localPath}: ${res.status} ${res.statusText}`
            );
        }
        const contentType = res.headers.get("content-type");
        if (typeis.is(contentType, ["text/*"])) {
            return (await res.text()) as T;
        }
        return Buffer.from(await res.arrayBuffer()) as T;
    }

    /**
     * Upload a local content to content API.
     * @param localPath string: local path of the resource. e.g. emailTemplates/assets/top-left-logo.jpg
     * @param fileContent string or Buffer. Require string for text content, otherwise Buffer is required.
     */
    public async saveFile(localPath: string, fileContent: Buffer) {
        let mimeType = mime.lookup(localPath);
        if (mimeType === false) {
            mimeType = "application/octet-stream";
        }
        return await fetch(`${this.url}/${localPath}`, {
            method: "PUT",
            headers: {
                "X-Magda-Session": buildJwt(this.jwtSecret, this.userId),
                "Content-type": mimeType
            },
            body: fileContent
        });
    }

    /**
     * Test if a resource specified by the `localPath` is available on content API
     * This function is done via express build-in HEAD request handling
     * @param localPath string: local path of the resource. e.g. emailTemplates/assets/top-left-logo.jpg
     */
    public async fileExist(localPath: string) {
        const res = await fetch(`${this.url}/${localPath}`, {
            method: "HEAD"
        });
        if (!res.ok) {
            if (res.status !== 404) {
                throw new Error(
                    `Failed to check file existence from ${this.url}/${localPath}: ${res.status} ${res.statusText}`
                );
            }
            return false;
        } else return true;
    }

    /**
     * Sync (i.e. upload all files in a local directory if not exist) a local directory with a target directory on content API.
     * If a resource already exists, it will NOT be overwritten.
     * @param localFolderPath string: Local directory path. e.g. ./emailTemplates
     * @param remoteFolerName string: Optional. If not specify, the function will attempt to sync with a directory with the same name.
     */
    public async syncFolder(
        localFolderPath: string,
        remoteFolerName: string = ""
    ) {
        const absLocalFolderPath = path.resolve(localFolderPath);
        let targetRemoteFolderName = remoteFolerName;
        if (remoteFolerName === "") {
            targetRemoteFolderName = path.basename(absLocalFolderPath);
        }
        const files = await recursiveReadDir(localFolderPath);
        if (!files || !files.length) {
            return [[], []];
        }
        const skippedFiles = [];
        for (let i = 0; i < files.length; i++) {
            const fileRemoteLocalPath = `${targetRemoteFolderName}${files[
                i
            ].replace(absLocalFolderPath, "")}`;
            const checkFile = await this.fileExist(fileRemoteLocalPath);
            if (checkFile) {
                skippedFiles.push(fileRemoteLocalPath);
                continue;
            }
            const fileContent = await fse.readFile(`${files[i]}`);
            await this.saveFile(fileRemoteLocalPath, fileContent);
        }
        return [files, skippedFiles];
    }
}

export default ContentApiDirMapper;
