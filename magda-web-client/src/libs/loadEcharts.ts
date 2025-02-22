async function loadEcharts() {
    const result = await import(
        /* webpackChunkName: "echarts-for-react" */ "echarts-for-react"
    );
    return result.default;
}

export default loadEcharts;
