/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone build for Docker. Keep local builds symlink-free so
  // Windows users do not need elevated symlink privileges to run `pnpm build`.
  ...(process.env.TAVOK_NEXT_STANDALONE === "1"
    ? { output: "standalone" }
    : {}),

  // Strict mode for catching React issues early
  reactStrictMode: true,

  // Transpile the shared package
  transpilePackages: ["@tavok/shared"],

  // Keep OpenTelemetry's runtime instrumentation out of Next's server bundle.
  // Several OTel packages intentionally use dynamic require hooks that are safe
  // at runtime but noisy when webpack tries to statically analyze them.
  serverExternalPackages: [
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/instrumentation-http",
    "@opentelemetry/instrumentation-undici",
    "@opentelemetry/resources",
    "@opentelemetry/sdk-node",
    "@opentelemetry/semantic-conventions",
    "@prisma/instrumentation",
  ],

  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /jose[\\/]dist[\\/]webapi[\\/]lib[\\/]deflate\.js/,
        message: /CompressionStream|DecompressionStream/,
      },
    ];

    return config;
  },

  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' wss: ws:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
