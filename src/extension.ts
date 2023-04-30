import registerFileSystemProvider from './fileSystem'
import tsPluginIntegration from './tsPluginIntegration'
import completions from './completions'
import { initialEsbuildInstalledCheck, installEsbuild } from './esbuild'
import executeScript, { esbuildBundle } from './executeScript'
import { registerExtensionCommand } from 'vscode-framework'
import codeFixes from './codeFixes'
import playgroundCommands from './playgroundCommands'
import tsCodeActionsFix from './tsCodeActionsFix'

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

    const api = {
        esbuildBundle,
    }
    return {
        esbuild: initialEsbuildInstalledCheck.value ? api : esbuildInstallPromise.promise.then(() => api),
    }
}

const newPromise = () => {
    let resolve: () => void
    return {
        promise: new Promise<void>(r => {
            resolve = r
        }),
        resolve() {
            resolve()
        },
    }
}
