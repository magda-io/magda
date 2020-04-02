const uuidRegEx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: any) => typeof id === "string" && uuidRegEx.test(id);
export default isUuid;
