const customStyles = {
    menu: (provided) => {
        return {
            ...provided,
            width: "560px",
            borderRadius: "2px",
            marginTop: "0px",
            zIndex: 3
        };
    },
    menuList: (provided) => ({
        ...provided,
        maxHeight: "380px"
    }),
    control: (provided) => ({
        ...provided,
        width: "560px",
        height: "44px",
        borderRadius: "2px"
    })
};

export default customStyles;
