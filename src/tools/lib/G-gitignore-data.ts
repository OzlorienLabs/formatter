/**
 * Built-in .gitignore templates, written for this tool (modelled on common
 * community practice). Each body is a list of commented sections.
 */

export type Template = { id: string; name: string; group: string; aliases?: string[]; body: string };

export const TEMPLATES: Template[] = [
  /* ── languages ─────────────────────────────────────────────── */
  {
    id: "node", name: "Node", group: "Languages", aliases: ["npm", "yarn", "pnpm", "javascript", "js", "typescript", "ts"],
    body: `# Dependencies
node_modules/
jspm_packages/
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Build output & caches
dist/
build/
coverage/
.nyc_output/
.cache/
.parcel-cache/
.eslintcache
.stylelintcache
*.tsbuildinfo
.turbo/

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Environment
.env
.env.*
!.env.example

# Packed packages
*.tgz`,
  },
  {
    id: "python", name: "Python", group: "Languages", aliases: ["py", "pip", "poetry", "uv"],
    body: `# Byte-compiled files
__pycache__/
*.py[cod]
*$py.class

# C extensions
*.so

# Packaging
build/
dist/
develop-eggs/
eggs/
.eggs/
wheels/
sdist/
*.egg-info/
*.egg
MANIFEST
pip-wheel-metadata/

# Virtual environments
.venv/
venv/
env/
ENV/
.python-version

# Test & coverage
.pytest_cache/
.tox/
.nox/
.coverage
.coverage.*
htmlcov/
coverage.xml
.hypothesis/

# Type checkers & linters
.mypy_cache/
.pyre/
.pytype/
.ruff_cache/

# Environment
.env`,
  },
  {
    id: "java", name: "Java", group: "Languages", aliases: ["jvm"],
    body: `# Compiled classes
*.class

# Packages
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# Logs
*.log

# JVM crash logs
hs_err_pid*
replay_pid*

# BlueJ
*.ctxt

# Mobile tools
.mtj.tmp/`,
  },
  {
    id: "go", name: "Go", group: "Languages", aliases: ["golang"],
    body: `# Binaries
*.exe
*.exe~
*.dll
*.so
*.dylib

# Test binaries and coverage
*.test
*.out
coverage.*
*.coverprofile
profile.cov

# Dependency directory (only when not vendoring on purpose)
# vendor/

# Workspace file
go.work
go.work.sum

# Environment
.env`,
  },
  {
    id: "rust", name: "Rust", group: "Languages", aliases: ["cargo"],
    body: `# Build output
debug/
target/

# Keep Cargo.lock for binaries; libraries may ignore it
# Cargo.lock

# rustfmt backups
**/*.rs.bk

# MSVC debug info
*.pdb`,
  },
  {
    id: "c", name: "C", group: "Languages",
    body: `# Object files
*.o
*.ko
*.obj
*.elf

# Linker output
*.ilk
*.map
*.exp

# Precompiled headers
*.gch
*.pch

# Libraries
*.lib
*.a
*.la
*.lo

# Shared objects
*.dll
*.so
*.so.*
*.dylib

# Executables
*.exe
*.out
*.app
*.i*86
*.x86_64
*.hex

# Debug files
*.dSYM/
*.su
*.idb
*.pdb

# Kernel module build
*.mod*
*.cmd
.tmp_versions/
modules.order
Module.symvers
Mkfile.old
dkms.conf`,
  },
  {
    id: "cpp", name: "C++", group: "Languages", aliases: ["c++", "cmake"],
    body: `# Object files
*.o
*.obj
*.slo
*.lo

# Precompiled headers
*.gch
*.pch

# Libraries
*.so
*.dylib
*.dll
*.lai
*.la
*.a
*.lib

# Executables
*.exe
*.out
*.app

# CMake
CMakeLists.txt.user
CMakeCache.txt
CMakeFiles/
CMakeScripts/
cmake_install.cmake
install_manifest.txt
compile_commands.json
CTestTestfile.cmake
_deps/
build/
cmake-build-*/

# Conan / vcpkg
conan.lock
vcpkg_installed/`,
  },
  {
    id: "csharp", name: "C# / .NET", group: "Languages", aliases: ["dotnet", ".net", "c#", "cs"],
    body: `# Build results
[Dd]ebug/
[Dd]ebugPublic/
[Rr]elease/
[Rr]eleases/
x64/
x86/
[Aa][Rr][Mm]/
[Aa][Rr][Mm]64/
bld/
[Bb]in/
[Oo]bj/
[Ll]og/
[Ll]ogs/

# User-specific files
*.rsuser
*.suo
*.user
*.userosscache
*.sln.docstates

# NuGet
*.nupkg
*.snupkg
**/[Pp]ackages/*
!**/[Pp]ackages/build/
*.nuget.props
*.nuget.targets
project.lock.json
project.fragment.lock.json
artifacts/

# Test results
[Tt]est[Rr]esult*/
[Bb]uild[Ll]og.*
*.trx
*.coverage
*.coveragexml

# Publish output
publish/
*.[Pp]ublish.xml
*.azurePubxml
*.pubxml
PublishScripts/`,
  },
  {
    id: "ruby", name: "Ruby", group: "Languages", aliases: ["gem", "bundler"],
    body: `# Gems & bundler
*.gem
*.rbc
/.config
/coverage/
/InstalledFiles
/pkg/
/spec/reports/
/spec/examples.txt
/test/tmp/
/test/version_tmp/
/tmp/
/.bundle/
/vendor/bundle
/lib/bundler/man/

# Documentation cache
/.yardoc/
/_yardoc/
/doc/
/rdoc/

# Environment
.byebug_history
.rvmrc
.env`,
  },
  {
    id: "php", name: "PHP", group: "Languages", aliases: ["composer"],
    body: `# Composer
/vendor/
composer.phar

# PHPUnit
.phpunit.result.cache
.phpunit.cache/
/coverage/

# PHP CS Fixer / PHPStan
.php-cs-fixer.cache
.php_cs.cache

# Environment
.env`,
  },
  {
    id: "swift", name: "Swift / Xcode", group: "Languages", aliases: ["xcode", "ios", "macos-app", "objective-c", "cocoapods"],
    body: `# Xcode user data
xcuserdata/
*.xcscmblueprint
*.xccheckout
*.moved-aside
*.xcuserstate
*.xcworkspace/xcuserdata/

# Build products
build/
DerivedData/
*.hmap
*.ipa
*.dSYM.zip
*.dSYM

# Swift Package Manager
.build/
.swiftpm/
Packages/
Package.pins
Package.resolved

# CocoaPods / Carthage
Pods/
Carthage/Build/

# fastlane
fastlane/report.xml
fastlane/Preview.html
fastlane/screenshots/**/*.png
fastlane/test_output`,
  },
  {
    id: "kotlin", name: "Kotlin", group: "Languages", aliases: ["kt"],
    body: `# Compiled classes
*.class

# Kotlin
.kotlin/
*.kotlin_module

# Packages
*.jar
*.war
*.ear

# Logs
*.log
hs_err_pid*`,
  },
  {
    id: "dart", name: "Flutter / Dart", group: "Languages", aliases: ["flutter", "dart", "pub"],
    body: `# Dart / pub
.dart_tool/
.packages
.pub-cache/
.pub/
build/
pubspec.lock.bak

# Flutter
.flutter-plugins
.flutter-plugins-dependencies
.metadata
**/doc/api/
*.iml

# Platform build outputs
/android/app/debug
/android/app/profile
/android/app/release
**/ios/Flutter/.last_build_id
**/ios/Pods/
**/ios/.symlinks/
**/ios/Flutter/Generated.xcconfig
**/ios/Flutter/flutter_export_environment.sh

# Coverage & obfuscation maps
coverage/
app.*.symbols
app.*.map.json`,
  },
  {
    id: "r", name: "R", group: "Languages", aliases: ["rstudio"],
    body: `# History & session data
.Rhistory
.Rapp.history
.RData
.RDataTmp
.Ruserdata

# RStudio
.Rproj.user/
*.Rproj.user

# Package build
*-Ex.R
/*.tar.gz
/*.Rcheck/

# knitr / rmarkdown output
*.utf8.md
*.knit.md
*_cache/
/cache/
rsconnect/

# renv
renv/library/
renv/local/
renv/staging/`,
  },
  {
    id: "julia", name: "Julia", group: "Languages",
    body: `# Coverage
*.jl.cov
*.jl.*.cov
*.jl.mem

# Docs build
/docs/build/
/docs/Manifest.toml

# Environment (packages usually leave the manifest out)
Manifest.toml
LocalPreferences.toml`,
  },
  {
    id: "haskell", name: "Haskell", group: "Languages", aliases: ["stack", "cabal", "ghc"],
    body: `# Build output
dist/
dist-*/
cabal-dev/
.stack-work/
.cabal-sandbox/
cabal.sandbox.config
cabal.project.local
cabal.project.local~
.HTF/
.ghc.environment.*

# Compiled files
*.o
*.hi
*.hie
*.chi
*.chs.h
*.dyn_o
*.dyn_hi

# Profiling
*.prof
*.aux
*.hp
*.eventlog`,
  },
  {
    id: "elixir", name: "Elixir", group: "Languages", aliases: ["phoenix", "erlang", "mix"],
    body: `# Build & deps
/_build/
/deps/
/cover/
/doc/
/.fetch
erl_crash.dump
*.ez
*.beam
/config/*.secret.exs
.elixir_ls/

# Phoenix assets
/priv/static/assets/
/priv/static/cache_manifest.json
node_modules/`,
  },
  {
    id: "scala", name: "Scala", group: "Languages", aliases: ["sbt"],
    body: `# sbt
target/
project/target/
project/project/
.bsp/
.bloop/
.metals/
metals.sbt
.ammonite/

# Compiled classes
*.class
*.log

# Scala-IDE
.scala_dependencies
.worksheet`,
  },
  /* ── frameworks & site generators ──────────────────────────── */
  {
    id: "nextjs", name: "Next.js", group: "Frameworks", aliases: ["next"],
    body: `# Next.js build output
.next/
out/
next-env.d.ts

# Vercel
.vercel/

# Dependencies
node_modules/
.pnp.*

# Debug logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment (keep the example)
.env*.local
.env
!.env.example

# TypeScript
*.tsbuildinfo`,
  },
  {
    id: "nuxt", name: "Nuxt", group: "Frameworks",
    body: `# Nuxt build & cache
.nuxt/
.output/
.data/
.nitro/
.cache/
dist/

# Dependencies
node_modules/

# Logs
logs/
*.log

# Environment
.env
.env.*
!.env.example`,
  },
  {
    id: "vue", name: "Vue", group: "Frameworks", aliases: ["vite"],
    body: `# Build output
dist/
dist-ssr/
*.local

# Dependencies
node_modules/

# Logs
*.log
npm-debug.log*

# Editor
.vscode/*
!.vscode/extensions.json

# Test output
coverage/
/cypress/videos/
/cypress/screenshots/
test-results/
playwright-report/`,
  },
  {
    id: "angular", name: "Angular", group: "Frameworks",
    body: `# Compiled output
/dist/
/tmp/
/out-tsc/
/bazel-out/

# Dependencies
/node_modules/

# Angular cache
/.angular/cache
.sass-cache/
/connect.lock
/coverage/
/libpeerconnection.log
testem.log
/typings

# Logs
npm-debug.log
yarn-error.log`,
  },
  {
    id: "svelte", name: "SvelteKit", group: "Frameworks", aliases: ["svelte", "sveltekit"],
    body: `# SvelteKit build output
.svelte-kit/
/build/
/package/
.vercel/
.netlify/
.output/

# Dependencies
node_modules/

# Vite timestamps
vite.config.js.timestamp-*
vite.config.ts.timestamp-*

# Environment
.env
.env.*
!.env.example`,
  },
  {
    id: "django", name: "Django", group: "Frameworks",
    body: `# Django
*.log
*.pot
*.pyc
__pycache__/
local_settings.py
db.sqlite3
db.sqlite3-journal
/media/
/staticfiles/

# Celery
celerybeat-schedule
celerybeat.pid

# Environment
.env
.venv/`,
  },
  {
    id: "laravel", name: "Laravel", group: "Frameworks",
    body: `# Laravel
/vendor/
/node_modules/
/public/hot
/public/storage
/public/build
/storage/*.key
/storage/pail
.phpunit.result.cache
Homestead.json
Homestead.yaml
auth.json

# Environment
.env
.env.backup
.env.production`,
  },
  {
    id: "rails", name: "Rails", group: "Frameworks", aliases: ["ruby-on-rails"],
    body: `# Rails
/.bundle
/log/*
!/log/.keep
/tmp/*
!/tmp/.keep
/tmp/pids/*
!/tmp/pids/.keep
/storage/*
!/storage/.keep
/public/assets
/public/packs
/public/packs-test
/node_modules
/yarn-error.log
/coverage/

# Credentials
/config/master.key
/config/credentials/*.key

# Environment
.env*
!.env.example`,
  },
  {
    id: "jekyll", name: "Jekyll", group: "Frameworks",
    body: `# Jekyll
_site/
.sass-cache/
.jekyll-cache/
.jekyll-metadata
.bundle/
vendor/`,
  },
  {
    id: "hugo", name: "Hugo", group: "Frameworks",
    body: `# Hugo
/public/
/resources/_gen/
/assets/jsconfig.json
hugo_stats.json
.hugo_build.lock

# Hugo modules
/_vendor/`,
  },
  {
    id: "unity", name: "Unity", group: "Frameworks", aliases: ["unity3d"],
    body: `# Unity generated folders
/[Ll]ibrary/
/[Tt]emp/
/[Oo]bj/
/[Bb]uild/
/[Bb]uilds/
/[Ll]ogs/
/[Uu]ser[Ss]ettings/
/[Mm]emoryCaptures/
/[Rr]ecordings/

# Asset meta data (keep Assets/*.meta, drop the root-level one)
/[Aa]ssets/[Aa]ssetStoreTools*

# IDE / generated projects
.vs/
.gradle/
ExportedObj/
.consulo/
*.csproj
*.unityproj
*.sln
*.suo
*.tmp
*.user
*.userprefs
*.pidb
*.booproj
*.svd
*.pdb
*.mdb
*.opendb
*.VC.db

# Builds
*.apk
*.aab
*.unitypackage
*.app
crashlytics-build.properties`,
  },
  {
    id: "unreal", name: "Unreal Engine", group: "Frameworks", aliases: ["ue4", "ue5", "unreal"],
    body: `# Unreal generated folders
Binaries/
DerivedDataCache/
Intermediate/
Saved/
Build/*
!Build/*/
Build/*/**
!Build/*/PakBlacklist*.txt

# Plugins build output
Plugins/**/Binaries/
Plugins/**/Intermediate/

# Visual Studio
.vs/
*.sln
*.suo
*.opensdf
*.sdf
*.VC.db
*.VC.opendb

# Compiled
*.dll
*.exe
*.pdb
*.ipa
*.apk`,
  },
  {
    id: "godot", name: "Godot", group: "Frameworks",
    body: `# Godot 4+
.godot/
/android/

# Godot 3
.import/
export.cfg
export_presets.cfg

# Imported translations
*.translation

# Mono-specific
.mono/
data_*/
mono_crash.*.json`,
  },
  /* ── build tools & infra ───────────────────────────────────── */
  {
    id: "gradle", name: "Gradle", group: "Build & infra",
    body: `# Gradle
.gradle/
**/build/
!src/**/build/
gradle-app.setting
.gradletasknamecache
local.properties

# Keep the wrapper jar
!gradle/wrapper/gradle-wrapper.jar`,
  },
  {
    id: "maven", name: "Maven", group: "Build & infra", aliases: ["mvn"],
    body: `# Maven
target/
pom.xml.tag
pom.xml.releaseBackup
pom.xml.versionsBackup
pom.xml.next
release.properties
dependency-reduced-pom.xml
buildNumber.properties
.mvn/timing.properties

# Keep the wrapper jar
!.mvn/wrapper/maven-wrapper.jar`,
  },
  {
    id: "android", name: "Android", group: "Build & infra",
    body: `# Build output
*.apk
*.aar
*.ap_
*.aab
*.dex
*.class
bin/
gen/
out/
build/
release/

# Gradle
.gradle/
local.properties
captures/
.externalNativeBuild/
.cxx/

# Signing keys
*.jks
*.keystore
google-services.json

# Android Studio
*.iml
.idea/
.navigation/
lint/intermediates/
lint/generated/
lint/outputs/
lint/tmp/`,
  },
  {
    id: "terraform", name: "Terraform", group: "Build & infra", aliases: ["tf", "opentofu"],
    body: `# Local .terraform directories
**/.terraform/*

# State files (may contain secrets — keep them in a remote backend)
*.tfstate
*.tfstate.*

# Crash logs
crash.log
crash.*.log

# Variable files usually hold secrets
*.tfvars
*.tfvars.json

# Local overrides
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# CLI config & plans
.terraformrc
terraform.rc
*.tfplan

# Keep the lock file: .terraform.lock.hcl`,
  },
  {
    id: "docker", name: "Docker", group: "Build & infra",
    body: `# Docker local overrides and data
docker-compose.override.yml
compose.override.yaml
.docker/
*.tar

# Volumes mounted into the project directory
/data/
/volumes/

# Environment
.env`,
  },
  {
    id: "kubernetes", name: "Kubernetes / Helm", group: "Build & infra", aliases: ["k8s", "helm"],
    body: `# Helm
charts/*.tgz
**/charts/*.tgz
.helm/
requirements.lock

# Kubeconfig and secrets
kubeconfig
*.kubeconfig
*-secret.yaml
secrets.yaml
secrets.*.yaml
!secrets.enc.yaml

# Kustomize build output
/rendered/`,
  },
  /* ── operating systems ─────────────────────────────────────── */
  {
    id: "macos", name: "macOS", group: "Operating systems", aliases: ["osx", "mac", "darwin"],
    body: `# macOS metadata
.DS_Store
.AppleDouble
.LSOverride
Icon?

# Thumbnails
._*

# Volume root files
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Network shares
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk`,
  },
  {
    id: "windows", name: "Windows", group: "Operating systems", aliases: ["win"],
    body: `# Thumbnail caches
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db

# Dump files
*.stackdump

# Folder config
[Dd]esktop.ini

# Recycle Bin
$RECYCLE.BIN/

# Installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Shortcuts
*.lnk`,
  },
  {
    id: "linux", name: "Linux", group: "Operating systems",
    body: `# Backup files
*~

# Temporary files from fuse
.fuse_hidden*

# KDE directory preferences
.directory

# Trash folders
.Trash-*

# NFS temporary files
.nfs*`,
  },
  /* ── editors & IDEs ────────────────────────────────────────── */
  {
    id: "vscode", name: "VS Code", group: "Editors & IDEs", aliases: ["code", "visual-studio-code"],
    body: `# VS Code — share settings/extensions, not personal state
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets
.history/
*.vsix

# Workspaces are often personal
*.code-workspace`,
  },
  {
    id: "jetbrains", name: "JetBrains", group: "Editors & IDEs", aliases: ["idea", "intellij", "pycharm", "webstorm", "goland", "rider", "clion"],
    body: `# JetBrains user-specific files
.idea/**/workspace.xml
.idea/**/tasks.xml
.idea/**/usage.statistics.xml
.idea/**/dictionaries
.idea/**/shelf
.idea/**/aws.xml
.idea/**/contentModel.xml
.idea/**/dataSources/
.idea/**/dataSources.ids
.idea/**/dataSources.local.xml
.idea/**/sqlDataSources.xml
.idea/**/dynamic.xml
.idea/**/uiDesigner.xml
.idea/**/dbnavigator.xml
.idea/httpRequests
.idea/caches/build_file_checksums.ser

# Module files & output
*.iml
*.ipr
*.iws
out/

# Plugins
.idea_modules/
atlassian-ide-plugin.xml
com_crashlytics_export_strings.xml
crashlytics.properties
fabric.properties`,
  },
  {
    id: "vim", name: "Vim", group: "Editors & IDEs", aliases: ["neovim", "nvim"],
    body: `# Swap files
[._]*.s[a-v][a-z]
!*.svg
[._]*.sw[a-p]
[._]s[a-rt-v][a-z]
[._]ss[a-gi-z]
[._]sw[a-p]

# Session & persistent undo
Session.vim
Sessionx.vim
.netrwhist
*~
[._]*.un~
tags`,
  },
  {
    id: "emacs", name: "Emacs", group: "Editors & IDEs",
    body: `# Emacs backups and autosaves
*~
\\#*\\#
/.emacs.desktop
/.emacs.desktop.lock
*.elc
auto-save-list
tramp
.\\#*

# Project & tooling caches
.projectile
.dir-locals-2.el
flycheck_*.el
/server/
dist/
/network-security.data`,
  },
  {
    id: "sublime", name: "Sublime Text", group: "Editors & IDEs", aliases: ["sublimetext"],
    body: `# Sublime cache & workspace
*.tmlanguage.cache
*.tmPreferences.cache
*.stTheme.cache
*.sublime-workspace
# Project files are sometimes shared — ignore if personal
# *.sublime-project

# Package Control
Package Control.last-run
Package Control.ca-list
Package Control.ca-bundle
Package Control.system-ca-bundle
Package Control.cache/
Package Control.ca-certs/
Package Control.merged-ca-bundle
Package Control.user-ca-bundle
oscrypto-ca-bundle.crt
bh_unicode_properties.cache
GitHub.sublime-settings`,
  },
  {
    id: "eclipse", name: "Eclipse", group: "Editors & IDEs",
    body: `# Eclipse metadata
.metadata
bin/
tmp/
*.tmp
*.bak
*.swp
*~.nib
local.properties
.settings/
.loadpath
.recommenders
.project
.classpath
.factorypath
.buildpath
.target
.springBeans
.sts4-cache/
.externalToolBuilders/
*.launch
.pydevproject
.cproject
.autotools`,
  },
  {
    id: "visualstudio", name: "Visual Studio", group: "Editors & IDEs", aliases: ["vs", "msvc"],
    body: `# Visual Studio cache & options
.vs/
*.suo
*.user
*.userosscache
*.sln.docstates
*.VC.db
*.VC.opendb
ipch/
*.aps
*.ncb
*.opendb
*.opensdf
*.sdf
*.cachefile

# Build folders
[Dd]ebug/
[Rr]elease/
x64/
x86/
[Bb]in/
[Oo]bj/

# ReSharper / Rider
_ReSharper*/
*.[Rr]e[Ss]harper
*.DotSettings.user`,
  },
  /* ── tools & misc ──────────────────────────────────────────── */
  {
    id: "jupyter", name: "Jupyter", group: "Tools & misc", aliases: ["ipython", "notebook"],
    body: `# Jupyter checkpoints
.ipynb_checkpoints/
*/.ipynb_checkpoints/*

# IPython
profile_default/
ipython_config.py

# Large data & outputs (adjust to taste)
*.npy
*.npz
*.h5
*.parquet`,
  },
  {
    id: "latex", name: "LaTeX", group: "Tools & misc", aliases: ["tex"],
    body: `# LaTeX intermediate files
*.aux
*.lof
*.log
*.lot
*.fls
*.out
*.toc
*.fmt
*.fot
*.cb
*.cb2
.*.lb

# Build tools
*.fdb_latexmk
*.synctex
*.synctex(busy)
*.synctex.gz
*.synctex.gz(busy)
*.pdfsync
latexmk.log

# Bibliography
*.bbl
*.bcf
*.blg
*-blx.aux
*-blx.bib
*.run.xml

# Output (commit the PDF only if you mean to)
*.dvi
*.xdv
*-converted-to.*
# *.pdf`,
  },
  {
    id: "env", name: "Env files", group: "Tools & misc", aliases: ["dotenv", "secrets"],
    body: `# Environment files with secrets
.env
.env.*
*.env
!.env.example
!.env.sample
!.env.template

# Private keys & certificates
*.pem
*.key
*.p12
*.pfx
id_rsa*
!*.pub`,
  },
  {
    id: "logs", name: "Logs", group: "Tools & misc",
    body: `# Log files
*.log
*.log.*
logs/
log/
*.out
nohup.out`,
  },
  {
    id: "archives", name: "Archives", group: "Tools & misc", aliases: ["zip", "compressed"],
    body: `# Archives & packages
*.7z
*.dmg
*.gz
*.tgz
*.bz2
*.xz
*.zst
*.iso
*.jar
*.rar
*.tar
*.zip`,
  },
  {
    id: "temp", name: "Temp & backups", group: "Tools & misc", aliases: ["tmp", "backup", "temp"],
    body: `# Temporary & backup files
*.tmp
*.temp
*.bak
*.orig
*.rej
*.swp
*.swo
tmp/
temp/`,
  },
];

export const TEMPLATE_BY_ID: Record<string, Template> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Resolve a user-typed name ("Node.js", "osx", "c#") to a template id. */
export function resolveTemplate(name: string): Template | undefined {
  const n = name.trim().toLowerCase().replace(/\.js$/, "").replace(/\s+/g, "-");
  if (!n) return undefined;
  return (
    TEMPLATE_BY_ID[n] ??
    TEMPLATES.find((t) => t.name.toLowerCase() === name.trim().toLowerCase() || t.name.toLowerCase().replace(/\s+/g, "-") === n || t.aliases?.includes(n)) ??
    TEMPLATES.find((t) => t.name.toLowerCase().split(/[\s/]+/).includes(n))
  );
}
