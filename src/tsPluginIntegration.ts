import { exec } from 'child_process'
import { promisify } from 'util'
import * as vscode from 'vscode'
import { getExtensionSettingId } from 'vscode-framework'
import { Configuration, CustomPluginData } from './configurationType'
import { SCHEME } from './fileSystem'

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
    if (!tsExtension) return

    await tsExtension.activate()

    // Get the API from the TS extension
    if (!tsExtension.exports || !tsExtension.exports.getAPI) return

    const api = tsExtension.exports.getAPI(0)
    if (!api) return

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
        api.configurePlugin(PLUGIN_NAME, config)
    }

    vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
        if (affectsConfiguration(process.env.IDS_PREFIX!)) syncConfig()
    })
    syncConfig()

    vscode.window.onDidChangeVisibleTextEditors(editors => {
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
