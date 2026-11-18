/** 上游同样为此无类型包提供声明；仅声明本模块实际使用的配置入口。 */
declare module "troika-three-text" {
  export function configureTextBuilder(config: {
    defaultFontURL?: string;
    unicodeFontsURL?: string;
    useWorker?: boolean;
  }): void;
}
