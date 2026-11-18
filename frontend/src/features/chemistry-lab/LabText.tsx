import { Text } from "@react-three/drei";
import { configureTextBuilder } from "troika-three-text";
configureTextBuilder({
  defaultFontURL: "/chemistry-lab/fonts/DejaVuSans.ttf",
  unicodeFontsURL: new URL("/chemistry-lab/fonts/unicode/", location.origin)
    .href,
});
import type { ComponentProps } from "react";
// 明确指定本地中文字体及常用字符；不依赖Google Fonts或在线字体回退。
export function LabText(props: ComponentProps<typeof Text>) {
  const localFallback = {
    unicodeFontsURL: new URL("/chemistry-lab/fonts/unicode/", location.origin)
      .href,
  };
  return (
    <Text
      {...props}
      {...localFallback}
      font="/chemistry-lab/fonts/LabCJK.ttf"
    />
  );
}
