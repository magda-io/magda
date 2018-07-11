import React from "react";

import version from "../../version";

import MapColumn from "terriajs/lib/ReactViews/StandardUserInterface/MapColumn.jsx";
import ExplorerWindow from "terriajs/lib/ReactViews/ExplorerWindow/ExplorerWindow.jsx";
import FeatureInfoPanel from "terriajs/lib/ReactViews/FeatureInfo/FeatureInfoPanel.jsx";
import MapInteractionWindow from "terriajs/lib/ReactViews/Notification/MapInteractionWindow.jsx";
import ExperimentalFeatures from "terriajs/lib/ReactViews/Map/ExperimentalFeatures.jsx";
import Notification from "terriajs/lib/ReactViews/Notification/Notification.jsx";
import ObserveModelMixin from "terriajs/lib/ReactViews/ObserveModelMixin";
import ProgressBar from "terriajs/lib/ReactViews/Map/ProgressBar.jsx";
import processCustomElements from "terriajs/lib/ReactViews/StandardUserInterface/processCustomElements";
import ZoomControl from "terriajs/lib/ReactViews/Map/Navigation/ZoomControl.jsx";
import Styles from "terriajs/lib/ReactViews/StandardUserInterface/standard-user-interface.scss";
import MapNavigationStyles from "terriajs/lib/ReactViews/Map/map-navigation.scss";

import "./global.scss";

export default function UserInterface(props) {
    const customElements = processCustomElements(
        props.viewState.useSmallScreenInterface
    );
    const terria = props.terria;
    const allBaseMaps = props.allBaseMaps;
    return (
        <div className={Styles.uiRoot}>
            <div className={Styles.ui}>
                <section className={Styles.map} style={{ top: "0px" }}>
                    <ProgressBar terria={terria} />
                    <MapColumn terria={terria} viewState={props.viewState} />
                    <main>
                        <ExplorerWindow
                            terria={terria}
                            viewState={props.viewState}
                        />
                        <If
                            condition={
                                props.terria.configParameters
                                    .experimentalFeatures &&
                                !props.viewState.hideMapUi()
                            }
                        >
                            <ExperimentalFeatures
                                terria={terria}
                                viewState={props.viewState}
                                experimentalItems={
                                    customElements.experimentalMenu
                                }
                            />
                        </If>
                    </main>
                </section>
            </div>

            <Notification viewState={props.viewState} />
            <MapInteractionWindow terria={terria} viewState={props.viewState} />

            <div className={Styles.featureInfo}>
                <FeatureInfoPanel terria={terria} viewState={props.viewState} />
            </div>
            <div className={MapNavigationStyles.mapNavigation}>
                <div className={MapNavigationStyles.control}>
                    <ZoomControl terria={props.terria} />
                </div>
            </div>
        </div>
    );
}
