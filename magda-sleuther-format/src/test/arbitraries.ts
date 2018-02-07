import * as jsc from "jsverify";

//@ private
export let getRandomString = (length: number, chars: string) => {
    let result = "";
    for (let i = length; i > 0; --i) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
};

/*export const alphanumericSymbolsArb = (maxLength: number, maxRows: number, additionalSymbols = '') => jsc.bless<string[]>({
  generator: jsc.generator.bless(() => {
      const stringLength = jsc.random(1, maxLength);

      let arr = [];
      for(let i = 0; i < maxRows; i++) {
        arr.push(getRandomString(stringLength, `0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ${additionalSymbols}`));
      }

      return arr; 
    }
  ),
  show: (val) => val,
  shrink: jsc.shrink.noop
});*/

export const alphanumericSymbolsArb = (
    maxLength: number,
    maxRows: number,
    additionalSymbols = ""
) => ({
    generator: jsc.generator.bless(() => {
        const stringLength = jsc.random(1, maxLength);

        let arr = [];
        for (let i = 0; i < maxRows; i++) {
            arr.push(
                getRandomString(
                    stringLength,
                    `0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ${additionalSymbols}`
                )
            );
        }

        return getRandomString(
            stringLength,
            `0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ${additionalSymbols}`
        );
    }),
    show: (val: any) => val,
    shrink: jsc.shrink.noop
});
