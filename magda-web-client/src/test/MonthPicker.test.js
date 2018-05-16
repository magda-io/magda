import React from "react";
import { shallow } from "enzyme";
import MonthPicker from "../UI/MonthPicker";

const props = {
    selectMonth: jest.fn(),
    yearUpper: 1990,
    yearLower: 1985,
    monthUpper: 9,
    monthLower: 4,
    year: 1786
};

const monthPicker = shallow(<MonthPicker {...props} />);
describe("Check Year Valid Function", () => {
    it("returns true when  year inside boundary", () => {
        expect(monthPicker.instance().checkYearValid(1988)).toBeTruthy();
    });

    it("returns false when year outside boundary", () => {
        expect(monthPicker.instance().checkYearValid(1998)).toBeFalsy();
    });

    it("returns false when not a year", () => {
        expect(monthPicker.instance().checkYearValid("text")).toBeFalsy();
    });
});

describe("Check Month Valid Function", () => {
    describe("When year == lowerYear", () => {
        it("Month <lowerMonth false", () => {
            expect(monthPicker.instance().checkMonthValid(1985, 3)).toBeFalsy();
        });
        it("Month > lowerMonth true", () => {
            expect(
                monthPicker.instance().checkMonthValid(1985, 7)
            ).toBeTruthy();
        });
    });
    describe("When year ==upperYear", () => {
        it("Month > upperMonth & year=upperYear is false", () => {
            expect(
                monthPicker.instance().checkMonthValid(1990, 10)
            ).toBeFalsy();
        });
        it("Month < upperMonth & year=upperYear is true", () => {
            expect(
                monthPicker.instance().checkMonthValid(1990, 7)
            ).toBeTruthy();
        });
    });
    describe("When lowerYear < year < upperYear", () => {
        it("lowerYear < year < upperYear and month is anything return true", () => {
            expect(
                monthPicker.instance().checkMonthValid(1989, 10)
            ).toBeTruthy();
        });
    });
});

describe("Test change year function", () => {
    beforeEach(() => {
        monthPicker.instance().changeYear(2000);
    });
    it("changes year props", () => {
        expect(monthPicker.instance().props.year).toEqual(2000);
    });
});
