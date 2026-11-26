// Tabler 3.44 exports per-icon runtime modules but points their declarations at missing files.
declare module "@tabler/icons-react-native/Icon*" {
  import type { ComponentType } from "react";
  import type { SvgProps } from "react-native-svg";

  const icon: ComponentType<SvgProps & { size?: number }>;
  export default icon;
}
