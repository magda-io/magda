declare module "*.json";
declare module "dockerode-compose" {
    import Dockerode, { Network } from "dockerode";
    import { Readable } from "node:stream";

    interface Output {
        file: string;
        networks: {
            name: string;
            network: Network;
        };
        secrets: any[];
        volumes: any[];
        configs: any[];
        services: any[];
    }

    export default class DockerCompose {
        constructor(dockerode: Dockerode, file: string, projectName: string);
        up(): Promise<Output>;
        down(options?: { volumes: boolean }): Promise<Output>;
        /**
         * Pulls the images for the services in the docker-compose file.
         * Only return streams when the streams option is set to true.
         *
         * @param {string} [service]
         * @param {{
         *                 verbose?: boolean;
         *                 streams?: boolean;
         *             }} [options]
         * @return {*}  {(Promise<Readable[]>)}
         * @memberof DockerCompose
         */
        pull(
            service?: string,
            options?: {
                verbose?: boolean;
                streams?: boolean;
            }
        ): Promise<Readable[]>;
        getContainers(): Dockerode.Container[];
    }
}
