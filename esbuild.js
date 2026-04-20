const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
};

const extensionConfig = {
  ...sharedOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
};

const webviewConfig = {
  ...sharedOptions,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
};

async function run() {
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await Promise.all([ctxExt.watch(), ctxWeb.watch()]);
    console.log('watching...');
  } else {
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
