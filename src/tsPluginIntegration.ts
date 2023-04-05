import { exec } from 'child_process'
import { promisify } from 'util'
import * as vscode from 'vscode'
import { getExtensionSettingId } from 'vscode-framework'
import { Configuration, CustomPluginData } from './configurationType'
import { SCHEME } from './fileSystem'
import { join } from 'path'

// that's fine untill..
export let globalNodeModulesRoot: string | undefined | null
export let detectedPackageManager = 'npm'

const execPromise = promisify(exec)

/** Handle plugin's config */
export default async () => {
    // TODO-low i think executing it on every launch could affect performance (but very small)
    if (globalNodeModulesRoot === undefined) {
        let { stdout } = await execPromise('pnpm root -g').catch(() => ({ stdout: undefined }))
        if (stdout) {
            detectedPackageManager = 'pnpm'
        } else {
            stdout = (await execPromise('npm root -g').catch(() => ({ stdout: undefined }))).stdout
            if (stdout) detectedPackageManager = 'npm'
        }
        globalNodeModulesRoot = stdout ? stdout.toString().trim() : null
    }

    const PLUGIN_NAME = 'vscode-ide-scripting-typescript-plugin'

    const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features')
    if (!tsExtension) {
        console.warn("Can't sync data to TS plugin as vscode.typescript-language-features is not active")
        return
    }

    await tsExtension.activate()

    // Get the API from the TS extension
    if (!tsExtension.exports || !tsExtension.exports.getAPI?.(0)) throw new Error('No TS API')

    const api = tsExtension.exports.getAPI(0)

    const getTargetEditorsNum = () => vscode.window.visibleTextEditors.filter(({ document: { uri } }) => !['output', SCHEME].includes(uri.scheme)).length
    let targetVisibleEditorsNum = getTargetEditorsNum()

    const syncConfig = () => {
        const config = vscode.workspace.getConfiguration().get(process.env.IDS_PREFIX!) as Configuration & CustomPluginData
        if (!config.vscodeAliases.includes('vscode')) {
            void vscode.window.showErrorMessage(`Settiing ${getExtensionSettingId('vscodeAliases')} is ignored as it must contain vscode alias`)
            config.vscodeAliases = ['vscode']
        }

        config.npmRoot = globalNodeModulesRoot ?? undefined
        config.targetEditorVisible = targetVisibleEditorsNum >= 1
        config.vscodeDTsPath = join(vscode.env.appRoot, 'out/vscode-dts/vscode.d.ts')
        api.configurePlugin(PLUGIN_NAME, config)
    }

    vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
        if (affectsConfiguration(process.env.IDS_PREFIX!)) syncConfig()
    })
    syncConfig()

    vscode.window.onDidChangeVisibleTextEditors(editors => {
        if (!editors.some(editor => editor.document.uri.scheme === SCHEME)) return
        const newNum = getTargetEditorsNum()
        // TODO move it from here
        void vscode.commands.executeCommand(
            'setContext',
            'ideScripting.playgroundEditorVisible',
            editors.some(({ document: { uri } }) => uri.scheme === SCHEME),
        )
        const isChanged = targetVisibleEditorsNum === 0 || newNum === 0
        targetVisibleEditorsNum = newNum
        if (isChanged) syncConfig()
    })
}
