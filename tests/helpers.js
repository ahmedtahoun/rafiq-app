/**
 * Console noise this sandbox emits that says nothing about the app: the
 * proxy's certificate, a missing favicon, and blocked outbound fetches.
 * Everything else that reaches console.error is treated as a real failure
 * by the suites, which is the point — a screen that renders but warns is
 * not a passing screen.
 */
export const IGNORED_CONSOLE = /ERR_CERT_AUTHORITY_INVALID|favicon\.ico|net::ERR_/;
