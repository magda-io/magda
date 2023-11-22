import pg from "pg";

// int8ToNumber
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

// 1016 = Type Id for arrays of BigInt values
const parseBigIntArray = pg.types.getTypeParser(1016 as any, "text");
pg.types.setTypeParser(1016 as any, (v) => {
    const defaultParsedVal = parseBigIntArray(v);
    if (!defaultParsedVal) {
        return defaultParsedVal;
    }
    return defaultParsedVal.map((v: string) => parseInt(v, 10));
});
