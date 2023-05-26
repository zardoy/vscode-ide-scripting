export const newPromise = () => {
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
