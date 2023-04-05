import * as vscode from 'vscode'
import { extensionCtx, getExtensionContributionsPrefix, getExtensionSetting, registerExtensionCommand, VSCodeQuickPickItem } from 'vscode-framework'
import { showQuickPick } from '@zardoy/vscode-utils/build/quickPick'
import { playgroundsToSave, savePlaygroundContents } from './playgroundCommands'

export const SCHEME = `${getExtensionContributionsPrefix()}playground`
export const DRAFT_PREFIX = '/^draft'
// contents will stay on third place for compatibility, new metadata will follow after
type GlobalStateFileSave = [fileName: string, lastModified: number, contents: string]

const FILES_GLOBAL_STATE_KEY = 'savedFiles'
const getSavedFiles = () => {
    return (extensionCtx.globalState.get(FILES_GLOBAL_STATE_KEY) as GlobalStateFileSave[]) || []
}
const updateSavedFiles = async (newData: GlobalStateFileSave[]) => {
    return extensionCtx.globalState.update(FILES_GLOBAL_STATE_KEY, newData)
}

export default () => {
    extensionCtx.globalState.setKeysForSync([FILES_GLOBAL_STATE_KEY])

    vscode.workspace.registerFileSystemProvider(SCHEME, {
        createDirectory() {},
        delete() {},
        onDidChangeFile() {
            return { dispose() {} }
        },
        readDirectory() {
            return []
        },
        readFile(uri) {
            if (uri.path.startsWith(DRAFT_PREFIX)) return new TextEncoder().encode('')
            const savedFiles = getSavedFiles()
            return new TextEncoder().encode(savedFiles.find(([fileName]) => fileName === uri.path)?.[2] ?? '')
        },
        async rename(oldUri, newUri) {
            const oldPath = oldUri.path
            const newPath = newUri.path
            if (oldPath === newPath) return
            const savedFiles = getSavedFiles()
            for (const savedFile of savedFiles) {
                if (savedFile[0] !== oldPath) continue
                savedFile[0] = newPath
                savedFile[1] = Date.now()
                break
            }
            await updateSavedFiles(savedFiles)
        },
        stat() {
            return { ctime: 0, mtime: 0, size: 0, type: 0 }
        },
        watch() {
            // don't let other do this
            return { dispose() {} }
        },
        async writeFile(uri, content) {
            if (uri.path.startsWith(DRAFT_PREFIX)) throw new Error('Cannot save draft playground contents, rename file first')
            const stringContent = content.toString()
            const savedFiles = getSavedFiles()
            let updateIndex = savedFiles.findIndex(([fileName]) => fileName === uri.path)
            if (updateIndex === -1) {
                updateIndex = savedFiles.push([uri.path, 0, '']) - 1
            } else if (savedFiles[updateIndex]![2] === stringContent) return
            savedFiles[updateIndex]![2] = stringContent
            savedFiles[updateIndex]![1] = Date.now()
            await updateSavedFiles(savedFiles)
            if (playgroundsToSave.has(uri.path)) await savePlaygroundContents(uri, stringContent)
        },
    })

    registerExtensionCommand('openPlayground', async (_, openToSide = true) => {
        const savedFiles = getSavedFiles()
        const formatDate = Intl.DateTimeFormat(vscode.env.language, { dateStyle: 'short' })
        let openLocation = getExtensionSetting('openEditorPrimaryLocation')
        let currentEnteredName = ''
        let selectedFileOverride: string | undefined
        let selectedFile = await showQuickPick(
            [
                ...savedFiles.map(([fileName, lastModified, contents], i): VSCodeQuickPickItem<string | -1> => {
                    const lines = contents.split(/\r?\n/)
                    return {
                        label: fileName.replace(/^\//, ''),
                        value: fileName,
                        description: `L: ${lines.length}, M: ${formatDate.format(lastModified)}`,
                        buttons: [
                            {
                                iconPath: new vscode.ThemeIcon(openLocation === 'toSide' ? 'window' : 'split-horizontal'),
                                tooltip: openLocation === 'toSide' ? 'Open in new editor tab' : 'Open to side',
                            },
                        ],
                    }
                }),
                {
                    label: '$(add) Create new file',
                    value: -1,
                },
            ],
            {
                onDidTriggerItemButton(button) {
                    openLocation = openLocation === 'toSide' ? 'newTab' : 'toSide'
                    selectedFileOverride = button.item.value as string
                    this.hide()
                },
            },
        )
        selectedFile ??= selectedFileOverride
        if (selectedFile === undefined) return
        let openingFileName: string
        if (selectedFile === -1) {
            const valuePlaceholder = `${currentEnteredName || new Date().toISOString().split('T')[0]!}.ts`
            const newFileName = await vscode.window.showInputBox({
                title: 'Create new file...',
                value: valuePlaceholder,
                valueSelection: [0, valuePlaceholder.length - 3],
                validateInput(value) {
                    if (value.startsWith('^')) {
                        return {
                            severity: vscode.InputBoxValidationSeverity.Error,
                            message: 'Names starting with ^ are reserved',
                        }
                    }
                    return
                },
            })
            if (!newFileName) return
            openingFileName = newFileName
        } else {
            openingFileName = selectedFile
        }
        if (!openingFileName.startsWith('/')) openingFileName = `/${openingFileName}`
        await vscode.window.showTextDocument(
            vscode.Uri.from({
                scheme: SCHEME,
                path: openingFileName,
            }),
            openToSide
                ? {
                      viewColumn: openLocation === 'toSide' ? vscode.ViewColumn.Beside : undefined,
                  }
                : undefined,
        )
    })

    registerExtensionCommand('openDraftPlayground', async () => {
        await vscode.window.showTextDocument(
            vscode.Uri.from({
                scheme: SCHEME,
                path: '/^draft.ts',
            }),
        )
    })
}
