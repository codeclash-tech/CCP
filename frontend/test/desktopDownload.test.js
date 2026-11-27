import assert from "node:assert/strict";
import test from "node:test";
import { isMobileDevice } from "../src/utils/desktopDownload.js";

test("detects phones and iPadOS without classifying desktop browsers as mobile", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const setNavigator = (values) => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        userAgent: "",
        platform: "",
        maxTouchPoints: 0,
        ...values,
      },
    });
  };

  try {
    setNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    assert.equal(isMobileDevice(), true);

    setNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    assert.equal(isMobileDevice(), true);

    setNavigator({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
    });
    assert.equal(isMobileDevice(), false);
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
});
