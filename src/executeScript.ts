import * as vscode from 'vscode'
import { exec } from 'child_process'
import { build, BuildOptions } from 'esbuild'
import { partition, mergeDeepRight } from 'rambda'
import requireFromString from 'require-from-string'
import { registerExtensionCommand, getExtensionSetting, extensionCtx, getExtensionCommandId, showQuickPick, GracefulCommandError } from 'vscode-framework'
import { SCHEME } from './fileSystem'
import { join } from 'path'
import { globalNodeModulesRoot } from './tsPluginIntegration'
import { Utils } from 'vscode-uri'
import { dirname } from 'path/posix'
import { promisify } from 'util'
import { readFileSync, unlinkSync } from 'fs'
import { esbuildPath, installEsbuild } from './esbuild'
import { newPromise } from './util'

export default () => {
    let disposeFromPrevScriptCommands: vscode.Disposable[] | undefined

    type AdditionalExecOptions = {
        injectScript?: string
        __filename?: string
    }

    const executeScriptHandler = async (
        _,
        playgroundScriptArg?: string | vscode.Uri | null,
        targetEditorUriArg?: vscode.Uri | null,
        esbuildOptionsArg: BuildOptions = {},
        additionalOptions: AdditionalExecOptions = {},
    ) => {
        await checkEsbuild()

        if (!(targetEditorUriArg instanceof vscode.Uri)) targetEditorUriArg = undefined
        const { visibleTextEditors } = vscode.window
        let targetEditor: vscode.TextEditor | undefined
        let playgroundEditor: vscode.TextEditor | undefined
        let playgroundScriptContents: string | undefined
        if (!targetEditorUriArg || !playgroundScriptArg) {
            let [playgroundEditors, targetEditors] = partition(({ document: { uri } }) => uri.scheme === SCHEME, visibleTextEditors as vscode.TextEditor[])
            // TODO remove this limitation somehow
            targetEditors = targetEditors.filter(({ document: { uri } }) => !['output'].includes(uri.scheme))
            if (playgroundEditors.length !== 1) throw new Error('One playground editor must be visible')
            playgroundEditor = playgroundEditors[0]!
            targetEditor = targetEditors[0]
        } else {
            targetEditor = vscode.window.visibleTextEditors.find(({ document: { uri } }) => uri === targetEditorUriArg)!
            if (!targetEditor) throw new Error(`Can't find target editor from provided arg ${targetEditorUriArg.toString()}`)
            if (typeof playgroundScriptArg === 'string') {
                playgroundScriptContents = playgroundScriptArg
            } else {
                playgroundEditor = vscode.window.visibleTextEditors.find(({ document: { uri } }) => uri === playgroundScriptArg)!
                if (!playgroundEditor) throw new Error(`Can't find playground editor from provided arg ${playgroundScriptArg.toString()}`)
            }
        }

        // the possibilities of this pattern should be insane
        let { injectScript, __filename } = additionalOptions
        if (injectScript === undefined) {
            injectScript = readFileSync(join(__dirname, './resources/injectScript.js'), 'utf-8')
        }

        injectScript = injectScript.replace('$TEXT_EDITOR_URI', targetEditor ? targetEditor.document.uri.toString() : '').replace("'$VSCODE_ALIASES'", () => {
            return getExtensionSetting('vscodeAliases')
                .filter(a => a !== 'vscode')
                .map(alias => `const ${alias} = vscode`)
                .join('\n')
        })

        if (__filename) {
            injectScript = `__filename = "${__filename}"\n__dirname = "${dirname(__filename)}"\n\n${injectScript}`
        }

        const userCodeToBundle = playgroundScriptContents ?? playgroundEditor!.document.getText()
        const buildResult = await esbuildBundle(injectScript, userCodeToBundle, esbuildOptionsArg)
        if (!buildResult) return

        if (disposeFromPrevScriptCommands) await vscode.commands.executeCommand(getExtensionCommandId('disposeDisposables'))
        if (getExtensionSetting('clearOutputBeforeStart')) console.clear()
        const buildScriptText = buildResult.outputFiles[0]!.text
        // const buildLines = buildScriptText.split('\n')
        globalThis.__IDE_SCRIPTING_CONSOLE = console
        const openConsole = getExtensionSetting('openOutputBeforeStart')
        // todo ast detection
        if ((openConsole === 'ifNeeded' && userCodeToBundle.includes('console.log')) || openConsole === 'always') {
            console.show(true)
        }
        setImmediate(() => {
            try {
                const executionResult: ScriptResultExports = requireFromString(buildScriptText)
                if (!executionResult.disposables) return
                vscode.Disposable.from(...(disposeFromPrevScriptCommands ?? [])).dispose()
                registerExtensionCommand('disposeDisposables', () => {
                    vscode.Disposable.from(...executionResult.disposables.map(([disposable]) => disposable)).dispose()
                })
                registerExtensionCommand('disposeSelected', async (_, title?: string) => {
                    const disposable = title
                        ? executionResult.disposables.find(dis => dis[1] === title)?.[0]
                        : await showQuickPick(
                              executionResult.disposables.map(([disposable, title], i) => {
                                  return {
                                      label: title || `Disposable ${i}`,
                                      value: disposable,
                                  }
                              }),
                              { title: 'Select disposable to dispose' },
                          )
                    if (!disposable) return
                    disposable.dispose()
                })
                disposeFromPrevScriptCommands = extensionCtx.subscriptions.slice(-2)
            } catch (err) {
                vscode.window.showErrorMessage('Error when executing script', { modal: true, detail: err.stack ?? err.message ?? err })
            }
            // TODO create decoration
        })
    }

    registerExtensionCommand('executeScript', async (...args) => {
        try {
            await executeScriptHandler(...args)
        } catch (err) {
            console.error(err)
            throw new GracefulCommandError(err.message)
        }
    })

    registerExtensionCommand('executeScriptFromCurrentEditor', async () => {
        const { activeTextEditor } = vscode.window
        const { scheme } = activeTextEditor!?.document.uri
        if (!activeTextEditor || ['output'].includes(scheme)) return
        const filePath = ['file'].includes(scheme) ? activeTextEditor.document.uri : undefined
        let fileDir = filePath ? Utils.dirname(filePath) : undefined
        const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
        if (scheme === 'untitled' && firstWorkspaceFolder) fileDir = firstWorkspaceFolder
        await vscode.commands.executeCommand(
            getExtensionCommandId('executeScript'),
            activeTextEditor.document.getText(),
            activeTextEditor.document.uri,
            fileDir
                ? {
                      stdin: {
                          resolveDir: fileDir.fsPath,
                      },
                  }
                : undefined,
            {
                __filename: filePath?.fsPath,
            },
        )
    })
}

