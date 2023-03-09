export const NO_CACHE = function (req: any, res: any, next: any) {
    if (req?.query?.allowCache === "true") {
        next();
        return;
    }
    res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0"
    });
    next();
};
