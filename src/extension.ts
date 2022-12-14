import registerFileSystemProvider from './fileSystem'
import tsPluginIntegration from './tsPluginIntegration'
import completions from './completions'
import { installEsbuild } from './esbuild'
import executeScript from './executeScript'
import { registerExtensionCommand } from 'vscode-framework'
import codeFixes from './codeFixes'

export const activate = () => {
    tsPluginIntegration()
    installEsbuild()
    registerFileSystemProvider()

    completions()
    executeScript()
    codeFixes()

    registerExtensionCommand('focusOutput', () => {
        console.show(true)
    })
}
