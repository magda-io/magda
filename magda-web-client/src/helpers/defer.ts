const defer = (func: () => any, time: number = 1) => setTimeout(func, time);

export default defer;
