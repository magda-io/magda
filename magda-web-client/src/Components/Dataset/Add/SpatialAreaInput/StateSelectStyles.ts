const StateSelectStyles = {
    menu: provided => {
        return {
            ...provided,
            borderRadius: "2px",
            marginTop: "0px",
            // --- float over leaflet map zoom ctrl
            zIndex: 1001
        };
    },
    menuList: provided => ({
        ...provided,
        maxHeight: "380px"
    }),
    control: provided => ({
        ...provided,
        height: "44px",
        borderRadius: "2px"
    })
};

export default StateSelectStyles;
