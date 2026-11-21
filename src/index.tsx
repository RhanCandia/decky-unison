import { staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { QuickAccessPanel } from "./components/QuickAccessPanel";
import { injectGlobalStyles } from "./styles";
import { FaSyncAlt } from "react-icons/fa";

export default definePlugin(() => {
  console.log("[DeckyUnison] Initializing plugin frontend");
  const removeStyles = injectGlobalStyles();

  return {
    name: "Decky Unison",
    titleView: <div className={staticClasses.Title}>Decky Unison</div>,
    content: <QuickAccessPanel />,
    icon: <FaSyncAlt />,
    onDismount() {
      console.log("[DeckyUnison] Unloading plugin frontend");
      removeStyles();
    },
  };
});
