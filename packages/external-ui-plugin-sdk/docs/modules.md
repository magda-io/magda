[@magda/external-ui-plugin-sdk](README.md) / Exports

# @magda/external-ui-plugin-sdk

## Table of contents

### Interfaces

- [CommonPropsType](interfaces/CommonPropsType.md)
- [ConfigDataType](interfaces/ConfigDataType.md)
- [CopyRightItem](interfaces/CopyRightItem.md)
- [DatasetEditButtonComponentPropsType](interfaces/DatasetEditButtonComponentPropsType.md)
- [DatasetLikeButtonComponentPropsType](interfaces/DatasetLikeButtonComponentPropsType.md)
- [ExtraVisualisationSectionComponentPropsType](interfaces/ExtraVisualisationSectionComponentPropsType.md)
- [FooterComponentPropsType](interfaces/FooterComponentPropsType.md)
- [FooterNavLink](interfaces/FooterNavLink.md)
- [FooterNavLinkGroup](interfaces/FooterNavLinkGroup.md)
- [HeaderComponentProps](interfaces/HeaderComponentProps.md)
- [HeaderNavItem](interfaces/HeaderNavItem.md)

### External UI Plugin Component Types Type Aliases

- [DatasetEditButtonComponentType](modules.md#dataseteditbuttoncomponenttype)
- [DatasetLikeButtonComponentType](modules.md#datasetlikebuttoncomponenttype)
- [ExtraVisualisationSectionComponentType](modules.md#extravisualisationsectioncomponenttype)
- [FooterComponentType](modules.md#footercomponenttype)
- [HeaderComponentType](modules.md#headercomponenttype)

### Variables

- [PREFIX](modules.md#prefix)

## External UI Plugin Component Types Type Aliases

### DatasetEditButtonComponentType

Ƭ **DatasetEditButtonComponentType**: `ComponentType`<[`DatasetEditButtonComponentPropsType`](interfaces/DatasetEditButtonComponentPropsType.md)\>

Dataset page `Edit Dataset` button external plugin component type

#### Defined in

index.d.ts:770

---

### DatasetLikeButtonComponentType

Ƭ **DatasetLikeButtonComponentType**: `ComponentType`<[`DatasetLikeButtonComponentPropsType`](interfaces/DatasetLikeButtonComponentPropsType.md)\>

Search Result page `Like Button` external plugin component type
Please note: the `Like Button` on search result page is hidden unless a plugin component is supplied.

#### Defined in

index.d.ts:790

---

### ExtraVisualisationSectionComponentType

Ƭ **ExtraVisualisationSectionComponentType**: `ComponentType`<[`ExtraVisualisationSectionComponentPropsType`](interfaces/ExtraVisualisationSectionComponentPropsType.md)\>

Visualisation Section external plugin component type.
This plugin will be mounted on dataset or distribution page.
More info & example please refer to repo: [magda-ui-plugin-component-dap-thumbnail-viewer](https://github.com/magda-io/magda-ui-plugin-component-dap-thumbnail-viewer)

#### Defined in

index.d.ts:822

---

### FooterComponentType

Ƭ **FooterComponentType**: `ComponentType`<[`FooterComponentPropsType`](interfaces/FooterComponentPropsType.md)\>

Footer external plugin component type

#### Defined in

index.d.ts:867

---

### HeaderComponentType

Ƭ **HeaderComponentType**: `ComponentType`<[`HeaderComponentProps`](interfaces/HeaderComponentProps.md)\>

Header external plugin component type

#### Defined in

index.d.ts:908

## Variables

### PREFIX

• `Const` **PREFIX**: `"MagdaPluginComponent"`

The constant define the prefix that is used to create the global scope variable name, to which the external UI plugin bundle should export to.
e.g. The Header Component should bundled & export to global scope variable `MagdaPluginComponentHeader`.

> Since Magda v2.2.0, users can load more than one "Extra Visualisation Section" type Magda UI Plugin Components.
> To allow this, the component is required to be packaged as a library and exported to global scope `MagdaPluginComponentExtraVisualisationSections.xxxx`.
> Here, `MagdaPluginComponentExtraVisualisationSections` should be an object with key `xxxx` set to the plugin component.
> e.g. the DAP thumbnail viewer plugin choose to export itself to `MagdaPluginComponentExtraVisualisationSections.DAPThumbnailViewer`.

#### Defined in

index.d.ts:1047
