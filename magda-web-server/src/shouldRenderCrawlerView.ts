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

const isBrowserName = (ua: string) => {
    ua = ua.toLowerCase();
    return browserNames.findIndex((name) => ua.indexOf(name) !== -1) !== -1;
};

const isBot = (ua: string): boolean =>
    ua.match(
        /curl|Bot|B-O-T|Crawler|Spider|Spyder|Yahoo|ia_archiver|Covario-IDS|findlinks|DataparkSearch|larbin|Mediapartners-Google|NG-Search|Snappy|Teoma|Jeeves|Charlotte|NewsGator|TinEye|Cerberian|SearchSight|Zao|Scrubby|Qseero|PycURL|Pompos|oegp|SBIder|yoogliFetchAgent|yacy|webcollage|VYU2|voyager|updated|truwoGPS|StackRambler|Sqworm|silk|semanticdiscovery|ScoutJet|Nymesis|NetResearchServer|MVAClient|mogimogi|Mnogosearch|Arachmo|Accoona|holmes|htdig|ichiro|webis|LinkWalker|lwp-trivial/i
    ) && !ua.match(/mobile|Playstation/i);

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
    if (isBrowserName(uaStr)) {
        return false;
    }
    if (isBot(uaStr)) {
        return true;
    }
    if (enableDiscourseSupport && isDiscourseCrawler(uaStr)) {
        return true;
    }
    return false;
};

export default shouldRenderCrawlerView;
