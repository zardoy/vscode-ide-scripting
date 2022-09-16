//@ts-check
const { defineConfig } = require('@zardoy/vscode-utils/build/defineConfig.cjs')
const { patchPackageJson } = require('@zardoy/vscode-utils/build/patchPackageJson.cjs')

patchPackageJson({})

module.exports = defineConfig({
    esbuild: {
        banner: {
            js: `const __ESBUILD_BINARY_PATH = require('path').join(__dirname, 'esbuild')`,
        },
        // @ts-ignore
        define: {
            'process.env.ESBUILD_BINARY_PATH': '__ESBUILD_BINARY_PATH',
        },
    },
})
