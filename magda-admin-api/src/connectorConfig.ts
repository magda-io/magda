import * as config from "config";

const useDevImages = config.get("useDevImages");
const defaultImageTag = useDevImages
  ? "latest"
  : require("../package.json").version;

export type Options = {
  id: string;
  dockerImage: string;
  dockerRepo?: string;
  registryApiUrl?: string;
  dockerImageTag?: string;
};

export default function({
  id,
  dockerImage = "magda-project-open-data-connector",
  dockerRepo = config.get("dockerRepo"),
  registryApiUrl = config.get("registryApiUrl"),
  dockerImageTag = defaultImageTag
}: Options) {
  const jobName = `connector-${id}`;

  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobName,
      magdaSleuther: true
    },
    spec: {
      template: {
        metadata: {
          name: jobName,
          magdaSleuther: true
        },
        spec: {
          containers: [
            {
              name: jobName,
              image: `${dockerRepo}/${dockerImage}:${dockerImageTag}`,
              command: [
                "node",
                "/usr/src/app/component/dist/index.js",
                "--config",
                "/etc/config/connector.json",
                "--registryUrl",
                registryApiUrl
              ],
              imagePullPolicy:
                dockerImageTag === "latest" ? "Always" : "IfNotPresent",
              resources: {
                requests: {
                  cpu: "0m"
                }
              },
              volumeMounts: [
                {
                  mountPath: "/etc/config",
                  name: "config"
                }
              ]
            }
          ],
          restartPolicy: "OnFailure",
          volumes: [
            {
              name: "config",
              configMap: {
                name: `connector-${id}`,
                items: [
                  {
                    key: `connector.json`,
                    path: "connector.json"
                  }
                ]
              }
            }
          ]
        }
      }
    }
  };
}
