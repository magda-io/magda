import Docker, { Container } from "dockerode";
import DockerCompose from "dockerode-compose";
import { Client as MinioClient } from "minio";
import ServerError from "magda-typescript-common/src/ServerError.js";
import delay from "magda-typescript-common/src/delay.js";
import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig.js";
import path from "path";
import { v4 as uuidV4 } from "uuid";
import yaml from "js-yaml";
import fs from "fs-extra";
import os from "os";
import tempy from "tempy";
import pg from "pg";
import fetch from "cross-fetch";
import child_process, { ChildProcess } from "child_process";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants.js";
import urijs from "urijs";
import { requireResolve } from "@magda/esm-utils";
import { Readable } from "node:stream";
import fetchRequest from "magda-typescript-common/src/fetchRequest.js";
import treeKill from "magda-typescript-common/src/treeKill.js";

/**
 * Resolve magda module dir path.
 *
 * @param {string} moduleName e.g. @magda/typescript-common
 */
function getMagdaModulePath(moduleName: string) {
    const pkgJsonPath = requireResolve(`${moduleName}/package.json`);
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
    public publicImgRegistry: string = "ghcr.io/magda-io";
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
    private minioCompose: DockerCompose;
    private storageApiProcess: ChildProcess;
    private indexerSetupProcess: ChildProcess;
    private searchApiProcess: ChildProcess;
    private embeddingApiCompose: DockerCompose;

    public shouldExit = false;

    public readonly workspaceRoot: string;

    public enableElasticSearch = false;
    public enableAuthService = false;
    public enableRegistryApi = false;
    public enableStorageApi = false;
    public enableSearchApi = false;
    public enableEmbeddingApi = false;
    // indexer will still run even this field is set to false
    // in order to setup the indices in search engine.
    // however, indexer will auto exit if this field is set to false.
    public enableIndexer = false;
    public searchApiConfig: string | null = null;

    public jwtSecret: string = uuidV4();
    public authApiDebugMode = false;
    public authApiSkipAuth = false;
    public searchApiDebugMode = false;
    public storageApiSkipAuth = false;
    public waitForDatasetIndexReady = true;

    public sbtPath: string = "";

    // default: wait for service online within 5 mins
    public maxWaitLiveTime: number = 300000;

    // default: 60s for keeping TCP connection created by socate alive
    public tcpConnectionKeepAliveTime: number = 60;

    // the docker host mat available at a different ip / hostname
    // setting this to portforward the docker based services to localhost
    public dockerServiceForwardHost: string = "";

    public portForwardingProcessList: {
        [key: string]: ChildProcess;
    } = {};

    private minioClient?: MinioClient;
    public minioAccessKey: string = "minio";
    public minioSecretKey: string = "minio123";
    public minioDefaultRegion: string = "unspecified-region";
    public defaultBucket: string = "magda-datasets";

    constructor() {
        // docker config should be passed via env vars e.g.
        // DOCKER_HOST, DOCKER_TLS_VERIFY, DOCKER_CLIENT_TIMEOUT & DOCKER_CERT_PATH
        // our gitlab pipeline already setup in this way.
        const dockerSocketPath = this.getDockerSocketPath();
        this.docker = new Docker(
            dockerSocketPath
                ? {
                      socketPath: dockerSocketPath
                  }
                : undefined
        );
        this.workspaceRoot = path.resolve(
            path.dirname(
                requireResolve("@magda/typescript-common/package.json")
            ),
            "../"
        );
        this.setDockerServiceForwardHost();
    }

    getDockerSocketPath(): string | null {
        if (process.env.DOCKER_HOST) {
            return null;
        }

        const standardSock = "/var/run/docker.sock";
        if (fs.existsSync(standardSock)) {
            return standardSock;
        }

        if (process.platform === "darwin") {
            const homeSock = path.join(
                os.homedir(),
                ".docker",
                "run",
                "docker.sock"
            );
            return homeSock;
        } else {
            return standardSock;
        }
    }

    setDockerServiceForwardHost() {
        if (this.dockerServiceForwardHost) {
            return;
        }
        this.dockerServiceForwardHost = "localhost";
        const dockerHost = process?.env?.DOCKER_HOST;
        if (!dockerHost) {
            return;
        }
        const dockerHostUri = urijs(dockerHost);
        const hostname = dockerHostUri.hostname();
        if (hostname === "127.0.0.1") {
            return;
        }
        this.dockerServiceForwardHost = hostname;
    }

    async create() {
        try {
            await this.docker.info();

            if (this.enableAuthService) {
                await Promise.all([this.createOpa(), this.createPostgres()]);
                await this.createAuthApi();
            }

            await Promise.all([
                this.enableRegistryApi
                    ? this.createRegistryApi()
                    : Promise.resolve(),
                this.enableStorageApi
                    ? this.createMinio().then(this.createStorageApi.bind(this))
                    : Promise.resolve(),
                this.enableElasticSearch ||
                this.enableSearchApi ||
                this.enableIndexer
                    ? this.createElasticSearch()
                    : Promise.resolve(),
                this.enableEmbeddingApi ||
                this.enableSearchApi ||
                this.enableIndexer
                    ? this.createEmbeddingApi()
                    : Promise.resolve()
            ]);

            if (this.enableSearchApi) {
                await this.createSearchApi();
            }
        } catch (e) {
            await this.destroy();
            throw e;
        }
    }

    async destroy() {
        await this.destroyAllPortForward();
        for (const file of this.tmpFiles) {
            fs.unlinkSync(file);
        }
        await Promise.all([
            this.destroyAuthApi(),
            this.destroyPostgres(),
            this.destroyOpa(),
            ...(this.enableRegistryApi
                ? [this.destroyRegistryApi(), this.destroyAspectMigrator()]
                : []),
            ...(this.enableElasticSearch ||
            this.enableSearchApi ||
            this.enableIndexer
                ? [this.destroyElasticSearch()]
                : []),
            ...(this.enableEmbeddingApi ||
            this.enableSearchApi ||
            this.enableIndexer
                ? [this.destroyEmbeddingApi()]
                : []),
            ...(this.enableStorageApi
                ? [this.destroyMinio(), this.destroyStorageApi()]
                : []),
            ...(this.enableSearchApi ? [this.destroySearchApi()] : [])
        ]);
        try {
            await Promise.all([
                this.docker.pruneNetworks(),
                this.docker.pruneContainers(),
                this.docker.pruneVolumes()
            ]);
        } catch (e) {
            if ((e as any)?.statusCode == 409) {
                console.warn("a prune operation is already running.");
            } else {
                console.error(e);
            }
        }
        await delay(30000);
    }

    kill(
        p: ChildProcess,
        signal: NodeJS.Signals = "SIGTERM",
        delayAfterExit: number = 0,
        useTreeKill: boolean = false
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!p) {
                if (delayAfterExit) {
                    return delay(delayAfterExit).then(() => resolve());
                } else {
                    return resolve();
                }
            }

            const onExit = () => {
                console.log(
                    `Process (PID: ${p?.pid}) has exited with code ${p?.exitCode} or signal ${p?.signalCode}`
                );
                p.off("exit", onExit);
                if (delayAfterExit) {
                    return delay(delayAfterExit).then(() => resolve());
                } else {
                    return resolve();
                }
            };

            // Already exited? Wait for 'exit' just in case it hasn't fired yet
            if (p.killed) {
                p.once("exit", onExit); // in case 'exit' not fired yet
                return;
            }

            p.once("exit", onExit); // must register BEFORE killing
            if (useTreeKill && p?.pid) {
                console.log(
                    `Killing process group ${p.pid} with signal ${signal} using treeKill...`
                );
                treeKill(p.pid, signal).then(resolve).catch(reject);
            } else {
                p.kill(signal);
            }
        });
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

    async createMinio() {
        const minioHost = this.dockerServiceForwardHost
            ? this.dockerServiceForwardHost
            : "localhost";
        this.minioClient = new MinioClient({
            endPoint: minioHost,
            port: 9000,
            useSSL: false,
            accessKey: this.minioAccessKey,
            secretKey: this.minioSecretKey,
            region: this.minioDefaultRegion
        });
        const baseDir = getMagdaModulePath("@magda/storage-api");
        const dockerComposeFile = this.createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            undefined,
            false,
            (configData) => {
                configData["services"]["minio"]["environment"] = {
                    MINIO_ACCESS_KEY: this.minioAccessKey,
                    MINIO_SECRET_KEY: this.minioSecretKey,
                    JWT_SECRET: this.jwtSecret
                };
                delete configData["services"]["minio"]["healthcheck"];
            }
        );
        this.minioCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-minio"
        );
        try {
            await Promise.all([
                this.minioCompose.down({ volumes: true }),
                this.pullImage(this.minioCompose)
            ]);
            await this.minioCompose.up();
            await this.waitAlive(
                "Minio",
                async () => {
                    const res = await fetch(
                        `http://${minioHost}:9000/minio/health/ready`
                    );
                    if (res.status !== 200) {
                        throw new ServerError(
                            `${res.statusText}. ${await res.text()}`
                        );
                    }
                    try {
                        await this.minioClient.listBuckets();
                    } catch (error) {
                        const e = error as any;
                        throw new Error(
                            (e?.code ? `Error code: ${e.code}. ` : "") + `${e}`
                        );
                    }
                    return true;
                },
                120000
            );
            if (this.dockerServiceForwardHost) {
                await this.createPortForward(9000);
            }
        } catch (e) {
            await this.destroyMinio();
            throw e;
        }
    }

    async destroyMinio() {
        if (this.minioCompose) {
            await this.minioCompose.down({ volumes: true });
        }
        if (this.dockerServiceForwardHost) {
            await this.destroyPortForward(9000);
        }
    }

    async createStorageApi() {
        const storageApiExecute = `${path.resolve(
            this.workspaceRoot,
            "./magda-storage-api/dist/index.js"
        )}`;
        if (!fs.existsSync(storageApiExecute)) {
            throw new Error(
                `Cannot locate storage api built entrypoint file: ${storageApiExecute}`
            );
        }
        const storageApiProcess = child_process.fork(
            storageApiExecute,
            [
                "--jwtSecret",
                this.jwtSecret,
                "--skipAuth",
                `${this.storageApiSkipAuth}`,
                "--userId",
                DEFAULT_ADMIN_USER_ID,
                "--minioRegion",
                this.minioDefaultRegion,
                "--defaultBuckets",
                this.defaultBucket,
                "--minioHost",
                this.dockerServiceForwardHost || "localhost"
            ],
            {
                stdio: "inherit",
                env: {
                    MINIO_ACCESS_KEY: this.minioAccessKey,
                    MINIO_SECRET_KEY: this.minioSecretKey,
                    MINIO_HOST: "localhost"
                }
            }
        );

        this.storageApiProcess = storageApiProcess;

        storageApiProcess.on("exit", (code, signal) => {
            this.storageApiProcess = undefined;
            console.log(
                `StorageApi exited with code ${code} or signal ${signal}`
            );
        });

        storageApiProcess.on("error", (error) => {
            console.error(`StorageApi has thrown an error: ${error}`);
        });

        try {
            await this.waitAlive("StorageApi", async () => {
                const res = await fetch(
                    "http://localhost:6121/v0/status/ready"
                );
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                return true;
            });
        } catch (e) {
            await this.destroyStorageApi();
            throw e;
        }
    }

    async destroyStorageApi() {
        await this.kill(this.storageApiProcess);
    }

    async createPortForward(
        remotePort: number,
        localPort?: number,
        hostname?: string
    ) {
        if (!process.env.KUBERNETES_PORT) {
            console.log("Skipping port forward because not in Kubernetes.");
            return;
        }
        if (!localPort) {
            localPort = remotePort;
        }
        if (!hostname) {
            hostname = this.dockerServiceForwardHost;
        }
        if (!remotePort || !localPort) {
            throw new Error("Forward port should not be empty!");
        }
        if (!hostname) {
            throw new Error("Forward hostname should not be empty!");
        }

        if (this.portForwardingProcessList[localPort]) {
            throw new Error(
                `Port ${localPort} already has an existing port forwarding process running.`
            );
        }
        const portForwardCmd = `socat -T ${this.tcpConnectionKeepAliveTime} TCP6-LISTEN:${localPort},fork,reuseaddr TCP4:${hostname}:${remotePort}`;
        const portForwardProcess = child_process.spawn(portForwardCmd, {
            stdio: "inherit",
            shell: true
        });

        console.log(
            `Started to portforward (PID: ${portForwardProcess.pid}) for ${hostname}:${remotePort}...`
        );

        this.portForwardingProcessList[
            localPort.toString()
        ] = portForwardProcess;

        portForwardProcess.on("exit", (code, signal) => {
            this.portForwardingProcessList[localPort] = undefined;
            const msg = `portforward (PID: ${portForwardProcess.pid}) for ${hostname}:${remotePort} exited with code ${code} or signal ${signal}`;
            if (!code) {
                console.log(msg);
            } else {
                console.error(msg);
            }
        });

        portForwardProcess.on("error", (error) => {
            console.error(
                `portforward (PID: ${portForwardProcess.pid}) for ${hostname}:${remotePort} has thrown an error: ${error}`
            );
        });
    }

    async destroyPortForward(localPort: string | number) {
        const process = this.portForwardingProcessList[localPort];
        if (process && !process.killed) {
            console.log(
                `About to kill port forwarding process, PID: ${process.pid}...`
            );
            await this.kill(process);
            this.portForwardingProcessList[localPort] = undefined;
        }
    }

    async destroyAllPortForward() {
        const ports = Object.keys(this.portForwardingProcessList);
        await Promise.all(ports.map((port) => this.destroyPortForward(port)));
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

        return new Promise<void>((resolve, reject) => {
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

            aspectMigratorProcess.on("exit", (code, signal) => {
                this.aspectMigratorProcess = undefined;
                console.log(
                    `aspectMigrator exited with code ${code} or signal ${signal}`
                );
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
        await this.kill(this.aspectMigratorProcess);
    }

    async createRegistryApi() {
        const dbHost = this.dockerServiceForwardHost
            ? this.dockerServiceForwardHost
            : "localhost";
        const registryApiProcess = child_process.spawn(
            "sbt",
            ['"registryApi/run"'],
            {
                cwd: this.workspaceRoot,
                stdio: "inherit",
                shell: true,
                env: {
                    ...process.env,
                    POSTGRES_PASSWORD: "password",
                    JWT_SECRET: this.jwtSecret,
                    POSTGRES_URL: `jdbc:postgresql://${dbHost}/postgres`
                }
            }
        );

        this.registryApiProcess = registryApiProcess;

        registryApiProcess.on("exit", (code, signal) => {
            this.registryApiProcess = undefined;
            console.log(
                `RegistryAPI exited with code ${code} or signal ${signal}`
            );
        });

        registryApiProcess.on("error", (error) => {
            console.error(`RegistryAPI has thrown an error: ${error}`);
        });

        try {
            await this.waitAlive("RegistryApi", async () => {
                const res = await fetch(
                    `http://localhost:6101/v0/status/ready`
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
        await this.kill(this.registryApiProcess, "SIGKILL", 1000, true);
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
                "--userId",
                DEFAULT_ADMIN_USER_ID,
                "--debug",
                `${this.authApiDebugMode}`,
                "--skipAuth",
                `${this.authApiSkipAuth}`,
                "--opaUrl",
                `http://${this.dockerServiceForwardHost || "localhost"}:8181/`,
                "--dbHost",
                `${this.dockerServiceForwardHost || "localhost"}`
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

        authApiProcess.on("exit", (code, signal) => {
            this.authApiProcess = undefined;
            console.log(`AuthApi exited with code ${code} or signal ${signal}`);
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
        await this.kill(this.authApiProcess);
    }

    async createEmbeddingApi() {
        console.log("starting EmbeddingApi...");
        const dockerComposeFile = this.createTmpDockerComposeFile(
            path.resolve(
                this.workspaceRoot,
                "./magda-int-test-ts/embeddingApi/docker-compose.yml"
            ),
            undefined
        );
        this.embeddingApiCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-embedding-api"
        );
        try {
            await Promise.all([
                new Promise(async (resolve, reject) => {
                    console.log(
                        "Terminating any possible existing embeddingApi..."
                    );
                    resolve(this.embeddingApiCompose.down({ volumes: true }));
                }),
                new Promise(async (resolve, reject) => {
                    console.log("Pulling embeddingApi...");
                    resolve(this.pullImage(this.embeddingApiCompose));
                })
            ]);
            console.log("pulling EmbeddingApi is done...");
            await this.embeddingApiCompose.up();
            await this.waitAlive("embeddingApi", async () => {
                const embeddingApiHost = this.dockerServiceForwardHost
                    ? this.dockerServiceForwardHost
                    : "localhost";
                const res = await fetch(
                    `http://${embeddingApiHost}:3000/status/readiness`
                );
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                await res.json();
                return true;
            });
            if (this.dockerServiceForwardHost) {
                await this.createPortForward(3000);
            }
        } catch (e) {
            await this.destroyEmbeddingApi();
            throw e;
        }
    }

    async destroyEmbeddingApi() {
        if (this.embeddingApiCompose) {
            await this.embeddingApiCompose.down({ volumes: true });
        }
        if (this.dockerServiceForwardHost) {
            await this.destroyPortForward(3000);
        }
    }

    pullImage(
        imageOrDockerComposeObj: string | DockerCompose,
        printOutput: boolean = false
    ) {
        return new Promise(async (resolve, reject) => {
            const pullStreams: Readable[] = [];
            if (typeof imageOrDockerComposeObj === "string") {
                pullStreams.push(
                    await this.docker.pull(imageOrDockerComposeObj)
                );
            } else {
                pullStreams.splice(
                    0,
                    0,
                    ...(await imageOrDockerComposeObj.pull(undefined, {
                        streams: true
                    }))
                );
            }
            for (const pullStream of pullStreams) {
                if (printOutput) {
                    pullStream.pipe(process.stdout);
                    pullStream.once("end", resolve);
                } else {
                    const devNull = fs.createWriteStream("/dev/null");
                    pullStream.pipe(devNull);
                    pullStream.once("end", () => {
                        resolve(void 0);
                        devNull.destroy();
                    });
                }
            }
        });
    }

    async runMigrator(name: string, dbName: string) {
        const mainMigratorImg = "ghcr.io/magda-io/magda-db-migrator:main";
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
                this.pullImage(this.opaCompose)
            ]);
            await this.opaCompose.up();
            await this.waitAlive("OPA", async () => {
                const opaHost = this.dockerServiceForwardHost
                    ? this.dockerServiceForwardHost
                    : "localhost";
                const res = await fetch(`http://${opaHost}:8181/health`);
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                await res.json();
                return true;
            });
            if (this.dockerServiceForwardHost) {
                await this.createPortForward(8181);
            }
        } catch (e) {
            await this.destroyOpa();
            throw e;
        }
    }

    async destroyOpa() {
        if (this.opaCompose) {
            await this.opaCompose.down({ volumes: true });
        }
        if (this.dockerServiceForwardHost) {
            await this.destroyPortForward(8181);
        }
    }

    async testAlivePostgres() {
        const dbhost = this.dockerServiceForwardHost
            ? this.dockerServiceForwardHost
            : "localhost";
        const dbConfig = getTestDBConfig() as any;
        dbConfig.database = "postgres";
        dbConfig.host = dbhost;
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
            if (this.shouldExit) {
                throw new Error(
                    "`shouldExit` mark is set. End liveness checker now..."
                );
            }
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
                this.pullImage(this.postgresCompose)
            ]);
            await this.postgresCompose.up();
            await this.waitAlive("Postgres", this.testAlivePostgres.bind(this));
            if (this.dockerServiceForwardHost) {
                await this.createPortForward(5432);
            }
        } catch (e) {
            await this.destroyPostgres();
            throw e;
        }

        await this.runMigrator("registry-db", "postgres");
        await Promise.all([
            this.runMigrator("authorization-db", "auth"),
            this.runMigrator("session-db", "session"),
            this.runMigrator("content-db", "content"),
            this.runMigrator("tenant-db", "tenant")
        ]);
    }

    async destroyPostgres() {
        if (this.postgresCompose) {
            await this.postgresCompose.down({ volumes: true });
        }
        if (this.dockerServiceForwardHost) {
            await this.destroyPortForward(5432);
        }
    }

    async createElasticSearch() {
        console.log("Creating OpenSearch...");
        const baseDir = getMagdaModulePath("@magda/opensearch");
        const dockerComposeFile = this.createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            undefined,
            true
        );

        this.elasticSearchCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-es"
        );
        try {
            await Promise.all([
                new Promise(async (resolve, reject) => {
                    console.log(
                        "Terminating any possible existing OpenSearch..."
                    );
                    resolve(this.elasticSearchCompose.down({ volumes: true }));
                }),
                new Promise(async (resolve, reject) => {
                    console.log("Pulling OpenSearch...");
                    resolve(this.pullImage(this.elasticSearchCompose));
                })
            ]);
            console.log("Starting up OpenSearch...");
            await this.elasticSearchCompose.up();
            console.log("Start to probe OpenSearch liveness...");
            await this.waitAlive(
                "ElasticSearch",
                async () => {
                    const esHost = this.dockerServiceForwardHost
                        ? this.dockerServiceForwardHost
                        : "localhost";
                    const res = await fetch(
                        `http://${esHost}:9200/_cluster/health`
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
            if (this.dockerServiceForwardHost) {
                await this.createPortForward(9200);
            }
        } catch (e) {
            await this.destroyElasticSearch();
            console.error(e);
            throw e;
        }
        await this.createIndexerSetup();
    }

    async destroyElasticSearch() {
        if (this.elasticSearchCompose) {
            await this.elasticSearchCompose.down({ volumes: true });
        }
        if (this.dockerServiceForwardHost) {
            await this.destroyPortForward(9200);
        }
        await this.destroyIndexerSetup();
    }

    // Inject custom config
    private async buildSearchApiConf(): Promise<string> {
        const baseConfFilePath = path.resolve(
            this.workspaceRoot,
            "magda-int-test-ts",
            "indexer-setup.conf"
        );

        const baseConfContent = await fs.readFile(baseConfFilePath, "utf-8");

        const esHost = this.dockerServiceForwardHost || "localhost";
        const embedding = this.dockerServiceForwardHost || "localhost";
        const esConfig = `elasticSearch.serverUrl = "http://${esHost}:9200"\n`;
        const embeddingConfig = `embeddingApi.baseUrl = "http://${embedding}:3000"\n`;

        let mergedConf = baseConfContent;
        if (this.searchApiConfig !== null) {
            mergedConf = baseConfContent + "\n" + this.searchApiConfig;
        }
        mergedConf = mergedConf + "\n" + esConfig + embeddingConfig;

        const confPath = tempy.file({ extension: "conf" });
        await fs.writeFile(confPath, mergedConf);
        this.tmpFiles.push(confPath);

        return confPath;
    }

    async createIndexerSetup() {
        const confFilePath = await this.buildSearchApiConf();

        const indexerSetupProcess = child_process.spawn(
            "sbt",
            ['"indexer/run"', `"-Dconfig.file=${confFilePath}"`],
            {
                cwd: this.workspaceRoot,
                stdio: "inherit",
                shell: true,
                env: {
                    ...process.env,
                    JWT_SECRET: this.jwtSecret
                }
            }
        );

        this.indexerSetupProcess = indexerSetupProcess;

        indexerSetupProcess.on("exit", (code, signal) => {
            this.registryApiProcess = undefined;
            console.log(
                `Indexer setup process exited with code ${code} or signal ${signal}`
            );
        });

        indexerSetupProcess.on("error", (error) => {
            console.error(
                `Indexer setup process has thrown an error: ${error}`
            );
        });

        try {
            await this.waitAlive("IndexerSetup", async () => {
                const res = await fetch(
                    "http://localhost:6103/v0/status/ready"
                );
                if (res.status !== 200) {
                    throw new ServerError(
                        `${res.statusText}. ${await res.text()}`
                    );
                }
                console.log(await res.text());
                return true;
            });
            if (this.waitForDatasetIndexReady) {
                await this.waitAlive("Dataset index setup", async () => {
                    const esHost = this.dockerServiceForwardHost
                        ? this.dockerServiceForwardHost
                        : "localhost";
                    const resData = await fetchRequest(
                        "GET",
                        `http://${esHost}:9200/_cat/indices?format=json`
                    );
                    const datasetIndexName = resData
                        .map((item: any) => item.index)
                        .find((indexName: string) =>
                            indexName.startsWith("datasets")
                        );

                    if (!datasetIndexName) {
                        throw new Error("Can't find datasets index");
                    }

                    return true;
                });
            }
            if (!this.enableIndexer) {
                console.log("Indexer is not required. Exiting now...");
                await this.destroyIndexerSetup();
            }
        } catch (e) {
            await this.destroyIndexerSetup();
            throw e;
        }
    }

    async destroyIndexerSetup() {
        await this.kill(this.indexerSetupProcess, "SIGKILL", 1000, true);
    }

    async createSearchApi() {
        const confFilePath = await this.buildSearchApiConf();
        const searchApiProcess = child_process.spawn(
            "sbt",
            [
                `-DsearchApi.debug="${this.searchApiDebugMode}"`,
                `"-Dconfig.file=${confFilePath}"`,
                '"searchApi/run"'
            ],
            {
                cwd: this.workspaceRoot,
                stdio: "inherit",
                shell: true,
                env: {
                    ...process.env
                }
            }
        );

        this.searchApiProcess = searchApiProcess;

        searchApiProcess.on("exit", (code, signal) => {
            this.searchApiProcess = undefined;
            console.log(
                `SearchApi exited with code ${code} or signal ${signal}`
            );
        });

        searchApiProcess.on("error", (error) => {
            console.error(`SearchApi has thrown an error: ${error}`);
        });

        try {
            await this.waitAlive("SearchApi", async () => {
                const res = await fetch(
                    "http://localhost:6102/v0/status/ready"
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
            await this.destroySearchApi();
            throw e;
        }
    }

    async destroySearchApi() {
        await this.kill(this.searchApiProcess, "SIGKILL", 1000, true);
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
