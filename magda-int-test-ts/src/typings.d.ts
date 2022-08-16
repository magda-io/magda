declare module "*.json";
declare module "dockerode-compose" {
    import Dockerode, { Network } from "dockerode";

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
        pull(
            service?: string,
            options?: {
                verbose?: boolean;
                streams?: boolean;
            }
        ): Promise<ReadableStream[]>;
    }
}
