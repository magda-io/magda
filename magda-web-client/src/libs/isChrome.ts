function isChrome() {
    return (
        !!(window as any)?.chrome &&
        (!!(window as any)?.chrome?.webstore ||
            !!(window as any)?.chrome?.runtime)
    );
}

export default isChrome;
