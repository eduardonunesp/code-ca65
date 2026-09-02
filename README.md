# ca65 Macro Assembler Language Support (6502/65816)

This extension provides syntax highlighting, language server features, and problem matchers for use with the [ca65 6502/65816 Macro Assembler](https://www.cc65.org/doc/ca65.html).

## Features

All 6502, 65816, and variant opcodes are supported by the syntax highlighter, as well as all ca65 pseudovariables, control commands, operators, and literals.

![Syntax Highlighting](images/highlighting.png)

### Language Server (LSP)

The extension includes a language server that provides intelligent code assistance across your workspace:

- **Hover** — Hover over opcodes, directives, and user-defined symbols (labels, constants, macros, `.define`s, `.set`s) to see documentation, CPU compatibility, affected flags, addressing modes, and symbol details.
- **Go to Definition** — Jump to the definition of any label, constant, macro, `.define`, or `.set` symbol, including definitions in other workspace files.
- **Find All References** — Find all references to a symbol across the current file.
- **Autocomplete** — Get completions for opcodes (with CPU and flag info), ca65 directives (with syntax and examples), and workspace-defined symbols. Type `.` to trigger directive completions.
- **Document Symbols** — View labels, constants, macros, and defines in the Outline view for quick navigation.
- **Diagnostics** — Warnings for undefined symbols and errors for duplicate definitions, updated live as you edit.

The language server indexes all `.s`, `.asm`, `.a65`, and `.inc` files in your workspace to provide cross-file definition lookups.

### Build Tasks

This extension automatically registers build tasks for 6502 and 65816 assembly files which invoke `cl65` on the file currently being edited. If you have one or more [memory map configuration
files](https://www.cc65.org/doc/ld65-5.html) in your workspace folder with the `.cfg` extension, a task will be created for each of them in addition to the default task, which does not specify a configuration file.

You can also create a file in the root of your workspace called `cl65config.json`. This allows you to optionally specify the name of the input file which is passed to the assembler as well as any additional parameters. Optionally, you can also specify the location of the `cl65` executable itself, if it isn't available on your `PATH`.

```json
{
    "executable": "C:\\tools\\cl65.exe",
    "input": "main.asm",
    "params": "--verbose"
}
```

### Problem Matchers

If you want to create custom build tasks, this extension contributes the following problem matchers:

* `cl65`
* `ca65`
* `ld65`

You can use these problem matchers in `task.json` using the normal syntax.

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "ca65: Compile and Link Current File",
            "group": "build",
            "type": "shell",
            "command": "cl65 ${file}",
            "problemMatcher": ["$ca65", "$ld65"]
        }
    ]
}
```

## Release Notes

### 1.2.9

Added language server (LSP) with hover, go to definition, find all references, autocomplete, document symbols, and diagnostics.
Added support for number literals with underlines when using `underline_in_numbers` feature.

### 1.2.8

Disables hex color decorators by default in 6502 source files.

### 1.2.7

Added support for Hudson Soft HuC6280 opcodes.

### 1.2.6

Fixed a bug preventing comments from being recognized immediately following a blockstart.
Updated tasks.json to remove references to unused problem matchers (thanks to @ianbestGV).

### 1.2.5

Reworked problem matchers.

### 1.2.4

Fixed a bug preventing the char constants `'` and `\` from being parsed correctly.
Fixed a bug relating to the ordering of the CLI options passed to `ca65`.

### 1.2.3

Added support for the `executable` parameter in `cl65config.json`.

### 1.2.2

Added support for .inc files.

### 1.2.1

Added support for .fatal, .definedmacro, .undef, .undefine.

### 1.2.0

Added support for block comments.
Added support for .endrepeat.
Updated packages.

### 1.1.0

Added autodetected build tasks.
Added support for cl65config.json.

### 1.0.0

Initial release of code-ca65.

## Building/Packing Instructions

Make sure you have Node.js installed. Then run:

```
npm install -g vsce
```

You can use `vsce` to package the extension by running it within the repository directory:

```
vsce package
```

Then install the resulting `.vsix` file in VS Code/VSCodium:

```
code --install-extension code-ca65-*.vsix
```

Or via the Extensions panel → `...` menu → **Install from VSIX...**.

> **Note:** If you encounter an `@types/vscode` compatibility error when running `vsce package`, ensure that the `@types/vscode` version in `devDependencies` does not exceed the `engines.vscode` version in `package.json`. You can either upgrade `engines.vscode` to match or downgrade `@types/vscode` to a compatible version.