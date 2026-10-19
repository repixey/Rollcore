// Сборка интерфейса: src/main.jsx (+ styles.css) -> public/assets/app.js, app.css
const esbuild = require('esbuild');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: { app: 'src/main.jsx' },
  outdir: 'public/assets',
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  logLevel: 'info'
};

if (watch) esbuild.context(options).then(ctx => ctx.watch());
else esbuild.build(options).catch(() => process.exit(1));
