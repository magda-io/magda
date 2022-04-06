import Docker from "dockerode";
import DockerCompose from "dockerode-compose";
import path from "path";
import yaml from "js-yaml";
import fs from "fs-extra";
import tempy from "tempy";
import pg from "pg";
import delay from "magda-typescript-common/src/delay";
import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig";

/**
 * Resolve magda module dir path.
 *
 * @param {string} moduleName e.g. @magda/typescript-common
 */
function getMagdaModulePath(moduleName: string) {
    const pkgJsonPath = require.resolve(`${moduleName}/package.json`);
    return path.dirname(pkgJsonPath);
}

function createTmpDockerComposeFile(filePath: string, image: string) {
    if (!image) {
        throw new Error(
            "createTmpDockerComposeFile: Invalid empty image parameter."
        );
    }
    const composeConfig = yaml.load(fs.readFileSync(filePath, "utf8")) as any;
    if (
        !composeConfig?.services ||
        typeof composeConfig.services !== "object"
    ) {
        throw new Error("Invalid Docker Compose file: can't find any services");
    }
    const serviceKeys = Object.keys(composeConfig.services);
    if (!serviceKeys?.length) {
        throw new Error("Invalid Docker Compose file: empty services");
    }
    composeConfig.services[serviceKeys[0]].image = image;
    const newConfigFile = tempy.file({ extension: "yaml" });
    fs.writeFileSync(newConfigFile, yaml.dump(composeConfig));
    return newConfigFile;
}

/**
 * Class to setup env to run Auth related test case. The following components will be run:
 * - PostgreSQL
 * - DB migrators. initialise auth DB, registry DB
 * - Auth API
 * - OPA
 *
 * This class will also provide helper methods to run the followings:
 * - registry api
 * - Elasticsearch
 * - search API
 * - minio
 * - storage API
 *
 * When the env is no longer required, the `destroy` method should be called to clean up all resources.
 * Please note: in CI, this class requires dind (Docker in Docker)
 *
 * @class AuthServiceRunner
 */
export default class AuthServiceRunner {
    public readonly docker: Docker;
    public appImgRegistry: string = "localhost:5000/data61";
    public appImgTag: string = "latest";
    public publicImgRegistry: string = "docker.io/data61";
    public publicImgTag: string = "latest";

    private postgresCompose: DockerCompose;

    constructor() {
        // docker config should be passed via env vars e.g.
        // DOCKER_HOST, DOCKER_TLS_VERIFY, DOCKER_CLIENT_TIMEOUT & DOCKER_CERT_PATH
        // our gitlab pipeline already setup in this way.
        this.docker = new Docker();
    }

    async create() {
        await this.docker.info();

        await this.createPostgres();
    }

    async destroy() {
        await this.destroyPostgres();
    }

    async testAlivePostgres() {
        const dbConfig = getTestDBConfig() as any;
        dbConfig.database = "postgres";
        const client = new pg.Client(dbConfig);
        await client.connect();
        const result = await client.query("SELECT NOW()");
        if (!result?.rows?.length) {
            throw new Error("no query result returned.");
        }
        await client.end();
        return true;
    }

    async waitAlive(
        serviceName: string,
        func: () => Promise<any>,
        waitTime: number = 25000
    ) {
        if (waitTime <= 0) {
            throw new Error(`waitAlive: Invalid wait time: ${waitTime}`);
        }
        const startTime = new Date().getTime();
        while (true) {
            try {
                await func();
                console.log(`${serviceName} is online....`);
                return;
            } catch (e) {
                console.log(`${serviceName} is still offline: ${e}`);
                const curTime = new Date().getTime();
                if (curTime - startTime >= waitTime) {
                    throw new Error(
                        `${serviceName} is failed to get online in ${
                            waitTime / 1000
                        }s`
                    );
                }
                await delay(1000);
            }
        }
    }

    async createPostgres() {
        const baseDir = getMagdaModulePath("@magda/postgres");
        const dockerComposeFile = createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            `${this.appImgRegistry}/magda-postgres:${this.appImgTag}`
        );
        this.postgresCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-postgres"
        );
        try {
            await this.postgresCompose.down({ volumes: true });
            await this.postgresCompose.up();
            await this.waitAlive("Postgres", this.testAlivePostgres);
        } catch (e) {
            await this.destroyPostgres();
            throw e;
        }
    }

    async destroyPostgres() {
        if (this.postgresCompose) {
            await this.postgresCompose.down({ volumes: true });
        }
    }
}
