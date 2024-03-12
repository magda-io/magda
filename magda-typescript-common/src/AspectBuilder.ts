import { AspectDefinition } from "./generated/registry/api.js";

interface AspectBuilder {
    aspectDefinition: AspectDefinition;
    builderFunctionString: string;
    setupFunctionString?: string;
}

export default AspectBuilder;
