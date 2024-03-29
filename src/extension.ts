import registerFileSystemProvider from './fileSystem'
import tsPluginIntegration from './tsPluginIntegration'
import completions from './completions'
import { initialEsbuildInstalledCheck, installEsbuild } from './esbuild'
import executeScript, { esbuildBundle, esbuildTransform } from './executeScript'
import { registerExtensionCommand } from 'vscode-framework'
import codeFixes from './codeFixes'
import playgroundCommands from './playgroundCommands'
import tsCodeActionsFix from './tsCodeActionsFix'
import { newPromise } from './util'
import apiCommands from './apiCommands'

export const activate = () => {
    tsPluginIntegration()
    const esbuildInstallPromise = newPromise()
    installEsbuild(esbuildInstallPromise.resolve)
    registerFileSystemProvider()

    completions()
    executeScript()
    codeFixes()
    playgroundCommands()
    tsCodeActionsFix()

    registerExtensionCommand('focusOutput', () => {
        console.show(true)
    })

    apiCommands()

    const api = {
        bundle: esbuildBundle,
        transform: esbuildTransform,
    }
    return {
        esbuild: initialEsbuildInstalledCheck.value ? api : esbuildInstallPromise.promise.then(() => api),
    }
}
