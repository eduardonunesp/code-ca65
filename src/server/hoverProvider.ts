import {
	Hover,
	MarkupKind,
	MarkupContent,
} from 'vscode-languageserver/node';
import { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { KeywordEntry, OpcodeEntry, DirectiveEntry } from '../data/types';
import { opcodes } from '../data/opcodes';
import { directives } from '../data/directives';
import { SymbolTable, SymbolDef } from './symbolTable';

const keywordMap = new Map<string, KeywordEntry>();
for (const entry of opcodes) {
	keywordMap.set(entry.mnemonic.toLowerCase(), entry);
}
for (const entry of directives) {
	keywordMap.set(entry.name.toLowerCase(), entry);
}

export function getWordAtPosition(document: TextDocument, position: Position): { word: string; start: Position; end: Position } | null {
	const text = document.getText();
	const offset = document.offsetAt(position);
	if (offset < 0 || offset > text.length) return null;

	if (offset < text.length && text[offset] === '*') {
		const pos = document.positionAt(offset);
		return { word: '*', start: pos, end: document.positionAt(offset + 1) };
	}
	if (offset > 0 && text[offset - 1] === '*') {
		const pos = document.positionAt(offset - 1);
		return { word: '*', start: pos, end: document.positionAt(offset) };
	}

	let start = offset;
	let end = offset;

	if (offset < text.length && text[offset] === '.') {
		end++;
		while (end < text.length && isIdentChar(text.charCodeAt(end))) {
			end++;
		}
	} else if (offset > 0 && text[offset - 1] === '.') {
		start--;
		while (end < text.length && isIdentChar(text.charCodeAt(end))) {
			end++;
		}
	} else {
		while (start > 0 && isIdentChar(text.charCodeAt(start - 1))) {
			start--;
		}
		while (end < text.length && isIdentChar(text.charCodeAt(end))) {
			end++;
		}
		if (start > 0 && text.charCodeAt(start - 1) === 46) {
			start--;
		}
	}

	if (start === end) return null;

	const word = text.substring(start, end);
	if (!word) return null;

	return {
		word,
		start: document.positionAt(start),
		end: document.positionAt(end),
	};
}

function isIdentChar(code: number): boolean {
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95;
}

function formatOpcode(entry: OpcodeEntry): string {
	const lines: string[] = [];
	lines.push(`### ${entry.mnemonic}`);
	lines.push('');
	lines.push(`**${entry.summary}**`);
	lines.push('');
	lines.push(`CPUs: ${entry.cpus.join(', ')}`);
	if (entry.affectedFlags.length > 0) {
		lines.push(`Affected flags: ${entry.affectedFlags.join(', ')}`);
	}
	if (entry.addressingModes.length > 0) {
		lines.push('');
		lines.push('| Mode | Syntax |');
		lines.push('|------|--------|');
		for (const mode of entry.addressingModes) {
			lines.push(`| ${mode.mode} | \`${mode.syntax}\` |`);
		}
	}
	if (entry.example) {
		lines.push('');
		lines.push(`Example: \`${entry.example}\``);
	}
	return lines.join('\n');
}

function formatDirective(entry: DirectiveEntry): string {
	const lines: string[] = [];
	lines.push(`### ${entry.name}`);
	lines.push('');
	lines.push(`**${entry.summary}**`);
	lines.push('');
	lines.push(`Kind: ${entry.kind}`);
	if (entry.syntax) {
		lines.push(`Syntax: \`${entry.syntax}\``);
	}
	if (entry.example) {
		lines.push('');
		lines.push(`Example: \`${entry.example}\``);
	}
	return lines.join('\n');
}

function formatUserSymbol(def: SymbolDef, refCount: number): string {
	const lines: string[] = [];
	const kindLabel = def.kind.charAt(0).toUpperCase() + def.kind.slice(1);
	lines.push(`### ${def.name}`);
	lines.push('');
	lines.push(`**${kindLabel}**`);
	lines.push('');
	if (def.uri) {
		const fileName = def.uri.replace(/^file:\/\//, '').split('/').pop() || def.uri;
		lines.push(`Defined at ${fileName}:${def.line + 1}`);
	} else {
		lines.push(`Defined at line ${def.line + 1}`);
	}
	if (def.value) {
		lines.push(`Value: \`${def.value}\``);
	}
	if (refCount > 0) {
		lines.push(`Referenced at ${refCount} location${refCount > 1 ? 's' : ''}`);
	}
	return lines.join('\n');
}

export function provideHover(document: TextDocument, position: Position, symbolTable: SymbolTable | null): Hover | null {
	const wordResult = getWordAtPosition(document, position);
	if (!wordResult) return null;

	const { word, start, end } = wordResult;
	const lookup = word.toLowerCase();

	const keywordEntry = keywordMap.get(lookup);
	if (keywordEntry) {
		let markdown: string;
		if (keywordEntry.kind === 'opcode') {
			markdown = formatOpcode(keywordEntry as OpcodeEntry);
		} else {
			markdown = formatDirective(keywordEntry as DirectiveEntry);
		}
		const contents: MarkupContent = {
			kind: MarkupKind.Markdown,
			value: markdown,
		};
		return {
			contents,
			range: { start, end },
		};
	}

	if (symbolTable) {
		const symEntry = symbolTable.get(lookup);
		if (symEntry && symEntry.definitions.length > 0) {
			const def = symEntry.definitions[0];
			const markdown = formatUserSymbol(def, symEntry.references.length);
			const contents: MarkupContent = {
				kind: MarkupKind.Markdown,
				value: markdown,
			};
			return {
				contents,
				range: { start, end },
			};
		}
	}

	return null;
}