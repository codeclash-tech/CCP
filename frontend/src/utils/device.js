export function isMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const isMobileUserAgent =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasNarrowViewport = window.matchMedia("(max-width: 1023px)").matches;

  return isMobileUserAgent || hasCoarsePointer || hasNarrowViewport;
}
