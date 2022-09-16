//@ts-check
import buildTsPlugin from '@zardoy/vscode-utils/build/buildTypescriptPlugin.js'
import { readFileSync } from 'fs'

const prod = process.argv[2] === 'prod'

await buildTsPlugin('typescript-plugin', undefined, undefined, {
    logLevel: 'info',
    watch: !prod,
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
                    const basicContent = readFileSync('./typescript-plugin/globalApiTypes.ts', 'utf-8')
                    let vscodeDts
                    try {
                        vscodeDts = readFileSync('./node_modules/vscode-latest/index.d.ts', 'utf-8')
                    } catch (err) {
                        if (process.env.CI) throw new Error('Latest vscode types must be installed!')
                        vscodeDts = readFileSync('./node_modules/@types/vscode/index.d.ts', 'utf-8')
                    }
                    return {
                        contents: basicContent + '\n' + vscodeDts,
                        loader: 'text',
                    }
                })
            },
        },
    ],
})
