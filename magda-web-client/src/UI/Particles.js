import React, { Component } from "react";
import ReactParticles from "react-particles-js";
import "./Particles.css";

class Particles extends Component {
    render() {
        return (
            <div className="particles">
                <ReactParticles
                    width={this.props.width}
                    height={this.props.height}
                    params={{
                        particles: {
                            number: {
                                value: 3
                            },
                            color: {
                                value: "#F55860"
                            },
                            shape: {
                                type: "circle",
                                stroke: {
                                    width: 0,
                                    color: "#F55860"
                                }
                            },
                            size: {
                                value: 50,
                                random: true,
                                anim: {
                                    enable: false,
                                    speed: 80,
                                    size_min: 0.1,
                                    sync: false
                                }
                            }
                        },
                        line_linked: {
                            enable: false
                        }
                    }}
                />
            </div>
        );
    }
}

export default Particles;
