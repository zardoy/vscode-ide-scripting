// not all of them are used, but:
// most probably super useful and will be used in future

import type tslib from 'typescript/lib/tsserverlibrary'

// TODO use cleaner getScriptSnapshot retrigger
export const updateSourceFile = (ts: typeof tslib, sourceFile: tslib.SourceFile) => {
    ts.updateLanguageServiceSourceFile(sourceFile, ts.ScriptSnapshot.fromString(''), '2', {
        newLength: 0,
        span: { start: 0, length: 0 },
    })
}

export function addObjectMethodInterceptors<T extends Record<string, any>>(
    object: T,
    interceptors: Partial<{
        [K in keyof Required<T> as T[K] extends (...args: any[]) => any ? K : never]: (prior: T[K], ...args: Parameters<T[K]>) => ReturnType<T[K]>
    }>,
) {
    for (const key of Object.keys(interceptors)) {
        const x = object[key]!
        const callback = interceptors[key]
        if (typeof x !== 'function') continue
        //@ts-ignore
        object[key] = (...args: any) => callback(x.bind(object), ...args)
    }
}

export function addObjectMethodResultInterceptors<T extends Record<string, any>>(
    object: T,
    interceptors: Partial<{
        [K in keyof Required<T> as T[K] extends (...args: any[]) => any ? K : never]: (result: ReturnType<T[K]>, ...args: Parameters<T[K]>) => ReturnType<T[K]>
    }>,
) {
    for (const key of Object.keys(interceptors)) {
        const x = object[key]!
        const callback = interceptors[key]!
        if (typeof x !== 'function') continue
        //@ts-ignore
        object[key] = (...args: any) => {
            const result = x.apply(object, args)
            return callback(result, ...args)
        }
    }
}

export function addObjectGlobalLogger<T extends Record<string, any>>(object: T, callback: (key: keyof T, result, ...args) => void) {
    for (const key of Object.keys(object)) {
        const x = object[key]!
        if (typeof x !== 'function') continue
        //@ts-ignore
        object[key] = (...args: any) => {
            const result = x.apply(object, args)
            callback(key, result, ...args)
            return result
        }
    }
}
