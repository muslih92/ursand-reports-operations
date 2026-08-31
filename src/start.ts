import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.lovable.app https://app.powerbi.com",
    "frame-src 'self' https://app.powerbi.com https://*.powerbi.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; "),
};

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (response?.headers) {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
  }
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));

