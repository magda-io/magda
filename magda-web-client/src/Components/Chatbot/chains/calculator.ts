import * as webllm from "@mlc-ai/web-llm";
import ChatWebLLM from "../ChatWebLLM";
import {
    RunnableSequence,
    Runnable,
    RunnableLambda,
    RunnableConfig
} from "@langchain/core/runnables";

const tools: Array<webllm.ChatCompletionTool> = [
    {
        type: "function",
        function: {
            name: "multiplier",
            description:
                "return the result of parameter `number1` multiplies `number2`",
            parameters: {
                type: "object",
                properties: {
                    number1: {
                        type: "number",
                        description:
                            "the first number used to calculate the multiply result"
                    },
                    number2: {
                        type: "number",
                        description:
                            "the second number used to calculate the multiply result"
                    }
                },
                required: ["number1", "number2"]
            }
        }
    }
];

const calculateChain = RunnableLambda.from(async () => {
    const model = ChatWebLLM.createDefaultModel();
    const request: webllm.ChatCompletionRequest = {
        stream: false, // works with stream as well, where the last chunk returns tool_calls
        //stream_options: { include_usage: true },
        messages: [
            {
                role: "user",
                content: "What is the result of 123x567?"
            }
        ],
        tool_choice: "auto",
        tools: tools
    };
    const engine = await model.getEngine();
    const reply = await engine.chat.completions.create(request);
    console.log(reply.choices[0]);
    console.log(reply.usage);
    return JSON.stringify(reply);

    // const asyncChunkGenerator = await engine.chat.completions.create(request);
    // let message = "";
    // let lastChunk: webllm.ChatCompletionChunk | undefined;
    // let usageChunk: webllm.ChatCompletionChunk | undefined;
    // for await (const chunk of asyncChunkGenerator) {
    //     console.log(chunk);
    //     message += chunk.choices[0]?.delta?.content || "";
    //     console.log("generate-label: ", message);
    //     console.log("chunk: ", chunk);
    //     if (!chunk.usage) {
    //         lastChunk = chunk;
    //     }
    //     usageChunk = chunk;
    // }
    // console.log(lastChunk!.choices[0].delta);
    // console.log(usageChunk!.usage);
    // return message;
});

export default calculateChain;
