import type { BrowserWindow, Session } from "electron";

export const productionContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-hashes' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const developmentContentSecurityPolicy = productionContentSecurityPolicy
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace(
    "style-src 'self' 'unsafe-hashes' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='",
    "style-src 'self' 'unsafe-inline'",
  )
  .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173");

export function configureSessionSecurity(session: Session, development: boolean): void {
  const policy = development ? developmentContentSecurityPolicy : productionContentSecurityPolicy;
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

export function attachNavigationPolicy(window: BrowserWindow, rendererUrl: string): void {
  const allowed = new URL(rendererUrl);
  window.webContents.on("will-navigate", (event, target) => {
    let candidate: URL;
    try {
      candidate = new URL(target);
    } catch {
      event.preventDefault();
      return;
    }
    if (candidate.origin !== allowed.origin || candidate.pathname !== allowed.pathname) {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
