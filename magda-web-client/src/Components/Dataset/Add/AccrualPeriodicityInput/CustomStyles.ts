const customStyles = {
    menu: provided => {
        return {
            ...provided,
            width: "560px",
            position: "static",
            borderRadius: "2px",
            marginTop: "0px",
            overflow: "hidden",
            zIndex: 0
        };
    },
    menuList: provided => ({
        ...provided,
        maxHeight: "380px"
    }),
    control: provided => ({
        ...provided,
        width: "560px",
        borderRadius: "2px"
    })
};

export default customStyles;
