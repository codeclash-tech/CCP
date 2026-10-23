const ACCESS_TOKEN_KEY = "ccp_access_token";
const REFRESH_TOKEN_KEY = "ccp_refresh_token";

let desktopTokens;
let desktopTokenRequest;

async function readDesktopTokens() {
  if (desktopTokens) return desktopTokens;
  if (!desktopTokenRequest) {
    desktopTokenRequest = window.codeClashDesktop.auth
      .getTokens()
      .then(async (tokens) => {
        if (!tokens.accessToken && !tokens.refreshToken) {
          const legacyTokens = {
            accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
            refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
          };
          if (legacyTokens.accessToken || legacyTokens.refreshToken) {
            await window.codeClashDesktop.auth.setTokens(legacyTokens);
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            tokens = legacyTokens;
          }
        }
        desktopTokens = tokens;
        return tokens;
      })
      .finally(() => {
        desktopTokenRequest = null;
      });
  }
  return desktopTokenRequest;
}

export async function getStoredCredential(key) {
  if (key !== ACCESS_TOKEN_KEY && key !== REFRESH_TOKEN_KEY) {
    throw new TypeError("Unsupported authentication credential.");
  }
  if (typeof window.codeClashDesktop?.auth?.getTokens === "function") {
    const tokens = await readDesktopTokens();
    return key === ACCESS_TOKEN_KEY
      ? tokens.accessToken
      : tokens.refreshToken;
  }
  return localStorage.getItem(key);
}

export async function hasStoredCredential() {
  const [accessToken, refreshToken] = await Promise.all([
    getStoredCredential(ACCESS_TOKEN_KEY),
    getStoredCredential(REFRESH_TOKEN_KEY),
  ]);
  return Boolean(accessToken || refreshToken);
}

export async function storeAuthTokens(accessToken, refreshToken) {
  if (typeof window.codeClashDesktop?.auth?.setTokens === "function") {
    const tokens = { accessToken, refreshToken };
    await window.codeClashDesktop.auth.setTokens(tokens);
    desktopTokens = tokens;
    return;
  }
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  else localStorage.removeItem(ACCESS_TOKEN_KEY);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function clearAuthTokens() {
  if (typeof window.codeClashDesktop?.auth?.clearTokens === "function") {
    await window.codeClashDesktop.auth.clearTokens();
    desktopTokens = { accessToken: null, refreshToken: null };
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
