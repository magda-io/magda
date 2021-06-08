# How to Customise Magda UI

Depends on requirements, Magda offers a few different options allow you to customise the default UI's looking & styling or even adding fully customised frontend logic via `Plugin UI Component`.

## Customise UI styling via SCSS variable

Magda use [SCSS](https://sass-lang.com/) to generate CSS stylesheet for the UI. All variables used are defined in [\_variables.scss](https://github.com/magda-io/magda/blob/master/magda-web-client/src/_variables.scss). Those variables define how UI elements are displayed on screen. Through them, you can change things like color, font & size etc. of most UI elements<sup>\*</sup>.

> <sup>\*</sup> We use [Australian Government Design System](https://designsystem.gov.au/), which might auto adjust the actual color value if your color combination doesn't meet accessibility requirements. (e.g. contrast)

Magda allow you to change the value of any variables in [\_variables.scss](https://github.com/magda-io/magda/blob/master/magda-web-client/src/_variables.scss) at either deployment time or runtime.

### Update SCSS Variables When Deploy

### Update SCSS Variables At Runtime
