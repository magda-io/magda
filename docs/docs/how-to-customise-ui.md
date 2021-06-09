# How to Customise Magda UI

Depends on requirements, Magda offers a few different options allow you to customise the default UI's looking & styling or even adding fully customised frontend logic via `Plugin UI Component`.

## Customise UI styling via SCSS variable

Magda use [SCSS](https://sass-lang.com/) to generate CSS stylesheet for the UI. All variables used are defined in [\_variables.scss](https://github.com/magda-io/magda/blob/master/magda-web-client/src/_variables.scss). Those variables define how UI elements are displayed on screen. Through them, you can change things like color, font & size etc. of most UI elements<sup>\*</sup>.

> <sup>\*</sup> We use [Australian Government Design System](https://designsystem.gov.au/), which might auto adjust the actual color value if your color combination doesn't meet accessibility requirements. (e.g. contrast)

Magda allow you to change the value of any variables in [\_variables.scss](https://github.com/magda-io/magda/blob/master/magda-web-client/src/_variables.scss) at either deployment time or runtime.

### Update SCSS Variables When Deploy

To update SCSSS variables for your deployment, you can set `scssVars` config field of [content-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/content-api/README.md) chart.

e.g.:

```yaml
content-api:
  scssVars: '{"magda-color-primary": "#395063", "magda-color-secondary": "#30384d"}'
```

An exmplae can be found from [here](https://github.com/magda-io/magda-config/blob/069fe28ea2c1c3745c638ccde3c363e2526b571c/chart/values.yaml#L59)

### Update SCSS Variables At Runtime

[Magda main repo](https://github.com/magda-io/magda) provides a script that allows you to modify the SCSS variable in a deployed k8s cluster without interrupting the service.

> You need install node.js 12 & yarn before using this script.

To run the script:

- Clone [Magda main repo](https://github.com/magda-io/magda)
- Run `yarn install` at project root
- Run `yarn set-scss-vars -n [namespace] -f vars.json`

Here:

- `[namespace]` is the k8s namespace where Magda has been deployed into
- vars.json is a json file contains the vars values that you want to update. e.g.

```json
{
  "magda-color-primary": "#002664",
  "magda-color-secondary": "#2E5299",
  "AU-color-foreground-text": "#333"
}
```

Once the script is started, you will see the following output till update is completed:

```
Successfully created config `scss-compiler-config` in namespace `magda`.
Creating updating job in namespace `xxxxx`...
Job `scss-compiler-8fzgn7okpp7frvh` in namespace `xxxxx` has been created.

The updating job is still pending complete. Current status:
Failed Times: 0
Active Job: 0
Re-check status in 10 seconds...

....

The updating job is still pending complete. Current status:
Failed Times: 0
Active Job: 1
Re-check status in 10 seconds...
The updating job has been completed!
Deleting Job scss-compiler-8fzgn7okpp7frvh...
Job scss-compiler-8fzgn7okpp7frvh has been deleted!
✨  Done in 53.41s.
```

> Due to the default cache setting, you might need to clean / disable browser cache in order to see the changes immediately.

## Customise Frontend Logic with External UI Plugin Components

SCSS variables allows you to control the style of the default UI. However, there are cases where you want to implement fully customised frontend logic that may even involves APIs calls etc.

In order to achieve that, Magda allows you to build / bundle React UI components with your own logic. Then, you can supply your customised UI components to Magda at the time of deployment (via [Helm chart config](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server)) to replace the functionality of existing UI components. For those custom built UI components, we call `External UI Plugin Components`.

For more information of how to create / config `External UI Plugin Components`, please refer to [magda-plugin-ui-component-examples repo](https://github.com/magda-io/magda-plugin-ui-component-examples).

Not all built-in Magda components can be replaced by an `External UI Plugin Component`. We currently support replacing `header` & `footer` components to cover most common use cases. We might also adding support of other components in future. For full list of replacable components, please refer to [this definition file](https://github.com/magda-io/magda/blob/master/magda-web-client/src/externalPluginComponents.ts).

## Complete replace default Magda UI

The default Magda UI is a single page application that is built on [Magda backend APIs](https://dev.magda.io/api/v0/apidocs/index.html).

When the solution above can't meet your requirements, you may choose to fork or complete replace the default Magda UI.

To get started, you can:

- Modify [magda's web-client module](https://github.com/magda-io/magda/tree/master/magda-web-client), build docker image and push to your own docker registry.
- When deploy, you can specify your own docker image for [magda-web-server](https://github.com/magda-io/magda/tree/master/magda-web-server) module in your helm chart config.

e.g.

```
web-server:
  image:
    repository: "my-registry.com/xxxx"
    tag: "x.x.x.x"
```
