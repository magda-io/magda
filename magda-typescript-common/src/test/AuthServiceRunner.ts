import Docker from "dockerode";
import DockerCompose from "dockerode-compose";
import path from "path";
import yaml from "js-yaml";
import fs from "fs-extra";
const tempy = require("tempy");

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

    async destroy() {}

    async createPostgres() {
        const baseDir = getMagdaModulePath("@magda/postgres");
        const dockerComposeFile = createTmpDockerComposeFile(
            path.resolve(baseDir, "docker-compose.yml"),
            `${this.appImgRegistry}/magda-postgres:${this.appImgTag}`
        );
        console.log(dockerComposeFile);
        this.postgresCompose = new DockerCompose(
            this.docker,
            dockerComposeFile,
            "test-postgres"
        );
        try {
            await this.postgresCompose.down({ volumes: true });
            await this.postgresCompose.up();
        } catch (e) {
            console.log(e);
        }
    }
}
