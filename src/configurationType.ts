//@ts-ignore
type BuildOptionsLatest = import('esbuild-latest').BuildOptions
type BuildOptions = IsAny<BuildOptionsLatest> extends true ? import('esbuild').BuildOptions : BuildOptionsLatest

type IsAny<T> = 0 extends 1 & T ? true : false

export type Configuration = {
    /**
     * What to do when writing vscode namespace such as `window` and explicit import doesn't exist
     * Default behavior: `window` -> `vscode.window`
     * @default useFirstAlias
     */
    vscodeNamespaceSuggestions: 'useFirstAlias' | 'addExplicitImport'
    /**
     * First one will be used when, also explicit import can be used: `import { window } from 'vscode'`
     * @unique
     * @default ["vscode", "code", "c"]
     */
    vscodeAliases: string[]
    /**
     * Automatically insert aliased explicit imports for specific vscode modules
     * Example: `win: window`, will insert `import { window as win } from 'vscode'` when typed win
     */
    // not implemented as not needed
    // vscodeModulesAliases: { [alias: string]: string }
    /**
     * @default false
     */
    clearOutputBeforeStart: boolean
    /**
     * @default ifNeeded
     */
    openOutputBeforeStart: 'never' | 'always' | 'ifNeeded'
    /**
     * @default toSide
     */
    openEditorPrimaryLocation: 'toSide' | 'newTab'
    /**
     * For advanced use cases.
     * Override esbuild options that are used when bundling on every script run
     */
    esbuildBuildOptions: Partial<BuildOptions>
    /**
     * If true, semantic/syntatic diagnostics will receive focus on script execution
     * @default false
     */
    // errorsPreventScriptExecution: boolean
}

export type CustomPluginData = {
    npmRoot?: string
    targetEditorVisible: boolean
}
