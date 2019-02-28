export default (param: string) => (json?: string) => {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") {
        throw new Error(`Invalid "${param}" parameter.`);
    }
    return data;
};
