import * as vscode from 'vscode'

import { join } from 'path'
import { registerExtensionCommand } from 'vscode-framework'
import { DRAFT_PREFIX, SCHEME } from './fileSystem'

export const playgroundsToSave = new Set<string>()

export const savePlaygroundContents = async (uri: vscode.Uri, contents: string) => {
    const TEMP = process.env.TEMP
    if (!TEMP) throw new Error('No TEMP env var')
    const savePath = join(TEMP, `ide-scripting-${uri.path.startsWith(DRAFT_PREFIX) ? Math.floor(Math.random() * 100) + '.ts' : uri.path}`)
    await vscode.workspace.fs.writeFile(vscode.Uri.file(savePath), new TextEncoder().encode(contents))
    return savePath
}

export default () => {
    registerExtensionCommand('saveFileToTempAndCopyPath', async () => {
        const document = vscode.window.activeTextEditor?.document
        if (!document) return
        const { uri } = document
        if (uri.scheme !== SCHEME) return
        const savePath = await savePlaygroundContents(uri, document.getText())
        await vscode.env.clipboard.writeText(savePath)
        if (!uri.path.startsWith(DRAFT_PREFIX)) {
            playgroundsToSave.add(uri.path)
        }
    })

    vscode.workspace.onDidCloseTextDocument(({ uri }) => {
        if (uri.scheme !== SCHEME) return
        playgroundsToSave.delete(uri.path)
    })
}
