/**
 * Next.js configuration.
 *
 * Three concerns specific to in-browser ONNX inference:
 *
 *  1. Cross-origin isolation. WASM multi-threading (and `SharedArrayBuffer`)
 *     require COOP/COEP. `credentialless` COEP keeps SharedArrayBuffer available
 *     while still permitting no-cors cross-origin fetches of model/wasm assets
 *     from CDNs that do not emit CORP headers.
 *  2. `.js` specifier resolution. The TypeScript core uses ESM `.js` import
 *     specifiers that resolve to `.ts` sources; webpack needs an explicit
 *     extension alias to follow them.
 *  3. Node built-in shims. `onnxruntime-web` references Node core modules that
 *     do not exist in the browser bundle; stub them out.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ESLint is not yet a dependency (tracked in the ledger); do not gate builds on it.
  eslint: { ignoreDuringBuilds: true },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    // Inference runs in the browser via onnxruntime-web. Stub the Node-only
    // backends so the server compilation does not try to bundle native `.node`
    // binaries (and the image dep `sharp`) pulled in by the Transformers.js
    // node build.
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node$": false,
      sharp$: false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    // onnxruntime-web emits pre-minified ESM worker bundles (e.g.
    // `ort.bundle.min.mjs`) that use `import.meta`. Terser's default test
    // matches `.mjs` and re-minifies them as non-modules, which rejects
    // `import.meta`. They are already minified, so exclude them from Terser.
    // Emitted as e.g. `static/media/ort.bundle.min.<hash>.mjs`, so match the ort
    // worker/wasm-glue bundles by name (a content hash precedes the extension).
    // The bundles are emitted as content-hashed assets (e.g.
    // `static/media/ort.bundle.min.<hash>.mjs`) and Next wraps its minimizer so
    // its options cannot be configured. terser-webpack-plugin skips any asset
    // already flagged `minimized`; mark the ort bundles as such before the
    // minify stage so Terser leaves them untouched.
    config.plugins.push({
      apply(compiler) {
        const { Compilation } = compiler.webpack;
        compiler.hooks.compilation.tap("SkipMinifyOrtBundle", (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: "SkipMinifyOrtBundle",
              stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
            },
            (assets) => {
              for (const name of Object.keys(assets)) {
                if (!/ort.*\.m?js$/i.test(name)) {
                  continue;
                }
                const asset = compilation.getAsset(name);
                if (asset !== undefined) {
                  compilation.updateAsset(name, asset.source, {
                    ...asset.info,
                    minimized: true,
                  });
                }
              }
            },
          );
        });
      },
    });
    return config;
  },
};

export default nextConfig;
