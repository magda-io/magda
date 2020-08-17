# How to Add Custom OPA Policy Files

Magda comes with a policy engine (Open Policy Agent) for authorisation usage.

You can supply your own set of policy files to implment additional logic or replace existing build-in policy files.

### Encode Your Policy Files Directory into ConfigMap

To supply your own policy files, you need to create one or more (in case files are too big for one) configMap that contains your policy file directory.

A helm chart template [magda.filesToJson](https://github.com/magda-io/magda/blob/21499b75c7a7ee00d68886338713217d83ccb91f/deploy/helm/magda-core/templates/_helpers.tpl#L244) is provided to load files with directory structure into a k8s configMap.

This template support 2 parameters:

-   `filePattern`: Glob file search pattern string. All files (and their dir path) match the `Glob` pattern will be encoded and included in the configMap.
-   `pathPrefix` : Optional. Add `pathPrefix` to all file path generated in configMap JSON.

Example Usage:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
    name: "my-default-files"
data:
    my_default_files.json:
        {
            {
                include "magda.filesToJson" (dict "root" . "filePattern" "my_dir/**/*" ),
            },
        }
```

Or with `pathPrefix`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
    name: "my-default-files"
data:
    my_default_files.json:
        {
            {
                include "magda.filesToJson" (dict "root" . "filePattern" "my_dir/**/*" "pathPrefix" "test/" ),
            },
        }
```

### Deployment Chart

To pass the configMap to OPA, you need to create a deployment chart to deploy your application:

-   Your policy files directory should be put inside your chart directory.
-   The configMap template should be put into your chart template directory.
-   You can supply your custom policy file configMap by set the `customPolicyConfigMaps` value of opa sub chart. e.g.:

```yaml
magda:
    magda-core:
        opa:
            customPolicyConfigMaps:
                - my-extra-policy-files-1
                - my-extra-policy-files-2
```

A complete example can be found from:

https://github.com/magda-io/magda/tree/9339dde1c30a43cec44646aea5aeda1391275931/deploy/helm/local-deployment
