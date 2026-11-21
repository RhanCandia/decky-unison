import { staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { QuickAccessPanel } from "./components/QuickAccessPanel";
import { FaSyncAlt } from "react-icons/fa";

export default definePlugin(() => {
  console.log("[DeckyUnison] Initializing plugin frontend");

  return {
    name: "Decky Unison",
    titleView: <div className={staticClasses.Title}>Decky Unison</div>,
    content: <QuickAccessPanel />,
    icon: <FaSyncAlt />,
    onDismount() {
      console.log("[DeckyUnison] Unloading plugin frontend");
    },
  };
});
