export const DOWNLOAD_URL =
  "https://github.com/codeclash-tech/CCP/releases/download/v1.0.0/CogniClash.Setup.exe";

export function isDesktopRuntime() {
  return typeof window !== "undefined" && Boolean(window.codeClashDesktop);
}
