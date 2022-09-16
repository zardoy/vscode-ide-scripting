import * as vscode from 'vscode'
import { extensionCtx, getExtensionContributionsPrefix, registerExtensionCommand, showQuickPick } from 'vscode-framework'

export const SCHEME = `${getExtensionContributionsPrefix()}playground`
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
            const stringContent = content.toString()
            const savedFiles = getSavedFiles()
            let updateIndex = savedFiles.findIndex(([fileName]) => fileName === uri.path)
            if (updateIndex === -1) {
                updateIndex = savedFiles.push([uri.path, 0, '']) - 1
            } else if (savedFiles[updateIndex]![2] === stringContent) return
            savedFiles[updateIndex]![2] = stringContent
            savedFiles[updateIndex]![1] = Date.now()
            await updateSavedFiles(savedFiles)
        },
    })

    registerExtensionCommand('openPlayground', async (_, openToSide = true) => {
        const savedFiles = getSavedFiles()
        const formatDate = Intl.DateTimeFormat(vscode.env.language, { dateStyle: 'short' })
        let currentEnteredName = ''
        const selectedFile = await showQuickPick<string | -1>([
            ...savedFiles.map(([fileName, lastModified, contents], i) => {
                const lines = contents.split(/\r?\n/)
                return { label: fileName.replace(/^\//, ''), value: fileName, description: `L: ${lines.length}, M: ${formatDate.format(lastModified)}` }
            }),
            {
                label: '$(add) Create new file',
                value: -1,
            },
        ])
        if (selectedFile === undefined) return
        let openingFileName: string
        if (selectedFile === -1) {
            const valuePlaceholder = `${currentEnteredName || new Date().toISOString().split('T')[0]!}.ts`
            const newFileName = await vscode.window.showInputBox({
                title: 'Create new file...',
                value: valuePlaceholder,
                valueSelection: [0, valuePlaceholder.length - 3],
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
                      viewColumn: vscode.ViewColumn.Beside,
                  }
                : undefined,
        )
    })
}
