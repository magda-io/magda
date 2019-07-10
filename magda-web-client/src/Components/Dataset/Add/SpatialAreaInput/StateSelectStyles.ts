const StateSelectStyles = {
    menu: provided => {
        return {
            ...provided,
            borderRadius: "2px",
            marginTop: "0px",
            zIndex: 3
        };
    },
    menuList: provided => ({
        ...provided,
        maxHeight: "380px"
    }),
    control: provided => ({
        ...provided,
        borderRadius: "2px"
    })
};

export default StateSelectStyles;
