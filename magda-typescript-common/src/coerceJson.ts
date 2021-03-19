export default (param: string) => (json?: string | object | any[]) => {
    if (typeof json !== "string") {
        return json;
    }
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") {
        throw new Error(`Invalid "${param}" parameter.`);
    }
    return data;
};