interface ScriptResultExports {
    disposables: [vscode.Disposable, string?][]
}

const checkEsbuild = async () => {
    const esbuildInstallPromise = newPromise()
    installEsbuild(esbuildInstallPromise.resolve)
    await esbuildInstallPromise.promise
    let { stdout: version } = await promisify(exec)(`${process.env.ESBUILD_BINARY_PATH} ${['--version'].join(' ')}`, {})
    version = version.trim()
    if (version !== process.env.ESBUILD_BUNDLED_VERSION) {
        const choice = await vscode.window.showErrorMessage(
            `Installed esbuild ${version} is not compatible with bundled (needed) version ${process.env.ESBUILD_BUNDLED_VERSION}`,
            'Reinstall esbuild',
        )
        if (choice === 'Reinstall esbuild') {
            unlinkSync(esbuildPath)
            installEsbuild(undefined)
        }
    }
}

export const esbuildBundle = async (injectScript: string, userCodeToBundle: string, esbuildOptionsArg: any) => {
    const esbuildBuildOptions = getExtensionSetting('esbuildBuildOptions')
    const buildResult = await build({
        ...mergeDeepRight(
            {
                bundle: true,
                platform: process.env.PLATFORM === 'node' ? 'node' : 'browser',
                format: 'cjs',
                external: ['vscode'],
                stdin: {
                    contents: injectScript + userCodeToBundle,
                    loader: 'tsx',
                    resolveDir: globalNodeModulesRoot ?? undefined,
                },
                write: false,
                mainFields: ['module', 'main'],
            } as BuildOptions,
            { ...esbuildBuildOptions, ...esbuildOptionsArg },
        ),
    })
    if (buildResult.errors.length) {
        vscode.window.showErrorMessage('Error compiling (bundling) the script', {
            modal: true,
            detail: buildResult.errors.map(({ text }) => text).join('\n'),
        })
        return
    }
    return buildResult
}
