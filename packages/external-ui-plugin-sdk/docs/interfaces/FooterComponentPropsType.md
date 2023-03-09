[@magda/external-ui-plugin-sdk](../README.md) / [Exports](../modules.md) / FooterComponentPropsType

# Interface: FooterComponentPropsType

The properties that Footer Plugin Component will receive.

**`Export`**

**`Interface`**

FooterComponentPropsType

## Hierarchy

- [`CommonPropsType`](CommonPropsType.md)

  ↳ **`FooterComponentPropsType`**

## Table of contents

### Properties

- [config](FooterComponentPropsType.md#config)
- [fetchContent](FooterComponentPropsType.md#fetchcontent)
- [footerCopyRightItems](FooterComponentPropsType.md#footercopyrightitems)
- [footerMediumNavs](FooterComponentPropsType.md#footermediumnavs)
- [footerSmallNavs](FooterComponentPropsType.md#footersmallnavs)
- [history](FooterComponentPropsType.md#history)
- [isFetchingWhoAmI](FooterComponentPropsType.md#isfetchingwhoami)
- [loadedPluginNames](FooterComponentPropsType.md#loadedpluginnames)
- [location](FooterComponentPropsType.md#location)
- [match](FooterComponentPropsType.md#match)
- [noTopMargin](FooterComponentPropsType.md#notopmargin)
- [requestSignOut](FooterComponentPropsType.md#requestsignout)
- [requestWhoAmI](FooterComponentPropsType.md#requestwhoami)
- [user](FooterComponentPropsType.md#user)
- [whoAmIError](FooterComponentPropsType.md#whoamierror)

## Properties

### config

• **config**: [`ConfigDataType`](ConfigDataType.md)

The `config` field contains all frontend config data fields.
External UI plugin developer might be interested in `config.extraConfigData` field.
`config.extraConfigData` field serves as an interface to config external UI plugin at deployment time.
External UI plugin related config data can be supplied via [web-server](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server) helm chart.

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[config](CommonPropsType.md#config)

#### Defined in

index.d.ts:67

___

### fetchContent

• **fetchContent**: (`noCache?`: `boolean`) => `Promise`<`void`\>

#### Type declaration

▸ (`noCache?`): `Promise`<`void`\>

When called, this function will dispatch an action to make all client side resource items (e.g. header & footer items etc.)
to be reloaded. You may only want to call it after the current user profile changed or any content items have been updated.
You can optionally passing a boolean parameter `noCache` to control the cache behaviour during the loading.
Its default value is `false`.

**`Memberof`**

CommonPropsType

##### Parameters

| Name | Type |
| :------ | :------ |
| `noCache?` | `boolean` |

##### Returns

`Promise`<`void`\>

#### Inherited from

[CommonPropsType](CommonPropsType.md).[fetchContent](CommonPropsType.md#fetchcontent)

#### Defined in

index.d.ts:119

___

### footerCopyRightItems

• **footerCopyRightItems**: [`CopyRightItem`](CopyRightItem.md)[]

#### Defined in

index.d.ts:871

___

### footerMediumNavs

• **footerMediumNavs**: [`FooterNavLinkGroup`](FooterNavLinkGroup.md)[]

#### Defined in

index.d.ts:869

___

### footerSmallNavs

• **footerSmallNavs**: [`FooterNavLinkGroup`](FooterNavLinkGroup.md)[]

#### Defined in

index.d.ts:870

___

### history

• **history**: `History`<`any`\>

The [history object](https://github.com/remix-run/history/blob/v4/docs/Navigation.md) that you can use to control application navigation.
e.g. switch to a new url.

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[history](CommonPropsType.md#history)

#### Defined in

index.d.ts:76

___

### isFetchingWhoAmI

• **isFetchingWhoAmI**: `boolean`

Whether or not the user profile loading request is still in progress.

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[isFetchingWhoAmI](CommonPropsType.md#isfetchingwhoami)

#### Defined in

index.d.ts:43

___

### loadedPluginNames

• `Optional` **loadedPluginNames**: `string`[]

An optional property contains a list of names of plugin components who are mounted to replace a built-in component.
Only available for component types that supports more than one plugins to be mounted.
e.g. `ExtraVisualisationSection` plugin components.
When more than one components are mounted to replace a built-in component, each of the plugin component will receive this property.

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[loadedPluginNames](CommonPropsType.md#loadedpluginnames)

#### Defined in

index.d.ts:130

___

### location

• **location**: `Location`<`any`\>

The [location object](https://github.com/remix-run/history/blob/v4/docs/GettingStarted.md#listening) object implements
a subset of [the window.location interface](https://developer.mozilla.org/en-US/docs/Web/API/Location).

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[location](CommonPropsType.md#location)

#### Defined in

index.d.ts:85

___

### match

• **match**: `match`<`any`\>

The match data is about a route at the given path relative to the current location.
It's generated by [react-router](https://v5.reactrouter.com/web/api/match).

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[match](CommonPropsType.md#match)

#### Defined in

index.d.ts:94

___

### noTopMargin

• **noTopMargin**: `boolean`

#### Defined in

index.d.ts:868

___

### requestSignOut

• **requestSignOut**: () => `Promise`<`void`\>

#### Type declaration

▸ (): `Promise`<`void`\>

When called, this function will dispatch the `sign out` action to sign the current user out.

**`Memberof`**

CommonPropsType

##### Returns

`Promise`<`void`\>

#### Inherited from

[CommonPropsType](CommonPropsType.md).[requestSignOut](CommonPropsType.md#requestsignout)

#### Defined in

index.d.ts:101

___

### requestWhoAmI

• **requestWhoAmI**: () => `Promise`<`void`\>

#### Type declaration

▸ (): `Promise`<`void`\>

When called, this function will dispatch an action to force the current user profile data to be reloaded / refreshed.
You may only want to call it after you just modified the user's profile.

**`Memberof`**

CommonPropsType

##### Returns

`Promise`<`void`\>

#### Inherited from

[CommonPropsType](CommonPropsType.md).[requestWhoAmI](CommonPropsType.md#requestwhoami)

#### Defined in

index.d.ts:109

___

### user

• **user**: `User`

the user profile data including roles, permission & orgUnit information.

**`Memberof`**

CommonPropsType

#### Inherited from

[CommonPropsType](CommonPropsType.md).[user](CommonPropsType.md#user)

#### Defined in

index.d.ts:51

___

### whoAmIError

• **whoAmIError**: `Error`

When it's not `null`, this fields contains the error thrown by the user profile loading request

#### Inherited from

[CommonPropsType](CommonPropsType.md).[whoAmIError](CommonPropsType.md#whoamierror)

#### Defined in

index.d.ts:56
