import { Tenant } from "../tenant-api/Tenant";

const mockTenantData = [
    {
        id: 0,
        domainname: "built-in",
        enabled: true
    },
    {
        id: 1,
        domainname: "web1.com",
        enabled: true
    },
    {
        id: 2,
        domainname: "web2.com",
        enabled: false
    }
];

let nextTenantId = 3;
let runtimeTenantDataStore: Tenant[];

const mockTenantDataStore = {
    reset: function() {
        runtimeTenantDataStore = mockTenantData.map(item => ({ ...item }));
        nextTenantId = 3;
    },

    getTenants: function() {
        return runtimeTenantDataStore;
    },

    createTenant(tenant: Tenant) {
        const newTenant: any = { ...tenant, id: nextTenantId++ };
        runtimeTenantDataStore.push(newTenant);
        return newTenant;
    },
    countTenants: function() {
        return runtimeTenantDataStore.length;
    }
};

mockTenantDataStore.reset();

export default mockTenantDataStore;
