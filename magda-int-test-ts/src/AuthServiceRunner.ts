import Docker from "dockerode";
import DockerCompose from "dockerode-compose";
import ServerError from "magda-typescript-common/src/ServerError";
import delay from "magda-typescript-common/src/delay";
import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig";
import path from "path";
import { v4 as uuidV4 } from "uuid";
import yaml from "js-yaml";
import fs from "fs-extra";
import tempy from "tempy";
import pg from "pg";
import fetch from "isomorphic-fetch";

/**
 * Resolve magda module dir path.
 *
 * @param {string} moduleName e.g. @magda/typescript-common
 */
function getMagdaModulePath(moduleName: string) {
    const pkgJsonPath = require.resolve(`${moduleName}/package.json`);
    return path.dirname(pkgJsonPath);
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

    private tmpFiles: string[] = [];

    private postgresCompose: DockerCompose;
    private elasticSearchCompose: DockerCompose;
    private opaCompose: DockerCompose;

    public readonly workspaceRoot: string;

    public enableElasticSearch = false;

    constructor() {
        // docker config should be passed via env vars e.g.
        // DOCKER_HOST, DOCKER_TLS_VERIFY, DOCKER_CLIENT_TIMEOUT & DOCKER_CERT_PATH
        // our gitlab pipeline already setup in this way.
        this.docker = new Docker();
        this.workspaceRoot = path.resolve(
            path.dirname(
                require.resolve("@magda/typescript-common/package.json")
            ),
            "../"
        );
    }

    async create() {
        await this.docker.info();

        await Promise.all([
            this.createOpa(),
            async () => {
                await this.createPostgres();
                await Promise.all([
                    this.runMigrator("authorization-db", "auth"),
                    this.runMigrator("content-db", "content"),
                    this.runMigrator("registry-db", "postgres"),
                    this.runMigrator("session-db", "session"),
                    this.runMigrator("tenant-db", "tenant")
                ]);
            }
        ]);
        if (this.enableElasticSearch) {
            await this.createElasticSearch();
        }
    }

    async destroy() {
        for (const file of this.tmpFiles) {
            fs.unlinkSync(file);
        }
        await Promise.all([this.destroyPostgres(), this.destroyOpa()]);
        if (this.enableElasticSearch) {
            await this.destroyElasticSearch();
        }
    }

    async runMigrator(name: string, dbName: string) {
        const volBind = `${this.workspaceRoot}/magda-migrator-${name}/sql:/flyway/sql/${dbName}`;
        await this.docker.run(
            "data61/magda-db-migrator:master",
            undefined,
            process.stdout,
            {
                HostConfig: {
                    Binds: [volBind],
                    NetworkMode: "host"
                },
                Env: [
                    "DB_HOST=localhost",
                    "PGUSER=postgres",
                    "PGPASSWORD=password",
                    "CLIENT_USERNAME=client",
                    "CLIENT_PASSWORD=password"
                ]
            }
        );
    }

    async createOpa() {
        const baseDir = getMagdaModulePath("@magda/opa");
        const dockerComposeFile = this.createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            undefined
        );
        this.opaCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-opa"
        );
        try {
            await Promise.all([
                this.opaCompose.down({ volumes: true }),
                this.opaCompose.pull()
            ]);
            await this.opaCompose.up();
            await this.waitAlive("OPA", async () => {
                const res = await fetch("http://localhost:8181/health");
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                await res.json();
                return true;
            });
        } catch (e) {
            await this.destroyOpa();
            throw e;
        }
    }

    async destroyOpa() {
        if (this.opaCompose) {
            await this.opaCompose.down({ volumes: true });
        }
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
        waitTime: number = 30000
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
        const dockerComposeFile = this.createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            undefined
        );
        this.postgresCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-postgres"
        );
        try {
            await Promise.all([
                this.postgresCompose.down({ volumes: true }),
                this.postgresCompose.pull()
            ]);
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

    async createElasticSearch() {
        const baseDir = getMagdaModulePath("@magda/elastic-search");
        const dockerComposeFile = this.createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            `${this.appImgRegistry}/magda-elasticsearch:${this.appImgTag}`,
            true,
            (config) => {
                delete config.services["test-es"].volumes;
                delete config.services["test-es"].entrypoint;
            }
        );

        this.elasticSearchCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-es"
        );
        try {
            await Promise.all([
                this.elasticSearchCompose.down({ volumes: true }),
                this.elasticSearchCompose.pull()
            ]);
            await this.elasticSearchCompose.up();
            await this.waitAlive(
                "ElasticSearch",
                async () => {
                    const res = await fetch(
                        "http://localhost:9200/_cluster/health"
                    );
                    if (res.status !== 200) {
                        throw new ServerError(
                            `${res.statusText}. ${await res.text()}`
                        );
                    }
                    const data = await res.json();
                    if (data?.status !== "green") {
                        throw new Error(
                            `The cluster is in ${data?.status} status.`
                        );
                    }
                    return true;
                },
                60000
            );
        } catch (e) {
            await this.destroyElasticSearch();
            throw e;
        }
    }

    async destroyElasticSearch() {
        if (this.elasticSearchCompose) {
            await this.elasticSearchCompose.down({ volumes: true });
        }
    }

    /**
     * Create a copy of the docker compose file provided with service's image field replaced.
     * When `useSameDir`, the new config file will be created in the same directory.
     *
     * @param {string} filePath
     * @param {string} [image]
     * @param {boolean} [useSameDir=false]
     * @param {(configData: any) => any} [configDataUpdater]
     * @return {*}
     * @memberof AuthServiceRunner
     */
    createTmpDockerComposeFile(
        filePath: string,
        image?: string,
        useSameDir = false,
        configDataUpdater?: (configData: any) => any
    ) {
        if (!image && !configDataUpdater) {
            return filePath;
        }

        const composeConfig = yaml.load(
            fs.readFileSync(filePath, "utf8")
        ) as any;

        if (image) {
            if (
                !composeConfig?.services ||
                typeof composeConfig.services !== "object"
            ) {
                throw new Error(
                    "Invalid Docker Compose file: can't find any services"
                );
            }
            const serviceKeys = Object.keys(composeConfig.services);
            if (!serviceKeys?.length) {
                throw new Error("Invalid Docker Compose file: empty services");
            }
            composeConfig.services[serviceKeys[0]].image = image;
        }

        if (configDataUpdater) {
            configDataUpdater(composeConfig);
        }

        let newConfigFile: string;
        if (useSameDir) {
            newConfigFile = path.resolve(
                path.dirname(filePath),
                `${uuidV4()}.yaml`
            );
        } else {
            newConfigFile = tempy.file({ extension: "yaml" });
        }
        fs.writeFileSync(newConfigFile, yaml.dump(composeConfig));
        this.tmpFiles.push(newConfigFile);
        return newConfigFile;
    }
}
