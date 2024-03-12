const unknown2Error = (e: any) => (e instanceof Error ? e : new Error(`${e}`));

export default unknown2Error;
