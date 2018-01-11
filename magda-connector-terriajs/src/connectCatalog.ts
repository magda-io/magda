import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import * as when from "terriajs-cesium/Source/ThirdParty/when";

export interface ConnectCatalogOptions {
    terria: any;
    registry: AuthorizedRegistryClient
}

export default function(options: ConnectCatalogOptions): Promise<any> {
    const terria = options.terria;
    const registry = options.registry;

    return when(terria.catalog.group.load()).then(function() {
        return processGroupItems(terria.catalog.group, registry);
    });
}

function processGroupItems(group: any, registry: AuthorizedRegistryClient): Promise<void> {
    const items = group.items;

    let i = 0;

    function next() {
        ++i;
        if (i >= items.length) {
            return;
        }

        const member = items[i];

        const loadPromise = member.isGroup ? member.load() : undefined;

        return when(loadPromise).then(function() {
            return processLoadedMember(group, member, registry);
        }).then(next);
    }

    return next();
}

function processLoadedMember(group: any, member: any, registry: AuthorizedRegistryClient): Promise<void> {
    const putPromise = registry.putRecord({
        id: member.uniqueId,
        name: member.name,
        aspects: {}
    });

    if (member.isGroup) {
        return putPromise.then(function() {
            return processGroupItems(member, registry);
        });
    } else {
        return putPromise.then(function() { return; });
    }
}
