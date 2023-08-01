import * as vscode from 'vscode'

import { registerExtensionCommand } from 'vscode-framework'
import { doParse } from './apiCommandsParser'
import { showQuickPick } from '@zardoy/vscode-utils/build/quickPick'
import { oneOf } from '@zardoy/utils'
import { join } from 'path'
import { SCHEME } from './fileSystem'

declare const __API_COMMANDS: string

let forceReparsed: undefined | Awaited<ReturnType<typeof doParse>> = undefined

export default () => {
    registerExtensionCommand('doBuiltinCommandsReparse' as any, async () => {
        const ts = require(join(vscode.env.appRoot, 'extensions/node_modules/typescript/lib/typescript.js'))
        forceReparsed = await doParse(ts)
    })
    registerExtensionCommand('showBuiltinApiCommands', async (_, idArg?: string) => {
        const commands = forceReparsed || (JSON.parse(__API_COMMANDS!) as NonNullable<typeof forceReparsed>)

        let resolveOptional = false
        const picked =
            idArg ??
            (await new Promise(async resolve => {
                const withOptionalButton = {
                    iconPath: new vscode.ThemeIcon('menu-selection'),
                    tooltip: 'Test with optional args',
                }
                const insertCodeButton = {
                    iconPath: new vscode.ThemeIcon('code'),
                    tooltip: 'Insert code example',
                }

                const _picked = await showQuickPick(
                    commands.map(({ id, description }) => {
                        return {
                            label: id,
                            description,
                            value: id,
                            buttons: [insertCodeButton, withOptionalButton],
                        }
                    }),
                    {
                        title: 'Select a command to test',
                        matchOnDescription: true,
                        onDidTriggerItemButton(button) {
                            if (button.button === withOptionalButton) {
                                resolveOptional = true
                                resolve(button.item.value)
                            }
                            if (button.button === insertCodeButton) {
                                const editor = vscode.window.activeTextEditor
                                if (!editor) {
                                    void vscode.window.showWarningMessage('No active editor')
                                    return
                                }
                                const command = commands.find(({ id }) => id === button.item.value)!
                                if (editor.document.uri.scheme === SCHEME) {
                                    editor.insertSnippet(new vscode.SnippetString().appendText(command.id))
                                    return
                                }

                                const snippet = new vscode.SnippetString()
                                snippet.appendText(`vscode.commands.executeCommand<${command.output}>('${command.id}'`)
                                for (const arg of command.args) {
                                    snippet.appendText(', ')
                                    snippet.appendPlaceholder(arg.name + (arg.optional ? '?' : '' + ': ') + arg.typeStringified)
                                }
                                snippet.appendText(')')
                                editor.insertSnippet(snippet)

                                resolve(undefined)
                            }
                        },
                    },
                )
                resolve(_picked)
            }))
        if (!picked) return
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showWarningMessage('No active editor')
            // 111
            return
        }
        const { document } = editor
        const command = commands.find(({ id }) => id === picked)!
        const typesToDataMap = {
            'vscode.Uri': document.uri,
            'vscode.Position': editor.selection.active,
            'vscode.Range': editor.selection,
            'vscode.Range | vscode.Selection': editor.selection,
            'vscode.FormattingOptions': editor.options,
            'vscode.Position[]': editor.selections.map(s => s.active),
            'vscode.Color': new vscode.Color(0, 0, 0, 0),
            '{ uri: vscode.Uri; range: vscode.Range }': { uri: document.uri, range: editor.selection },
        }
        const resolvedArgs = [] as any[]
        for (const arg of command.args) {
            if (!resolveOptional && arg.optional) {
                resolvedArgs.push(undefined)
                continue
            }

            const data = typesToDataMap[arg.typeStringified]

            if (data) {
                resolvedArgs.push(data)
            } else {
                const type = arg.typeStringified
                if (oneOf(type, 'number', 'string')) {
                    const user = await vscode.window.showInputBox({ title: `Enter ${arg.name}` })
                    if (!user) return
                    resolvedArgs.push(type === 'number' ? +user : user)
                }
            }
        }

        console.log(`Running ${command.id}...`)
        console.show(true)
        const result = await vscode.commands.executeCommand(command.id, ...resolvedArgs)
        console.log(result)
    })
}
