const browserNames = [
    "edge",
    "opera",
    "konqueror",
    "firefox",
    "chrome",
    "epiphany",
    "safari",
    "msie",
    "maxthon"
];

const crawlerPatterns = [
    "Googlebot\\/", // Google
    "Google-InspectionTool\\/", // Google inspectionTool
    "bingbot", // Bing
    "Slurp", // Yahoo
    "DuckDuckBot", // DuckDuckGo
    "Baiduspider", // Baidu
    "yandex\\.com\\/bots", // Yandex
    "Sogou", // Sogou
    "ia_archiver" // Alexa
];

let crawlerRegex: RegExp;

const isCrawler = (ua: string): boolean => {
    if (!ua || typeof ua !== "string") {
        return false;
    }
    if (!crawlerRegex) {
        crawlerRegex = new RegExp(crawlerPatterns.join("|"), "i");
    }
    return crawlerRegex.test(ua);
};

const isBrowserName = (ua: string) => {
    ua = ua.toLowerCase();
    return browserNames.findIndex((name) => ua.indexOf(name) !== -1) !== -1;
};

const isDiscourseCrawler = (ua: string): boolean => ua.toLowerCase() === "ruby";

/**
 * Decide whether we should render crawler view for a particular page.
 * This function will only return `true` when we are very sure about it.
 *
 * @param {(string | undefined)} uaStr
 * @return {*}  {boolean}
 */
const shouldRenderCrawlerView = (
    uaStr: string | undefined,
    enableDiscourseSupport: boolean = false
): boolean => {
    if (!uaStr) {
        return false;
    }
    if (isCrawler(uaStr)) {
        return true;
    }
    if (isBrowserName(uaStr)) {
        return false;
    }
    if (enableDiscourseSupport && isDiscourseCrawler(uaStr)) {
        return true;
    }
    return false;
};

export default shouldRenderCrawlerView;
