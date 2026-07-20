// Minimal test: intercept source, replace ONE flag
const result = await Bun.build({
  entrypoints: ['./src/entrypoints/cli.tsx'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  splitting: false,
  sourcemap: 'external',
  minify: false,
  naming: 'cli.mjs',
  define: {
    'MACRO.VERSION': JSON.stringify('99.0.0'),
    'MACRO.DISPLAY_VERSION': JSON.stringify('0.1.6'),
    'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'MACRO.ISSUES_EXPLAINER': JSON.stringify('report the issue at https://github.com/anthropics/claude-code/issues'),
    'MACRO.PACKAGE_URL': JSON.stringify('@gitlawb/openclaude'),
    'MACRO.NATIVE_PACKAGE_URL': 'undefined',
  },
  plugins: [{
    name: 'test',
    setup(build) {
      // Only replace TRANSCRIPT_CLASSIFIER, don't touch other feature() calls
      build.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
        if (args.path.includes('node_modules')) return undefined
        const source = await Bun.file(args.path).text()
        if (!source.includes("feature('TRANSCRIPT_CLASSIFIER')") && 
            !source.includes('feature("TRANSCRIPT_CLASSIFIER")')) return undefined
        
        const replaced = source
          .replace(/feature\(['"]TRANSCRIPT_CLASSIFIER['"]\)/g, 'true')
        
        if (replaced === source) return undefined
        console.log(`TRANSFORM: ${args.path}`)
        return { contents: replaced, loader: 'tsx' }
      })
    },
  }],
})

console.log('success:', result.success)
for (const log of result.logs.slice(0, 10)) {
  console.log('log:', JSON.stringify(log).slice(0, 200))
}
