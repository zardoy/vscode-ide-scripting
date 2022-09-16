import { inspect } from 'util'

//@ts-ignore
import type { Configuration, CustomPluginData } from '../../src/configurationType'
import { addObjectMethodResultInterceptors, updateSourceFile } from './util'

export = function ({ typescript }: { typescript: typeof import('typescript/lib/tsserverlibrary') }) {
    const ts = typescript

    let _configuration: (Configuration & CustomPluginData) | undefined
    let updateVersion = 1
    const updateCallbacks: Array<() => void> = []
    return {
        create(info: ts.server.PluginCreateInfo) {
            if (info.project.projectKind !== ts.server.ProjectKind.Inferred) return
            const openedFiles = [...(info.project.projectService.openFiles.keys() as any)] as string[]
            // don't add globals such as code to untitled and other inferred/full projects
            let ourFileRoot: string | undefined
            for (const openedFile of openedFiles) {
                // TODO inspectpostf
                const beforeRootIdx = openedFile.indexOf('/^/idescripting.playground/')
                if (beforeRootIdx === -1) continue
                ourFileRoot = openedFile.slice(0, beforeRootIdx)
                break
            }
            let currentRoot = info.languageServiceHost.getCurrentDirectory().toLowerCase()
            if (currentRoot === '/') currentRoot = ''
            if (ourFileRoot === undefined || currentRoot !== ourFileRoot) {
                return
            }
            console.log('ide scripting plugin activated')
            // in our inferred project
            let isInPlayground = true
            const apiFileName = '^/ideScripting.playground/ts-nul-authority/__virtual-vscode-api.ts'
            // const apiFileName = '/vscode-virtual-api.ts'
            const updateBaseUrl = () => {
                if (!_configuration?.npmRoot) return
                info.project.setCompilerOptions({
                    ...info.project.getCompilerOptions(),
                    baseUrl: _configuration.npmRoot,
                })
            }
            info.project.setCompilerOptions({
                ...info.project.getCompilerOptions(),
                lib: ['lib.esnext.d.ts', 'lib.webworker.d.ts'],
            })
            updateBaseUrl()
            updateCallbacks.push(() => {
                updateBaseUrl()
                const program = info.languageService.getProgram()!
                const sourceFile = program.getSourceFile(apiFileName)!

                updateSourceFile(ts, sourceFile)
                const openedFiles = [...(info.project.projectService.openFiles.keys() as any)] as string[]
                for (let openFile of openedFiles) {
                    const sourceFile = info.languageService.getProgram()?.getSourceFile(openFile)
                    if (!sourceFile) continue
                    // update diagnostics
                    updateSourceFile(ts, sourceFile)
                }
            })

            addObjectMethodResultInterceptors(info.languageServiceHost, {
                getScriptFileNames(files) {
                    return [...files, apiFileName]
                },
                getScriptSnapshot(result, fileName) {
                    if (fileName === apiFileName) {
                        let globalApiTypes = require('GLOBAL_API_CONTENT')
                        globalApiTypes = globalApiTypes
                            .replace("'$VSCODE_ALIASES'", () => {
                                const knownJsdocs = {
                                    vscode: 'Full vscode import',
                                    c: 'Alias for vscode. For the most lazy',
                                }
                                const alises = _configuration?.vscodeAliases ?? ['vscode']
                                return alises
                                    .map(alias => `/** ${knownJsdocs[alias] ?? 'Alias for vscode'} */\ndeclare const ${alias}: typeof import('vscode')`)
                                    .join('\n')
                            })
                            .replaceAll(" | '$ADD_EDITOR_UNDEFINED'", _configuration?.targetEditorVisible ? '' : ' | undefined')
                        return ts.ScriptSnapshot.fromString(globalApiTypes)
                    }
                    return result
                },
                getScriptVersion(result, fileName) {
                    if (fileName === apiFileName) return `${updateVersion}`
                    return result
                },
            })

            const proxy: ts.LanguageService = Object.create(null)

            for (const k of Object.keys(info.languageService)) {
                const x = info.languageService[k]!
                // @ts-expect-error - JS runtime trickery which is tricky to type tersely
                proxy[k] = (...args: Array<Record<string, unknown>>) => x.apply(info.languageService, args)
            }

            proxy.getSyntacticDiagnostics = fileName => {
                const prior = info.languageService.getSyntacticDiagnostics(fileName)
                if (!isInPlayground) return prior
                // https://github.com/microsoft/vscode/issues/160124
                const semanticPrior = info.languageService
                    .getSemanticDiagnostics(fileName)
                    .map((diagnostic): ts.DiagnosticWithLocation => {
                        const { file, start, length } = diagnostic
                        if (file === undefined || start === undefined || length === undefined) return undefined!
                        return {
                            ...diagnostic,
                            file,
                            start,
                            length,
                        }
                    })
                    .filter(Boolean)
                return [...prior, ...semanticPrior]
            }
            proxy.getSemanticDiagnostics = fileName => {
                const prior = info.languageService.getSemanticDiagnostics(fileName)
                if (!isInPlayground) return prior
                const program = info.languageService.getProgram()!
                const sourceFile = program.getSourceFile(fileName)!
                if (_configuration === undefined)
                    prior.push({
                        category: ts.DiagnosticCategory.Message,
                        code: -1,
                        file: sourceFile,
                        messageText: 'no-plugin-configuration',
                        start: 0,
                        length: 0,
                    })
                return prior
            }
            // TODO restore completion info detail
            proxy.getCompletionsAtPosition = (fileName, position, options) => {
                const prior = info.languageService.getCompletionsAtPosition(fileName, position, options)
                if (!isInPlayground) return prior
                if (!prior) return
                if (_configuration?.vscodeNamespaceSuggestions === 'useFirstAlias') {
                    const firstAlias = _configuration.vscodeAliases[0]
                    if (firstAlias) {
                        prior.entries = prior.entries.map(entry => {
                            const importPackage = entry.sourceDisplay?.map(item => item.text).join('')
                            if (importPackage !== 'vscode') return entry
                            return {
                                ...entry,
                                insertText: `${firstAlias}.${entry.name}`,
                                isSnippet: true,
                                hasAction: undefined,
                                source: undefined,
                                data: undefined,
                            }
                        })
                    }
                }
                return prior
            }

            proxy.getDefinitionAndBoundSpan = (fileName, position) => {
                const prior = info.languageService.getDefinitionAndBoundSpan(fileName, position)
                if (!prior) return
                prior.definitions = prior.definitions?.filter(({ fileName }) => fileName !== apiFileName)
                return prior
            }

            return proxy
        },
        onConfigurationChanged(config: any) {
            _configuration = config
            for (const updateCallback of updateCallbacks) {
                updateCallback()
            }
        },
    }
}
