const List = require("inquirer/lib/prompts/list");
const chalk = require("chalk");
const figures = require("figures");
const cliCursor = require("cli-cursor");

/**
 * A customized UI input (selection list).
 * It's built on top of built-in `List` UI input with the following enhancement:
 * - Support `transformer`. Therefore, I can display the answer in a different way.
 * e.g. when you've selected `Yes. auto generate password`, I can display `the generated password`
 * instead of default `Yes. auto generate password`
 */
class ListWithTransformer extends List {
    render(value) {
        // Render question
        var message = this.getQuestion();
        var transformer = this.opt.transformer;

        if (this.firstRender) {
            message += chalk.dim("(Use arrow keys)");
        }

        // Render choices or answer depending on the state
        if (this.status === "answered") {
            if (transformer) {
                message += transformer(value, this.answers);
            } else {
                message += chalk.cyan(
                    this.opt.choices.getChoice(this.selected).short
                );
            }
        } else {
            var choicesStr = listRender(this.opt.choices, this.selected);
            var indexPosition = this.opt.choices.indexOf(
                this.opt.choices.getChoice(this.selected)
            );
            message +=
                "\n" +
                this.paginator.paginate(
                    choicesStr,
                    indexPosition,
                    this.opt.pageSize
                );
        }

        this.firstRender = false;

        this.screen.render(message);
    }

    onSubmit(value) {
        this.status = "answered";

        // Rerender prompt
        this.render(value);

        this.screen.done();
        cliCursor.show();
        this.done(value);
    }
}

/**
 * Function for rendering list choices
 * @param  {Number} pointer Position of the pointer
 * @return {String}         Rendered content
 */
function listRender(choices, pointer) {
    var output = "";
    var separatorOffset = 0;

    choices.forEach((choice, i) => {
        if (choice.type === "separator") {
            separatorOffset++;
            output += "  " + choice + "\n";
            return;
        }

        if (choice.disabled) {
            separatorOffset++;
            output += "  - " + choice.name;
            output +=
                " (" +
                (_.isString(choice.disabled) ? choice.disabled : "Disabled") +
                ")";
            output += "\n";
            return;
        }

        var isSelected = i - separatorOffset === pointer;
        var line = (isSelected ? figures.pointer + " " : "  ") + choice.name;
        if (isSelected) {
            line = chalk.cyan(line);
        }
        output += line + " \n";
    });

    return output.replace(/\n$/, "");
}

module.exports = ListWithTransformer;
