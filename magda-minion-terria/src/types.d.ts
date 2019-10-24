declare module "xmlhttprequest-ssl";

// These modules start out as typescript, but we don't have declaration files for them
// because Typescript <3.7 can't do `declaration: true` when `allowJs` is true.
declare module "terriajs/dist/lib/Models/MagdaReference";
declare module "terriajs/dist/lib/Models/Terria";
declare module "terriajs/dist/lib/Models/CommonStrata";
declare module "terriajs/dist/lib/Core/Json" {
    export type JsonObject = any;
}
declare module "terriajs/dist/lib/Models/registerCatalogMembers";
declare module "terriajs/dist/lib/Models/saveStratumToJson";
