[@magda/external-ui-plugin-sdk](README.md) / Exports

# @magda/external-ui-plugin-sdk

## Table of contents

### Interfaces

- [CommonPropsType](interfaces/CommonPropsType.md)
- [ConfigDataType](interfaces/ConfigDataType.md)
- [CopyRightItem](interfaces/CopyRightItem.md)
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

### Other Type Aliases

- [DatasetEditButtonComponentPropsType](modules.md#dataseteditbuttoncomponentpropstype)
- [DatasetLikeButtonComponentPropsType](modules.md#datasetlikebuttoncomponentpropstype)
- [ExtraVisualisationSectionComponentPropsType](modules.md#extravisualisationsectioncomponentpropstype)
- [FooterComponentPropsType](modules.md#footercomponentpropstype)

### Variables

- [PREFIX](modules.md#prefix)

## External UI Plugin Component Types Type Aliases

### DatasetEditButtonComponentType

Ƭ **DatasetEditButtonComponentType**: `ComponentType`<[`DatasetEditButtonComponentPropsType`](modules.md#dataseteditbuttoncomponentpropstype)\>

Dataset page `Edit Dataset` button external plugin component type

#### Defined in

index.d.ts:436

---

### DatasetLikeButtonComponentType

Ƭ **DatasetLikeButtonComponentType**: `ComponentType`<[`DatasetLikeButtonComponentPropsType`](modules.md#datasetlikebuttoncomponentpropstype)\>

Search Result page `Like Button` external plugin component type
Please note: the `Like Button` on search result page is hidden unless a plugin component is supplied.

#### Defined in

index.d.ts:449

---

### ExtraVisualisationSectionComponentType

Ƭ **ExtraVisualisationSectionComponentType**: `ComponentType`<[`ExtraVisualisationSectionComponentPropsType`](modules.md#extravisualisationsectioncomponentpropstype)\>

Visualisation Section external plugin component type.
This plugin will be mounted on dataset or distribution page.
More info & example please refer to repo: [magda-ui-plugin-component-dap-thumbnail-viewer](https://github.com/magda-io/magda-ui-plugin-component-dap-thumbnail-viewer)

#### Defined in

index.d.ts:473

---

### FooterComponentType

Ƭ **FooterComponentType**: `ComponentType`<[`FooterComponentPropsType`](modules.md#footercomponentpropstype)\>

Footer external plugin component type

#### Defined in

index.d.ts:511

---

### HeaderComponentType

Ƭ **HeaderComponentType**: `ComponentType`<[`HeaderComponentProps`](interfaces/HeaderComponentProps.md)\>

Header external plugin component type

#### Defined in

index.d.ts:545

---

## Other Type Aliases

### DatasetEditButtonComponentPropsType

Ƭ **DatasetEditButtonComponentPropsType**: `Object`

#### Type declaration

| Name      | Type            |
| :-------- | :-------------- |
| `dataset` | `ParsedDataset` |

#### Defined in

index.d.ts:428

---

### DatasetLikeButtonComponentPropsType

Ƭ **DatasetLikeButtonComponentPropsType**: `Object`

#### Type declaration

| Name      | Type            |
| :-------- | :-------------- |
| `dataset` | `ParsedDataset` |

#### Defined in

index.d.ts:440

---

### ExtraVisualisationSectionComponentPropsType

Ƭ **ExtraVisualisationSectionComponentPropsType**: `Object`

#### Type declaration

| Name              | Type            |
| :---------------- | :-------------- |
| `dataset`         | `ParsedDataset` |
| `distributionId?` | `string`        |

#### Defined in

index.d.ts:462

---

### FooterComponentPropsType

Ƭ **FooterComponentPropsType**: `Object`

#### Type declaration

| Name                   | Type                                                       |
| :--------------------- | :--------------------------------------------------------- |
| `footerCopyRightItems` | [`CopyRightItem`](interfaces/CopyRightItem.md)[]           |
| `footerMediumNavs`     | [`FooterNavLinkGroup`](interfaces/FooterNavLinkGroup.md)[] |
| `footerSmallNavs`      | [`FooterNavLinkGroup`](interfaces/FooterNavLinkGroup.md)[] |
| `noTopMargin`          | `boolean`                                                  |

#### Defined in

index.d.ts:500

## Variables

### PREFIX

• `Const` **PREFIX**: `"MagdaPluginComponent"`

#### Defined in

index.d.ts:676
