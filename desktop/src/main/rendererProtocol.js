import path from "node:path";

export const CODECLASH_RENDERER_ORIGIN = "codeclash://app";

export function resolveRendererPath(rawUrl, rendererDirectory) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "codeclash:" ||
    url.hostname !== "app" ||
    url.port ||
    url.username ||
    url.password
  ) {
    return null;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const resolvedDirectory = path.resolve(rendererDirectory);
  const resolvedPath = path.resolve(resolvedDirectory, `.${pathname}`);
  const relativePath = path.relative(resolvedDirectory, resolvedPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return resolvedPath;
}
