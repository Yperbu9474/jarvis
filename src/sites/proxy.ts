/**
 * Site Builder — HTTP/WebSocket Proxy
 *
 * Proxies requests from /api/sites/:projectId/proxy/* to the project's
 * dev server running on localhost. Dev server ports are never exposed
 * directly — all access goes through this proxy.
 *
 * For HTML responses, rewrites absolute paths (e.g. /src/main.tsx)
 * to go through the proxy (e.g. /api/sites/:id/proxy/src/main.tsx),
 * so that assets load correctly in the iframe.
 */

import type { DevServerManager } from './dev-server-manager.ts';

const PROXY_PATH_REGEX = /^\/api\/sites\/([^/]+)\/proxy(\/.*)?$/;

export class SiteProxy {
  constructor(private devServerManager: DevServerManager) {}

  /**
   * Check if a pathname matches the proxy pattern.
   * Returns the projectId and sub-path, or null if no match.
   */
  matchProxy(pathname: string): { projectId: string; subPath: string } | null {
    const match = pathname.match(PROXY_PATH_REGEX);
    if (!match) return null;
    return {
      projectId: match[1]!,
      subPath: match[2] || '/',
    };
  }

  /**
   * Proxy an HTTP request to the project's dev server.
   */
  async proxyHttp(req: Request, projectId: string, subPath: string): Promise<Response> {
    const port = this.devServerManager.getPort(projectId);
    if (port === null) {
      return new Response(JSON.stringify({ error: `Dev server for "${projectId}" is not running` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targetUrl = `http://127.0.0.1:${port}${subPath}`;
    const proxyBase = `/api/sites/${projectId}/proxy`;

    try {
      // Forward the request with original method, headers, and body
      const headers = new Headers(req.headers);
      headers.delete('host');
      headers.set('host', `127.0.0.1:${port}`);
      headers.set('x-forwarded-for', '127.0.0.1');
      headers.set('x-forwarded-proto', 'http');

      const proxyReq: RequestInit = {
        method: req.method,
        headers,
        redirect: 'manual',
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        proxyReq.body = req.body;
      }

      const resp = await fetch(targetUrl, proxyReq);

      // Handle redirects — rewrite Location header to go through proxy
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (location) {
          const rewritten = location.startsWith('/') ? proxyBase + location : location;
          return new Response(null, {
            status: resp.status,
            headers: { 'Location': rewritten },
          });
        }
      }

      const contentType = resp.headers.get('content-type') ?? '';
      const respHeaders = new Headers(resp.headers);
      respHeaders.delete('transfer-encoding');

      // For HTML responses, rewrite absolute paths to go through proxy
      if (contentType.includes('text/html')) {
        let html = await resp.text();
        html = this.rewriteHtml(html, proxyBase);
        respHeaders.set('content-length', String(new TextEncoder().encode(html).length));
        return new Response(html, {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
        });
      }

      // For JS module responses, rewrite bare absolute imports
      if (contentType.includes('javascript') || contentType.includes('application/json')) {
        let body = await resp.text();
        body = this.rewriteJs(body, proxyBase);
        respHeaders.set('content-length', String(new TextEncoder().encode(body).length));
        return new Response(body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
        });
      }

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: `Proxy error: ${err instanceof Error ? err.message : String(err)}`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Get the WebSocket target URL for a proxied connection.
   * Returns null if the project isn't running.
   */
  getWebSocketTarget(projectId: string, subPath: string): string | null {
    const port = this.devServerManager.getPort(projectId);
    if (port === null) return null;
    return `ws://127.0.0.1:${port}${subPath}`;
  }

  // ── Rewriting ──

  /**
   * Rewrite HTML: change src="/..." and href="/..." to go through the proxy.
   */
  private rewriteHtml(html: string, proxyBase: string): string {
    // Rewrite src="/ and href="/ attributes
    html = html.replace(/(src|href|action)=(["'])\//g, `$1=$2${proxyBase}/`);
    // Rewrite import("/...") and from "/..."
    html = html.replace(/from\s+(["'])\//g, `from $1${proxyBase}/`);
    html = html.replace(/import\s*\(\s*(["'])\//g, `import($1${proxyBase}/`);
    return html;
  }

  /**
   * Rewrite JS: change bare absolute imports (from "/...", import("/..."))
   * to go through the proxy.
   */
  private rewriteJs(js: string, proxyBase: string): string {
    // from "/node_modules/..." → from "/api/sites/:id/proxy/node_modules/..."
    js = js.replace(/from\s+(["'])\//g, `from $1${proxyBase}/`);
    // import("/...") dynamic imports
    js = js.replace(/import\s*\(\s*(["'])\//g, `import($1${proxyBase}/`);
    // new URL("/...", import.meta.url)
    js = js.replace(/new\s+URL\s*\(\s*(["'])\//g, `new URL($1${proxyBase}/`);
    return js;
  }
}
