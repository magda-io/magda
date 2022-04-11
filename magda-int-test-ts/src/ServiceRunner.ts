import Docker, { Container } from "dockerode";
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
import child_process, { ChildProcess } from "child_process";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";

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
 * @class ServiceRunner
 */
export default class ServiceRunner {
    public readonly docker: Docker;
    public appImgRegistry: string = "localhost:5000/data61";
    public appImgTag: string = "latest";
    public publicImgRegistry: string = "docker.io/data61";
    public publicImgTag: string = "latest";

    public projectNameSuffix: string = Math.ceil(
        Math.random() * 10000
    ).toString();

    private tmpFiles: string[] = [];

    private postgresCompose: DockerCompose;
    private elasticSearchCompose: DockerCompose;
    private opaCompose: DockerCompose;
    private authApiProcess: ChildProcess;
    private registryApiProcess: ChildProcess;
    private aspectMigratorProcess: ChildProcess;

    public readonly workspaceRoot: string;

    public enableElasticSearch = false;
    public enableAuthService = true;
    public enableRegistryApi = false;

    public jwtSecret: string = uuidV4();
    public authApiDebugMode = false;
    public authApiSkipAuth = false;

    public sbtPath: string = "";

    // default: wait for service online within 5 mins
    public maxWaitLiveTime: number = 300000;

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

        if (this.enableAuthService) {
            await Promise.all([this.createOpa(), this.createPostgres()]);
            await this.createAuthApi();
        }

        if (this.enableRegistryApi) {
            await this.createRegistryApi();
        }

