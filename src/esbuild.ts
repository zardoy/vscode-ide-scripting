import * as vscode from 'vscode'
import os from 'os'
import fs from 'fs'
import { join } from 'path'
import isRunning from 'is-running'
import util from 'util'
import stream from 'stream'
import got, { Progress } from 'got'

const knownWindowsPackages: Record<string, string> = {
    'win32 arm64 LE': 'esbuild-windows-arm64',
    'win32 ia32 LE': 'esbuild-windows-32',
    'win32 x64 LE': 'esbuild-windows-64',
}

const knownUnixlikePackages: Record<string, string> = {
    'android arm64 LE': 'esbuild-android-arm64',
    'darwin arm64 LE': 'esbuild-darwin-arm64',
    'darwin x64 LE': 'esbuild-darwin-64',
    'freebsd arm64 LE': 'esbuild-freebsd-arm64',
    'freebsd x64 LE': 'esbuild-freebsd-64',
    'linux arm LE': 'esbuild-linux-arm',
    'linux arm64 LE': 'esbuild-linux-arm64',
    'linux ia32 LE': 'esbuild-linux-32',
    'linux mips64el LE': 'esbuild-linux-mips64le',
    'linux ppc64 LE': 'esbuild-linux-ppc64le',
    'linux riscv64 LE': 'esbuild-linux-riscv64',
    'linux s390x BE': 'esbuild-linux-s390x',
    'linux x64 LE': 'esbuild-linux-64',
    'linux loong64 LE': '@esbuild/linux-loong64',
    'netbsd x64 LE': 'esbuild-netbsd-64',
    'openbsd x64 LE': 'esbuild-openbsd-64',
    'sunos x64 LE': 'esbuild-sunos-64',
}

// this can be inlined with pre-build & publish process somehow in future
function pkgAndSubpathForCurrentPlatform(platformKey = `${process.platform} ${os.arch()} ${os.endianness()}`) {
    let pkg: string
    let subpath: string

    if (platformKey in knownWindowsPackages) {
        pkg = knownWindowsPackages[platformKey]!
        subpath = 'esbuild.exe'
    } else if (platformKey in knownUnixlikePackages) {
        pkg = knownUnixlikePackages[platformKey]!
        subpath = 'bin/esbuild'
    } else {
        throw new Error(`Unsupported platform: ${platformKey}`)
    }

    return { pkg, subpath }
}

const getEsbuildDownloadLink = (platformKey?: string) => {
    const { pkg, subpath } = pkgAndSubpathForCurrentPlatform(platformKey)
    // jsdelvr doesn't allow to download some files!
    return subpath.endsWith('.exe')
        ? `https://unpkg.com/${pkg}@${process.env.ESBUILD_BUNDLED_VERSION}/${subpath}`
        : `https://cdn.jsdelivr.net/npm/${pkg}@${process.env.ESBUILD_BUNDLED_VERSION}/${subpath}`
}

export const esbuildPath = join(__dirname, process.platform === 'win32' ? 'esbuild.exe' : 'esbuild')
const lockedPidFile = join(__dirname, 'lockedPid')

const hasEsbuild = () => {
    try {
        const stat = fs.statSync(esbuildPath)
        if (stat.size < 1000) return false
        return true
    } catch {
        return false
    }
}
const readLockFileSafe = () => {
    try {
        return fs.readFileSync(lockedPidFile, 'utf8')
    } catch (err) {
        return
    }
}
const isAnotherInstanceAlreadyInstalling = () => {
    const lockedPid = readLockFileSafe()
    if (lockedPid && isRunning(+lockedPid)) {
        return true
    }
    fs.writeFileSync(lockedPidFile, String(process.pid), 'utf8')
    return false
}

const installEsbuildInner = async () => {
    if (hasEsbuild()) return
    // when extension is installed in one window it becomes enabled in all opened windows
    // so we need to ensure we don't call this and installing esbuild only in one instance
    // by this we ensure installing doesn't happen in another instances
    if (isAnotherInstanceAlreadyInstalling()) return
    const pipeline = util.promisify(stream.pipeline)

    const title = 'First time esbuild install'
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, async progress => {
        const esbuildDownloadLink = getEsbuildDownloadLink()
        console.log('Downloading esbuild from', esbuildDownloadLink)
        try {
            fs.unlinkSync(esbuildPath)
        } catch {}
        await pipeline(
            got.stream(esbuildDownloadLink).on('downloadProgress', (downloadProgress: Progress) => {
                progress.report({
                    message: `${title} (Downloading: ${Math.floor(downloadProgress.percent * 100)}%)`,
                })
            }),
            fs.createWriteStream(esbuildPath),
        )
        // if (process.platform !== 'win32') fs.chmodSync(esbuildPath, 0o755)
        fs.chmodSync(esbuildPath, 493)
        fs.unlinkSync(lockedPidFile)
    })
}

export const installEsbuild = () => {
    installEsbuildInner().catch(async err => {
        fs.unlinkSync(lockedPidFile)
        const choice = await vscode.window.showErrorMessage(`Failed to install esbuild: ${err.message}`, 'Retry')
        if (choice) installEsbuild()
    })
}
