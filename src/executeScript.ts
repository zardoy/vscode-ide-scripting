import * as vscode from 'vscode'
import { build, BuildOptions } from 'esbuild'
import { partition, mergeDeepRight } from 'rambda'
import requireFromString from 'require-from-string'
import { registerExtensionCommand, getExtensionSetting, extensionCtx, getExtensionCommandId, showQuickPick } from 'vscode-framework'
import { SCHEME } from './fileSystem'
import { join } from 'path'
import { globalNodeModulesRoot } from './tsPluginIntegration'

export default () => {
    let prevRegisteredCommand: vscode.Disposable[] | undefined

    registerExtensionCommand('executeScript', async (_, playgroundScriptArg?: string | vscode.Uri | null, targetEditorUriArg?: vscode.Uri | null) => {
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
            targetEditor = targetEditors[0]!
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

        // TODO change to require once new framework is here
        const fs = await import('fs')
        const injectScriptSource = fs.readFileSync(join(__dirname, './resources/injectScript.js'), 'utf-8')
        const injectScript = injectScriptSource
            .replace('$TEXT_EDITOR_URI', targetEditor ? targetEditor.document.uri.toString() : '')
            .replace("'$VSCODE_ALIASES'", () => {
                return getExtensionSetting('vscodeAliases')
                    .filter(a => a !== 'vscode')
                    .map(alias => `const ${alias} = vscode`)
                    .join('\n')
            })

        const esbuildBuildOptions = getExtensionSetting('esbuildBuildOptions')
        const buildResult = await build({
            ...mergeDeepRight(
                {
                    bundle: true,
                    platform: process.env.PLATFORM === 'node' ? 'node' : 'browser',
                    format: 'cjs',
                    stdin: {
                        contents: playgroundScriptContents ?? playgroundEditor!.document.getText(),
                        loader: 'tsx',
                        resolveDir: globalNodeModulesRoot ?? undefined,
                    },
                    write: false,
                    mainFields: ['module', 'main'],
                } as BuildOptions,
                esbuildBuildOptions,
            ),
        })
        if (buildResult.errors.length) {
            vscode.window.showErrorMessage('Error compiling (bundling) the script', {
                modal: true,
                detail: buildResult.errors.map(({ text }) => text).join('\n'),
            })
            return
        }

        if (prevRegisteredCommand) await vscode.commands.executeCommand(getExtensionCommandId('disposeDisposables'))
        if (getExtensionSetting('clearOutputBeforeStart')) console.clear()
        const buildScriptText = buildResult.outputFiles[0]!.text
        // const buildLines = buildScriptText.split('\n')
        globalThis.__IDE_SCRIPTING_CONSOLE = console
        setImmediate(() => {
            try {
                const executionResult: ExecutionResult = requireFromString(injectScript + buildScriptText)
                vscode.Disposable.from(...(prevRegisteredCommand ?? [])).dispose()
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
                prevRegisteredCommand = extensionCtx.subscriptions.slice(-2)
            } catch (err) {
                vscode.window.showErrorMessage('Error when executing script', { modal: true, detail: err.stack ?? err.message })
            }
            // TODO create decoration
        })
    })
}

interface ExecutionResult {
    disposables: [vscode.Disposable, string?][]
}
