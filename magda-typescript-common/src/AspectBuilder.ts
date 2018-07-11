import { AspectDefinition } from "./generated/registry/api";

interface AspectBuilder {
    aspectDefinition: AspectDefinition;
    builderFunctionString: string;
    setupFunctionString?: string;
}

export default AspectBuilder;
