import * as webllm from "@mlc-ai/web-llm";
import ChatWebLLM from "../ChatWebLLM";
import {
    RunnableSequence,
    Runnable,
    RunnableLambda,
    RunnableConfig
} from "@langchain/core/runnables";

const calculateChain = RunnableLambda.from(async (input) => {
    console.log(input);
    const model = ChatWebLLM.createDefaultModel();
    const result = await model.invokeTool("What is the result of 123x567?", [
        {
            name: "multiplier",
            func: (x, y) => x * y,
            description:
                "return the result of parameter `number1` multiplies `number2`",
            parameters: [
                {
                    name: "number1",
                    type: "number",
                    description:
                        "the first number used to calculate the multiply result"
                },
                {
                    name: "number2",
                    type: "number",
                    description:
                        "the second number used to calculate the multiply result"
                }
            ],
            requiredParameters: ["number1", "number2"]
        }
    ]);
    console.log("result: ", result);
    return JSON.stringify(result);
});

export default calculateChain;
