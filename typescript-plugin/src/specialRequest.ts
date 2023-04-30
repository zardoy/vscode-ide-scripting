import type ts from 'typescript/lib/tsserverlibrary'

export default (
    typescript: typeof ts,
    languageService: ts.LanguageService,
    fileName: string,
    position: number,
    options: ts.GetCompletionsAtPositionOptions,
) => {
    const CODE_ACTIONS_ACTION = 'scripting-code-actions:'
    if (options?.triggerCharacter?.startsWith(CODE_ACTIONS_ACTION)) {
        const [endPos, ...errorCodes] = options?.triggerCharacter.slice(CODE_ACTIONS_ACTION.length).split(',').map(Number)
        const refactors = languageService.getApplicableRefactors(fileName, { pos: position, end: endPos! }, options)
        const quickFixes = languageService.getCodeFixesAtPosition(fileName, position, endPos!, errorCodes, {}, options)
        return {
            refactors,
            quickFixes,
        }
    }
    const CODE_ACTIONS_RESOLVE_ACTION = 'scripting-resolve-code-actions:'
    if (options.triggerCharacter?.startsWith(CODE_ACTIONS_RESOLVE_ACTION)) {
        const [endPos, refactorName, actionName] = options?.triggerCharacter.slice(CODE_ACTIONS_ACTION.length).split(',')
        return languageService.getEditsForRefactor(
            fileName,
            // too lazy to map all settings, anyway provided ts formatter can be used then
            { ...typescript.getDefaultFormatCodeSettings(), convertTabsToSpaces: false },
            { pos: position, end: +endPos! },
            refactorName!,
            actionName!,
            options,
        )
    }

    return null
}
