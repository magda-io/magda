const getNoCacheHeaders = () => ({
    "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
    Expires: "Thu, 01 Jan 1970 00:00:00 GMT",
    "Last-Modified": new Date().toUTCString()
});

export default getNoCacheHeaders;
