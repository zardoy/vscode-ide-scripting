import * as vscode from 'vscode'
import os from 'os'
import fs from 'fs'
import https from 'https'
import { join } from 'path'

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
    return subpath.endsWith('.exe') ? `https://unpkg.com/${pkg}/${subpath}` : `https://cdn.jsdelivr.net/npm/${pkg}/${subpath}`
}

const esbuildPath = join(__dirname, 'esbuild')

const hasEsbuild = () => fs.existsSync(esbuildPath)

export const installEsbuild = async () => {
    if (hasEsbuild()) return

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'First time esbuild install' }, async () => {
        const esbuildDownloadLink = getEsbuildDownloadLink()
        const file = fs.createWriteStream('./esbuild')
        await new Promise<void>(resolve => {
            console.log('Downloading esbuild from', esbuildDownloadLink)
            https.get(esbuildDownloadLink, res => {
                res.pipe(file)

                file.on('finish', () => {
                    file.close(() => resolve())
                })
            })
        })
    })
}
