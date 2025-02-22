import * as webllm from "@mlc-ai/web-llm";
import ChatWebLLM from "../ChatWebLLM";
import {
    RunnableSequence,
    Runnable,
    RunnableLambda,
    RunnableConfig
} from "@langchain/core/runnables";
import {
    EVENT_TYPE_COMPLETE_MSG,
    EVENT_TYPE_PARTIAL_MSG,
    createChatEventMessage
} from "../Messaging";
import { ChainInput } from "../commons";

const calculateChain = RunnableLambda.from(async (input: ChainInput) => {
    console.log("input:", input);
    const model = ChatWebLLM.createDefaultModel();
    const result = await model.invokeTool(
        input.question,
        [
            {
                name: "multiplier",
                func: function (x, y) {
                    // --- this will be bound to the thisObj parameter of `invokeTool`
                    console.log(this);
                    const queue = (this as any).queue;
                    queue.push(
                        createChatEventMessage(EVENT_TYPE_COMPLETE_MSG, {
                            msg: "Calling multiplier tool..."
                        })
                    );
                    return x * y;
                },
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
        ],
        input
    );
    const queue = input.queue;
    queue.push(
        createChatEventMessage(EVENT_TYPE_COMPLETE_MSG, {
            msg: `The calculation result is ${result?.value}`
        })
    );
    console.log("result: ", result);
    // don't have to return anything
    return "calculation done";
});

export default calculateChain;