        if (this.enableElasticSearch) {
            await this.createElasticSearch();
        }
    }

    async destroy() {
        for (const file of this.tmpFiles) {
            fs.unlinkSync(file);
        }
        await Promise.all([
            this.destroyAuthApi(),
            this.destroyPostgres(),
            this.destroyOpa()
        ]);
        if (this.enableRegistryApi) {
            await this.destroyRegistryApi();
            await this.destroyAspectMigrator();
        }
        if (this.enableElasticSearch) {
            await this.destroyElasticSearch();
        }
    }

    getSbtPath() {
        if (this.sbtPath) {
            return this.sbtPath;
        }
        try {
            const sbtPath = child_process.execSync("which sbt", {
                encoding: "utf-8"
            });
            if (sbtPath) {
                this.sbtPath = sbtPath;
                return this.sbtPath;
            } else {
                throw new Error("get empty sbt path.");
            }
        } catch (e) {
            throw new Error(`Failed to get SBT path: ${e}`);
        }
    }

    async runAspectMigrator() {
        const aspectMigratorExecute = `${path.resolve(
            this.workspaceRoot,
            "./magda-migrator-registry-aspects/dist/index.js"
        )}`;
        if (!fs.existsSync(aspectMigratorExecute)) {
            throw new Error(
                `Cannot locate aspect migrator built entrypoint file: ${aspectMigratorExecute}`
            );
        }

        return new Promise((resolve, reject) => {
            const aspectMigratorProcess = child_process.fork(
                aspectMigratorExecute,
                ["--jwtSecret", this.jwtSecret],
                {
                    cwd: path.resolve(
                        this.workspaceRoot,
                        "./magda-migrator-registry-aspects"
                    ),
                    stdio: "inherit",
                    env: {
                        USER_ID: DEFAULT_ADMIN_USER_ID
                    }
                }
            );

            this.aspectMigratorProcess = aspectMigratorProcess;

            aspectMigratorProcess.on("exit", (code) => {
                this.aspectMigratorProcess = undefined;
                console.log(`aspectMigrator exited with code ${code}`);
                if (!code) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            "aspectMigrator exit with non-zero exit code!"
                        )
                    );
                }
            });

            aspectMigratorProcess.on("error", (error) => {
                reject(
                    new Error(`aspectMigrator has thrown an error: ${error}`)
                );
            });
        });
    }

    async destroyAspectMigrator() {
        if (this.aspectMigratorProcess && !this.aspectMigratorProcess.killed) {
            this.aspectMigratorProcess.kill();
        }
    }

    async createRegistryApi() {
        const registryApiProcess = child_process.spawn("sbt ~registryApi/run", {
            cwd: this.workspaceRoot,
            stdio: "inherit",
            shell: true,
            env: {
                ...process.env,
                POSTGRES_PASSWORD: "password",
                JWT_SECRET: this.jwtSecret
            }
        });

        this.registryApiProcess = registryApiProcess;

        registryApiProcess.on("exit", (code) => {
            this.registryApiProcess = undefined;
            console.log(`RegistryAPI exited with code ${code}`);
        });

        registryApiProcess.on("error", (error) => {
            console.error(`RegistryAPI has thrown an error: ${error}`);
        });

        try {
            await this.waitAlive("RegistryApi", async () => {
                const res = await fetch(
                    "http://localhost:6101/v0/status/ready"
                );
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                console.log(await res.text());
                return true;
            });
        } catch (e) {
            await this.destroyRegistryApi();
            throw e;
        }

        await this.runAspectMigrator();
    }

    async destroyRegistryApi() {
        if (this.registryApiProcess && !this.registryApiProcess.killed) {
            this.registryApiProcess.kill();
        }
    }

    async createAuthApi() {
        const authApiExecute = `${path.resolve(
            this.workspaceRoot,
            "./magda-authorization-api/dist/index.js"
        )}`;
        if (!fs.existsSync(authApiExecute)) {
            throw new Error(
                `Cannot locate auth api built entrypoint file: ${authApiExecute}`
            );
        }
        const authApiProcess = child_process.fork(
            authApiExecute,
            [
                "--jwtSecret",
                this.jwtSecret,
                "--debug",
                `${this.authApiDebugMode}`,
                "--skipAuth",
                `${this.authApiSkipAuth}`
            ],
            {
                stdio: "inherit",
                env: {
                    PGUSER: "client",
                    PGPASSWORD: "password"
                }
            }
        );

        this.authApiProcess = authApiProcess;

        authApiProcess.on("exit", (code) => {
            this.authApiProcess = undefined;
            console.log(`AuthApi exited with code ${code}`);
        });

        authApiProcess.on("error", (error) => {
            console.error(`AuthApi has thrown an error: ${error}`);
        });

        try {
            await this.waitAlive("AuthApi", async () => {
                const res = await fetch(
                    "http://localhost:6104/v0/public/users/whoami"
                );
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                await res.json();
                return true;
            });
        } catch (e) {
            await this.destroyAuthApi();
            throw e;
        }
    }

    async destroyAuthApi() {
        if (this.authApiProcess && !this.authApiProcess.killed) {
            this.authApiProcess.kill();
        }
    }

    pullImage(image: string) {
        return new Promise(async (resolve, reject) => {
            const pullStream = await this.docker.pull(image);
            pullStream.pipe(process.stdout);
            pullStream.once("end", resolve);
        });
    }

    async runMigrator(name: string, dbName: string) {
        const mainMigratorImg = "data61/magda-db-migrator:master";
        await this.pullImage(mainMigratorImg);
        const volBind = `${this.workspaceRoot}/magda-migrator-${name}/sql:/flyway/sql/${dbName}`;
        const [, container] = (await this.docker.run(
            mainMigratorImg,
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
        )) as [any, Container];
        const delResult = await container.remove();
        return delResult;
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
        waitTime?: number
    ) {
        if (!waitTime) {
            waitTime = this.maxWaitLiveTime;
        }

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

        await Promise.all([
            this.runMigrator("authorization-db", "auth"),
            this.runMigrator("content-db", "content"),
            this.runMigrator("registry-db", "postgres"),
            this.runMigrator("session-db", "session"),
            this.runMigrator("tenant-db", "tenant")
        ]);
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
