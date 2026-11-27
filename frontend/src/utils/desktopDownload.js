export const DOWNLOAD_URL =
  "https://github.com/codeclash-tech/CCP/releases/download/v1.0.0/CogniClash.Setup.exe";

const MOBILE_DEVICE_PATTERN =
  /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;

export function isDesktopRuntime() {
  return typeof window !== "undefined" && Boolean(window.codeClashDesktop);
}

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;

  const { userAgent, userAgentData, platform, maxTouchPoints } = navigator;
  const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;

  return (
    userAgentData?.mobile === true ||
    MOBILE_DEVICE_PATTERN.test(userAgent) ||
    isIPadOS
  );
}
