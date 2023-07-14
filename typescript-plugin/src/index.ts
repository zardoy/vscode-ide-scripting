import type ts from 'typescript/lib/tsserverlibrary'
import { inspect } from 'util'

//@ts-ignore
import type { Configuration, CustomPluginData } from '../../src/configurationType'
import { addObjectMethodResultInterceptors, updateSourceFile } from './util'
import specialRequest from './specialRequest'

export = function ({ typescript }: { typescript: typeof import('typescript/lib/tsserverlibrary') }) {
    const ts = typescript

    let _configuration: (Configuration & CustomPluginData) | undefined
    let updateVersion = 1
    const updateCallbacks: Array<() => void> = []
    return {
        create(info: ts.server.PluginCreateInfo) {
            if (info.project?.projectKind !== ts.server.ProjectKind.Inferred) return
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
            _configuration = info.config
            console.log('ide scripting plugin activated')
            // in our inferred project
            let isInPlayground = true
            const apiFileName = '^/ideScripting.playground/ts-nul-authority/__virtual-vscode-api.ts'
            const apiFileName2 = '^/ideScripting.playground/ts-nul-authority/__virtual_globals.d.ts'
            // const apiFileName = '/vscode-virtual-api.ts'
            const updateProjectOptions = () => {
                if (!_configuration?.npmRoot) return
                info.project.setCompilerOptions({
                    ...info.project.getCompilerOptions(),
                    baseUrl: _configuration.npmRoot,
                    paths: {
                        vscode: [_configuration?.vscodeDTsPath],
                    },
                })
            }
            info.project.setCompilerOptions({
                ...info.project.getCompilerOptions(),
                lib: ['lib.esnext.d.ts', 'lib.webworker.d.ts'],
            })
            updateProjectOptions()
            updateCallbacks.push(() => {
                updateProjectOptions()
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
                    return [...files, apiFileName, apiFileName2]
                },
                getScriptSnapshot(result, fileName) {
                    if (fileName === apiFileName) {
                        const vscodeDTs = undefined
                        let globalApiTypes = require('GLOBAL_API_CONTENT')
                        globalApiTypes = globalApiTypes
                            .replace("'$VSCODE_ALIASES'", () => {
                                const knownJsdocs = {
                                    vscode: 'Full vscode import',
                                    c: 'Alias for vscode. For the most lazy',
                                }
                                const alises = _configuration?.vscodeAliases ?? ['vscode']
                                return alises
                                    .filter(alias => alias !== 'vscode')
                                    .map(alias => `/** ${knownJsdocs[alias] ?? 'Alias for vscode'} */\ndeclare const ${alias}: typeof import('vscode')`)
                                    .join('\n')
                            })
                            .replaceAll(" | '$ADD_EDITOR_UNDEFINED'", _configuration?.targetEditorVisible ? '' : ' | undefined')
                        return ts.ScriptSnapshot.fromString(globalApiTypes)
                    }
                    if (fileName === apiFileName2) {
                        const contents = /* ts */ `
                            // There is the only way... to make it work
                            import vscode = require("vscode")
                            export = vscode
                            export as namespace vscode
                            declare global {
                                const vscode: typeof import('vscode')
                            }
                            declare const vscode: typeof import('vscode')
                        `
                        return ts.ScriptSnapshot.fromString(contents)
                    }
                    return result
                },
                getScriptVersion(result, fileName) {
                    if (fileName === apiFileName) return `${updateVersion}`
                    if (fileName === apiFileName2) return `${updateVersion}`
                    return result
                },
            })

            const { languageService } = info

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
            const getFirstAlias = () => {
                if (_configuration?.vscodeNamespaceSuggestions !== 'useFirstAlias') return
                return _configuration.vscodeAliases[0]
            }

            let vscodeExportNames: string[] = []
            proxy.getCompletionsAtPosition = (fileName, position, options) => {
                if (isInPlayground) {
                    const specialResponse = specialRequest(ts, languageService, fileName, position, options ?? {})
                    if (specialResponse === undefined) return
                    if (specialResponse !== null) {
                        return {
                            entries: [],
                            specialResponse,
                        } as any
                    }
                }
                vscodeExportNames = []
                const prior = info.languageService.getCompletionsAtPosition(fileName, position, options)
                if (!isInPlayground) return prior
                if (!prior) return
                const firstAlias = getFirstAlias()
                if (firstAlias) {
                    prior.entries = prior.entries.map(entry => {
                        const importPackage = entry.sourceDisplay?.map(item => item.text).join('')
                        if (importPackage !== 'vscode') return entry
                        vscodeExportNames.push(entry.name)
                        return {
                            ...entry,
                            isSnippet: true,
                            hasAction: true,
                            source: undefined,
                        }
                    })
                }

                return prior
            }

            proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {
                const prior = info.languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data)
                if (!prior) return
                if (vscodeExportNames.includes(entryName)) {
                    const firstAlias = getFirstAlias()
                    if (!firstAlias) return prior
                    const beforeCurrentPos = languageService
                        .getProgram()!
                        .getSourceFile(fileName)!
                        .getFullText()
                        .slice(0, position)
                        .match(/[\w\d]*$/i)!.index!
                    return {
                        ...prior,
                        codeActions: [
                            {
                                description: '',
                                changes: [
                                    {
                                        fileName,
                                        textChanges: [{ span: { start: beforeCurrentPos, length: 0 }, newText: `${firstAlias}.` }],
                                    },
                                ],
                            },
                        ],
                    }
                }
                return prior
            }

            proxy.getDefinitionAndBoundSpan = (fileName, position) => {
                const prior = info.languageService.getDefinitionAndBoundSpan(fileName, position)
                if (!prior) return
                // prior.definitions = prior.definitions?.filter(({ fileName }) => fileName !== apiFileName)
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
