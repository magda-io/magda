function isChrome() {
    return !!(window as any)?.chrome;
}

export default isChrome;
