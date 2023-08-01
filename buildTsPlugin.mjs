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
                    /** @type {import('./src/apiCommandsParser').CommandsType} */
                    const builtinCommands = JSON.parse(readFileSync('./out/api-commands.json', 'utf-8'))
                    const commandsObj = builtinCommands
                        .map(command => {
                            const paramsDescriptions = command.args
                                .map(arg => arg.description && `* @param ${arg.name} ${arg.description}`)
                                .filter(Boolean)
                                .join('\n')
                            let string = `/**\n * ${command.description}\n ${paramsDescriptions} */\n`
                            string += `'${command.id}': [${command.output}, ${command.args
                                .map(arg => `${arg.name}${arg.optional ? '?' : ''}: ${arg.typeStringified}`)
                                .join(', ')}]`
                            return string
                        })
                        .join('\n')
                    return {
                        contents: contents.replace('/* GENERATED BUILTIN COMMANDS GO HERE */', commandsObj),
                        loader: 'text',
                    }
                })
            },
        },
    ],
})
