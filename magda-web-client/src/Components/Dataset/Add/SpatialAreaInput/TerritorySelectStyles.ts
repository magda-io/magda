const TerritorySelectStyles = {
    menu: provided => {
        return {
            ...provided,
            width: "560px",
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
        width: "560px",
        height: "44px",
        borderRadius: "2px"
    })
};

export default TerritorySelectStyles;
