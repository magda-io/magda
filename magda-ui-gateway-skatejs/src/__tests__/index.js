/* @jsx h */

import "babel-polyfill";
import mount from "@skatejs/bore";
import { h } from "@skatejs/val";
import Hello from "..";

test("render", async () => {
    const elem = mount(<Hello name="You" />);
    await elem.wait();
    expect(elem.node.shadowRoot.innerHTML).toMatchSnapshot();
});
