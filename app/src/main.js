import "./style.css";
import { initTelemetry } from "./telemetry.js";
import { mountApp } from "./ui/app.js";

// vConsole gives us an on-screen console on mobile/embedded browsers.
import("vconsole").then((module) => {
  const VConsole = module.default;
  new VConsole();
});

initTelemetry();

mountApp(document.querySelector("#app"));
