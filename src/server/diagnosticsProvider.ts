import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolTable } from './symbolTable';
import { opcodes } from '../data/opcodes';
import { directives } from '../data/directives';

const BUILTINS = new Set([
	'a', 'x', 'y', 's',
]);

const KNOWN_KEYWORDS = new Set<string>();
for (const entry of opcodes) {
	KNOWN_KEYWORDS.add(entry.mnemonic.toLowerCase());
}
for (const entry of directives) {
	KNOWN_KEYWORDS.add(entry.name.toLowerCase());
}

export function provideDiagnostics(document: TextDocument, symbolTable: SymbolTable): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const uri = document.uri;

	for (const [key, entry] of symbolTable) {
		if (BUILTINS.has(key)) continue;
		if (KNOWN_KEYWORDS.has(key)) continue;

		if (entry.definitions.length === 0 && entry.references.length > 0) {
			for (const ref of entry.references) {
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range: {
						start: { line: ref.line, character: ref.character },
						end: { line: ref.line, character: ref.endCharacter },
					},
					message: `Symbol '${key}' is not defined in this file or the workspace.`,
					source: 'ca65',
				});
			}
		}

		const localDefs = entry.definitions.filter(d => !d.uri || d.uri === uri);
		if (localDefs.length > 1) {
			for (let i = 1; i < localDefs.length; i++) {
				const def = localDefs[i];
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					range: {
						start: { line: def.line, character: def.character },
						end: { line: def.line, character: def.endCharacter },
					},
					message: `Duplicate definition of '${def.name}'. Previously defined at line ${localDefs[0].line + 1}.`,
					source: 'ca65',
				});
			}
		}
	}

	return diagnostics;
}