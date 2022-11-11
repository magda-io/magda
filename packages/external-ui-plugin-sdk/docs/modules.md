[@magda/external-ui-plugin-sdk](README.md) / Exports

# @magda/external-ui-plugin-sdk

## Table of contents

### Interfaces

- [CommonPropsType](interfaces/CommonPropsType.md)

### Type Aliases

- [CopyRightItem](modules.md#copyrightitem)
- [DatasetEditButtonComponentPropsType](modules.md#dataseteditbuttoncomponentpropstype)
- [DatasetEditButtonComponentType](modules.md#dataseteditbuttoncomponenttype)
- [DatasetLikeButtonComponentPropsType](modules.md#datasetlikebuttoncomponentpropstype)
- [DatasetLikeButtonComponentType](modules.md#datasetlikebuttoncomponenttype)
- [ExternalCompontType](modules.md#externalcomponttype)
- [ExternalDatasetEditButtonCompontType](modules.md#externaldataseteditbuttoncomponttype)
- [ExternalDatasetLikeButtonCompontType](modules.md#externaldatasetlikebuttoncomponttype)
- [ExternalExtraVisualisationSectionCompontType](modules.md#externalextravisualisationsectioncomponttype)
- [ExternalFooterCompontType](modules.md#externalfootercomponttype)
- [ExternalHeaderCompontType](modules.md#externalheadercomponttype)
- [ExtraVisualisationSectionComponentPropsType](modules.md#extravisualisationsectioncomponentpropstype)
- [ExtraVisualisationSectionComponentType](modules.md#extravisualisationsectioncomponenttype)
- [FooterComponentPropsType](modules.md#footercomponentpropstype)
- [FooterComponentType](modules.md#footercomponenttype)
- [FooterNavLink](modules.md#footernavlink)
- [FooterNavLinkGroup](modules.md#footernavlinkgroup)
- [HeaderComponentProps](modules.md#headercomponentprops)
- [HeaderCompontType](modules.md#headercomponttype)
- [HeaderNavItem](modules.md#headernavitem)

### Variables

- [PREFIX](modules.md#prefix)

## Type Aliases

### CopyRightItem

Ƭ **CopyRightItem**: `Object`

#### Type declaration

| Name          | Type     |
| :------------ | :------- |
| `href`        | `string` |
| `htmlContent` | `string` |
| `logoSrc`     | `string` |
| `order`       | `number` |

#### Defined in

index.d.ts:194

---

### DatasetEditButtonComponentPropsType

Ƭ **DatasetEditButtonComponentPropsType**: `Object`

#### Type declaration

| Name      | Type            |
| :-------- | :-------------- |
| `dataset` | `ParsedDataset` |

#### Defined in

index.d.ts:210

---

### DatasetEditButtonComponentType

Ƭ **DatasetEditButtonComponentType**: `ComponentType`<[`DatasetEditButtonComponentPropsType`](modules.md#dataseteditbuttoncomponentpropstype)\>

#### Defined in

index.d.ts:214

---

### DatasetLikeButtonComponentPropsType

Ƭ **DatasetLikeButtonComponentPropsType**: `Object`

#### Type declaration

| Name      | Type            |
| :-------- | :-------------- |
| `dataset` | `ParsedDataset` |

#### Defined in

index.d.ts:218

---

### DatasetLikeButtonComponentType

Ƭ **DatasetLikeButtonComponentType**: `ComponentType`<[`DatasetLikeButtonComponentPropsType`](modules.md#datasetlikebuttoncomponentpropstype)\>

#### Defined in

index.d.ts:222

---

### ExternalCompontType

Ƭ **ExternalCompontType**<`T`\>: `ComponentType`<`T` & [`CommonPropsType`](interfaces/CommonPropsType.md)\>

#### Type parameters

| Name |
| :--- |
| `T`  |

#### Defined in

index.d.ts:235

---

### ExternalDatasetEditButtonCompontType

Ƭ **ExternalDatasetEditButtonCompontType**: [`ExternalCompontType`](modules.md#externalcomponttype)<[`DatasetEditButtonComponentType`](modules.md#dataseteditbuttoncomponenttype)\>

#### Defined in

index.d.ts:237

---

### ExternalDatasetLikeButtonCompontType

Ƭ **ExternalDatasetLikeButtonCompontType**: [`ExternalCompontType`](modules.md#externalcomponttype)<[`DatasetLikeButtonComponentType`](modules.md#datasetlikebuttoncomponenttype)\>

#### Defined in

index.d.ts:241

---

### ExternalExtraVisualisationSectionCompontType

Ƭ **ExternalExtraVisualisationSectionCompontType**: [`ExternalCompontType`](modules.md#externalcomponttype)<[`ExtraVisualisationSectionComponentType`](modules.md#extravisualisationsectioncomponenttype)\>

#### Defined in

index.d.ts:245

---

### ExternalFooterCompontType

Ƭ **ExternalFooterCompontType**: [`ExternalCompontType`](modules.md#externalcomponttype)<[`FooterComponentPropsType`](modules.md#footercomponentpropstype)\>

#### Defined in

index.d.ts:249

---

### ExternalHeaderCompontType

Ƭ **ExternalHeaderCompontType**: [`ExternalCompontType`](modules.md#externalcomponttype)<[`HeaderComponentProps`](modules.md#headercomponentprops)\>

#### Defined in

index.d.ts:253

---

### ExtraVisualisationSectionComponentPropsType

Ƭ **ExtraVisualisationSectionComponentPropsType**: `Object`

#### Type declaration

| Name              | Type            |
| :---------------- | :-------------- |
| `dataset`         | `ParsedDataset` |
| `distributionId?` | `string`        |

#### Defined in

index.d.ts:257

---

### ExtraVisualisationSectionComponentType

Ƭ **ExtraVisualisationSectionComponentType**: `ComponentType`<[`ExtraVisualisationSectionComponentPropsType`](modules.md#extravisualisationsectioncomponentpropstype)\>

#### Defined in

index.d.ts:262

---

### FooterComponentPropsType

Ƭ **FooterComponentPropsType**: `Object`

#### Type declaration

| Name                   | Type                                                    |
| :--------------------- | :------------------------------------------------------ |
| `footerCopyRightItems` | [`CopyRightItem`](modules.md#copyrightitem)[]           |
| `footerMediumNavs`     | [`FooterNavLinkGroup`](modules.md#footernavlinkgroup)[] |
| `footerSmallNavs`      | [`FooterNavLinkGroup`](modules.md#footernavlinkgroup)[] |
| `noTopMargin`          | `boolean`                                               |

#### Defined in

index.d.ts:271

---

### FooterComponentType

Ƭ **FooterComponentType**: `ComponentType`<[`FooterComponentPropsType`](modules.md#footercomponentpropstype)\>

#### Defined in

index.d.ts:278

---

### FooterNavLink

Ƭ **FooterNavLink**: `Object`

#### Type declaration

| Name    | Type     |
| :------ | :------- |
| `href`  | `string` |
| `label` | `string` |
| `order` | `number` |

#### Defined in

index.d.ts:280

---

### FooterNavLinkGroup

Ƭ **FooterNavLinkGroup**: `Object`

#### Type declaration

| Name    | Type                                          |
| :------ | :-------------------------------------------- |
| `label` | `string`                                      |
| `links` | [`FooterNavLink`](modules.md#footernavlink)[] |
| `order` | `number`                                      |

#### Defined in

index.d.ts:286

---

### HeaderComponentProps

Ƭ **HeaderComponentProps**: `Object`

#### Type declaration

| Name             | Type                                          |
| :--------------- | :-------------------------------------------- |
| `headerNavItems` | [`HeaderNavItem`](modules.md#headernavitem)[] |

#### Defined in

index.d.ts:292

---

### HeaderCompontType

Ƭ **HeaderCompontType**: `ComponentType`<[`HeaderComponentProps`](modules.md#headercomponentprops)\>

#### Defined in

index.d.ts:296

---

### HeaderNavItem

Ƭ **HeaderNavItem**: `Object`

#### Type declaration

| Name              | Type                                                                              |
| :---------------- | :-------------------------------------------------------------------------------- |
| `auth?`           | {}                                                                                |
| `default?`        | { `href`: `string` ; `label`: `string` ; `rel?`: `string` ; `target?`: `string` } |
| `default.href`    | `string`                                                                          |
| `default.label`   | `string`                                                                          |
| `default.rel?`    | `string`                                                                          |
| `default.target?` | `string`                                                                          |
| `order`           | `number`                                                                          |

#### Defined in

index.d.ts:298

## Variables

### PREFIX

• `Const` **PREFIX**: `"MagdaPluginComponent"`

#### Defined in

index.d.ts:421
