const CountrySelectStyles = {
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
        borderRadius: "2px"
    })
};

export default CountrySelectStyles;
