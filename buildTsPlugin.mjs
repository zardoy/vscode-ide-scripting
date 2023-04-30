//@ts-check
import buildTsPlugin from '@zardoy/vscode-utils/build/buildTypescriptPlugin.js'
import { readFileSync } from 'fs'

const prod = process.argv[2] === 'prod'

await buildTsPlugin('typescript-plugin', undefined, undefined, {
    logLevel: 'info',
    watch: !prod,
    sourcemap: !prod ? 'inline' : undefined,
    minify: prod,
    plugins: [
        {
            name: 'virtual-script-provider',
            setup(build) {
                build.onResolve({ filter: /GLOBAL_API_CONTENT/ }, () => {
                    return {
                        namespace: 'GLOBAL_API_CONTENT',
                        path: 'GLOBAL_API_CONTENT',
                    }
                })
                build.onLoad({ filter: /.*/, namespace: 'GLOBAL_API_CONTENT' }, () => {
                    const contents = readFileSync('./typescript-plugin/globalApiTypes.ts', 'utf-8')
                    return {
                        contents,
                        loader: 'text',
                    }
                })
            },
        },
    ],
})
