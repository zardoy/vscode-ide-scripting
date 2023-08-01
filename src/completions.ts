import * as vscode from 'vscode'
import { defaultJsSupersetLangs } from '@zardoy/vscode-utils/build/langs'
import { SCHEME } from './fileSystem'

export default () => {
    vscode.languages.registerCompletionItemProvider(
        defaultJsSupersetLangs,
        {
            async provideCompletionItems(document, position, token, context) {
                if (document.uri.scheme !== SCHEME) return
                const commandRange = document.getWordRangeAtPosition(position, /command\((['"].*['"]?|)\)/)
                const stringRange = document.getWordRangeAtPosition(position, /['"][\.\d\w-]*['"]/i)
                const innerStringRange = stringRange?.with(stringRange.start.translate(0, 1), stringRange.end.translate(0, -1))
                if (!commandRange || !innerStringRange?.contains(position)) return
                if (position.character < commandRange.start.character + 'command("'.length) return
                // TODO make setting
                const includeInternal = false
                const allCommands = includeInternal ? await vscode.commands.getCommands() : []
                const externalCommands = await vscode.commands.getCommands(true)
                return (includeInternal ? allCommands : externalCommands).map(commandId => ({
                    label: { label: commandId, description: includeInternal && !externalCommands.includes(commandId) ? 'BUILTIN' : '' },
                    kind: vscode.CompletionItemKind.Value,
                    sortText: '180',
                    range: innerStringRange,
                }))
            },
        },
        "'",
        '"',
        '.',
    )
}
