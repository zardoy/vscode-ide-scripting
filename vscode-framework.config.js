//@ts-check
const { defineConfig } = require('@zardoy/vscode-utils/build/defineConfig.cjs')
const { patchPackageJson } = require('@zardoy/vscode-utils/build/patchPackageJson.cjs')
const { readFileSync } = require('fs')

patchPackageJson({})

module.exports = defineConfig({
    esbuild: {
        banner: {
            js: `const __ESBUILD_BINARY_PATH = require('path').join(__dirname, process.platform === 'win32' ? 'esbuild.exe' : 'esbuild');__API_COMMANDS=${JSON.stringify(
                readFileSync('./out/api-commands.json', 'utf8'),
            )}`,
        },
        // @ts-ignore
        define: {
            'process.env.ESBUILD_BINARY_PATH': '__ESBUILD_BINARY_PATH',
            'process.env.ESBUILD_BUNDLED_VERSION': JSON.stringify(JSON.parse(readFileSync('./node_modules/esbuild/package.json', 'utf8')).version),
        },
    },
})
