const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const safeUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
};

const getCurrentOrigin = () => {
  if (typeof window === "undefined") return null;
  return window.location.origin;
};

const shouldUseSameOriginOverPort = (targetUrl) => {
  if (typeof window === "undefined" || !targetUrl) return false;

  const current = new URL(window.location.origin);
  const sameHost = targetUrl.hostname === current.hostname;
  const currentIsHttps = current.protocol === "https:";
  const targetUsesBackendPort = targetUrl.port === "3001";

  return currentIsHttps && sameHost && targetUsesBackendPort;
};

export const getApiBaseUrl = () => {
  const configuredUrl = safeUrl(process.env.REACT_APP_API_URL);

  if (configuredUrl) {
    if (shouldUseSameOriginOverPort(configuredUrl)) {
      return getCurrentOrigin();
    }

    return trimTrailingSlash(configuredUrl.toString());
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//127.0.0.1:3001`;
    }

    return origin;
  }

  return "http://127.0.0.1:3001";
};

export const getSocketServerUrl = () => {
  const configuredUrl = safeUrl(process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL);

  if (configuredUrl) {
    if (shouldUseSameOriginOverPort(configuredUrl)) {
      return getCurrentOrigin();
    }

    return trimTrailingSlash(configuredUrl.toString());
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//127.0.0.1:3001`;
    }

    return origin;
  }

  return "http://127.0.0.1:3001";
};
