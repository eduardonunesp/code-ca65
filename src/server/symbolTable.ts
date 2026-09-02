import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

export interface SymbolDef {
	name: string;
	kind: 'label' | 'constant' | 'define' | 'set' | 'macro';
	line: number;
	character: number;
	endCharacter: number;
	value?: string;
	uri?: string;
}

export interface SymbolRef {
	line: number;
	character: number;
	endCharacter: number;
}

export interface SymbolEntry {
	definitions: SymbolDef[];
	references: SymbolRef[];
}

export type SymbolTable = Map<string, SymbolEntry>;

const LABEL_RE = /^\s*([A-Za-z_]\w*)\s*:(?!=)/;
const CONST_RE = /^\s*([A-Za-z_]\w*)\s*(?::=|=)\s*(.+)/;
const SET_RE = /\b([A-Za-z_]\w*)\s+\.set\b/i;
const DEFINE_RE = /^\.define\s+([A-Za-z_]\w*)(?:\s+(.+))?/i;
const MACRO_RE = /^\.m(?:ac|acro)\s+([A-Za-z_]\w*)/i;
const PROC_RE = /^\.proc\s+([A-Za-z_]\w*)/i;
const NUMBER_RE = /^[$%]?[0-9A-Fa-f]+$/i;
const IDENTIFIER_RE = /\b([A-Za-z_]\w*)\b/g;

function isKnownKeyword(name: string): boolean {
	const lower = name.toLowerCase();
	if (lower === 'a' || lower === 'x' || lower === 'y' || lower === 's') return true;
	if (lower === 'true' || lower === 'false' || lower === 'on' || lower === 'off') return true;
	return false;
}

function stripComment(line: string): string {
	const idx = line.indexOf(';');
	if (idx >= 0) return line.substring(0, idx);
	return line;
}

function findWords(text: string, name: string): { line: number; character: number; endCharacter: number }[] {
	const results: { line: number; character: number; endCharacter: number }[] = [];
	const lowerName = name.toLowerCase();
	const lines = text.split('\n');
	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const rawLine = lines[lineIdx];
		const line = stripComment(rawLine);
		let inString = false;
		for (let col = 0; col < line.length; col++) {
			if (line[col] === '"') {
				inString = !inString;
				continue;
			}
			if (inString) continue;

			if (col + name.length <= line.length && line.substring(col, col + name.length).toLowerCase() === lowerName) {
				const beforeOk = col === 0 || !isWordChar(line.charCodeAt(col - 1));
				const afterOk = col + name.length >= line.length || !isWordChar(line.charCodeAt(col + name.length));
				if (beforeOk && afterOk) {
					results.push({
						line: lineIdx,
						character: col,
						endCharacter: col + name.length,
					});
				}
			}
		}
	}
	return results;
}

function isWordChar(code: number): boolean {
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95;
}

export function buildSymbolTable(document: TextDocument): SymbolTable {
	const text = document.getText();
	const lines = text.split('\n');
	const table = new Map<string, SymbolEntry>();
	const uri = document.uri;

	function ensureEntry(name: string): SymbolEntry {
		const key = name.toLowerCase();
		let entry = table.get(key);
		if (!entry) {
			entry = { definitions: [], references: [] };
			table.set(key, entry);
		}
		return entry;
	}

	const definedNames = new Set<string>();

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const rawLine = lines[lineIdx];
		const stripped = stripComment(rawLine);

		let m: RegExpMatchArray | null;

		m = stripped.match(MACRO_RE);
		if (m) {
			const name = m[1];
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			entry.definitions.push({
				name,
				kind: 'macro',
				line: lineIdx,
				character: m.index! + m[0].indexOf(name),
				endCharacter: m.index! + m[0].indexOf(name) + name.length,
			});
			continue;
		}

		m = stripped.match(DEFINE_RE);
		if (m) {
			const name = m[1];
			const value = m[2] || undefined;
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			entry.definitions.push({
				name,
				kind: 'define',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				value,
			});
			continue;
		}

		m = stripped.match(CONST_RE);
		if (m) {
			const name = m[1];
			const value = m[2].trim();
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			const existingDef = entry.definitions.find(d => d.kind === 'constant' && d.line === lineIdx);
			if (!existingDef) {
				entry.definitions.push({
					name,
					kind: 'constant',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					value,
					uri,
				});
			}
		} else {
			m = stripped.match(SET_RE);
			if (m) {
				const name = m[1];
				definedNames.add(name.toLowerCase());
				const entry = ensureEntry(name);
				entry.definitions.push({
					name,
					kind: 'set',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					uri,
				});
			}
		}

		m = stripped.match(PROC_RE);
		if (m) {
			const name = m[1];
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			entry.definitions.push({
				name,
				kind: 'label',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				uri,
			});
		}

		m = stripped.match(LABEL_RE);
		if (m) {
			const name = m[1];
			if (name.toLowerCase() !== 'a' && name.toLowerCase() !== 'x' && name.toLowerCase() !== 'y') {
				definedNames.add(name.toLowerCase());
				const entry = ensureEntry(name);
				entry.definitions.push({
					name,
					kind: 'label',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					uri,
				});
			}
		}
	}

	for (const name of definedNames) {
		const entry = table.get(name)!;
		const allOccurrences = findWords(text, name);
		for (const occ of allOccurrences) {
			const isExactDef = entry.definitions.some(d => d.line === occ.line && d.character === occ.character);
			if (!isExactDef) {
				entry.references.push(occ);
			}
		}
	}

	return table;
}

function extractDefinitions(text: string, uri: string): SymbolDef[] {
	const lines = text.split('\n');
	const defs: SymbolDef[] = [];

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const rawLine = lines[lineIdx];
		const stripped = stripComment(rawLine);

		let m: RegExpMatchArray | null;

		m = stripped.match(MACRO_RE);
		if (m) {
			const name = m[1];
			defs.push({
				name,
				kind: 'macro',
				line: lineIdx,
				character: m.index! + m[0].indexOf(name),
				endCharacter: m.index! + m[0].indexOf(name) + name.length,
				uri,
			});
			continue;
		}

		m = stripped.match(DEFINE_RE);
		if (m) {
			const name = m[1];
			const value = m[2] || undefined;
			defs.push({
				name,
				kind: 'define',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				value,
				uri,
			});
			continue;
		}

		m = stripped.match(CONST_RE);
		if (m) {
			const name = m[1];
			const value = m[2].trim();
			defs.push({
				name,
				kind: 'constant',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				value,
				uri,
			});
		} else {
			m = stripped.match(SET_RE);
			if (m) {
				const name = m[1];
				defs.push({
					name,
					kind: 'set',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					uri,
				});
			}
		}

		m = stripped.match(PROC_RE);
		if (m) {
			const name = m[1];
			defs.push({
				name,
				kind: 'label',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				uri,
			});
		}

		m = stripped.match(LABEL_RE);
		if (m) {
			const name = m[1];
			if (name.toLowerCase() !== 'a' && name.toLowerCase() !== 'x' && name.toLowerCase() !== 'y') {
				defs.push({
					name,
					kind: 'label',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					uri,
				});
			}
		}
	}

	return defs;
}

const ASM_EXTENSIONS = ['.s', '.asm', '.a65', '.inc'];

function findAsmFiles(dir: string): string[] {
	const results: string[] = [];
	let entries: string[] = [];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return results;
	}
	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			if (entry === 'node_modules' || entry === '.git' || entry === 'out') continue;
			results.push(...findAsmFiles(fullPath));
		} else if (stat.isFile()) {
			const ext = path.extname(entry).toLowerCase();
			if (ASM_EXTENSIONS.includes(ext)) {
				results.push(fullPath);
			}
		}
	}
	return results;
}

function fileUri(filePath: string): string {
	return 'file://' + filePath;
}

export function buildGlobalDefinitionsTable(workspaceRoot: string): Map<string, SymbolDef[]> {
	const globalDefs = new Map<string, SymbolDef[]>();
	const files = findAsmFiles(workspaceRoot);

	for (const filePath of files) {
		try {
			const text = fs.readFileSync(filePath, 'utf-8');
			const uri = fileUri(filePath);
			const defs = extractDefinitions(text, uri);
			for (const def of defs) {
				const key = def.name.toLowerCase();
				let list = globalDefs.get(key);
				if (!list) {
					list = [];
					globalDefs.set(key, list);
				}
				list.push(def);
			}
		} catch {
			// skip unreadable files
		}
	}

	return globalDefs;
}

export function buildSymbolTableWithGlobals(document: TextDocument, globalDefs: Map<string, SymbolDef[]>): SymbolTable {
	const text = document.getText();
	const lines = text.split('\n');
	const table = new Map<string, SymbolEntry>();
	const uri = document.uri;

	function ensureEntry(name: string): SymbolEntry {
		const key = name.toLowerCase();
		let entry = table.get(key);
		if (!entry) {
			entry = { definitions: [], references: [] };
			table.set(key, entry);
		}
		return entry;
	}

	const definedNames = new Set<string>();

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const rawLine = lines[lineIdx];
		const stripped = stripComment(rawLine);

		let m: RegExpMatchArray | null;

		m = stripped.match(MACRO_RE);
		if (m) {
			const name = m[1];
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			entry.definitions.push({
				name,
				kind: 'macro',
				line: lineIdx,
				character: m.index! + m[0].indexOf(name),
				endCharacter: m.index! + m[0].indexOf(name) + name.length,
				uri,
			});
			continue;
		}

		m = stripped.match(DEFINE_RE);
		if (m) {
			const name = m[1];
			const value = m[2] || undefined;
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			entry.definitions.push({
				name,
				kind: 'define',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				value,
				uri,
			});
			continue;
		}

		m = stripped.match(CONST_RE);
		if (m) {
			const name = m[1];
			const value = m[2].trim();
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			const existingDef = entry.definitions.find(d => d.kind === 'constant' && d.line === lineIdx);
			if (!existingDef) {
				entry.definitions.push({
					name,
					kind: 'constant',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					value,
					uri,
				});
			}
		} else {
			m = stripped.match(SET_RE);
			if (m) {
				const name = m[1];
				definedNames.add(name.toLowerCase());
				const entry = ensureEntry(name);
				entry.definitions.push({
					name,
					kind: 'set',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					uri,
				});
			}
		}

		m = stripped.match(PROC_RE);
		if (m) {
			const name = m[1];
			definedNames.add(name.toLowerCase());
			const entry = ensureEntry(name);
			entry.definitions.push({
				name,
				kind: 'label',
				line: lineIdx,
				character: rawLine.indexOf(name),
				endCharacter: rawLine.indexOf(name) + name.length,
				uri,
			});
		}

		m = stripped.match(LABEL_RE);
		if (m) {
			const name = m[1];
			if (name.toLowerCase() !== 'a' && name.toLowerCase() !== 'x' && name.toLowerCase() !== 'y') {
				definedNames.add(name.toLowerCase());
				const entry = ensureEntry(name);
				entry.definitions.push({
					name,
					kind: 'label',
					line: lineIdx,
					character: rawLine.indexOf(name),
					endCharacter: rawLine.indexOf(name) + name.length,
					uri,
				});
			}
		}
	}

	for (const [key, defs] of globalDefs) {
		if (!definedNames.has(key)) {
			for (const def of defs) {
				if (def.uri !== uri) {
					const entry = ensureEntry(def.name);
					if (entry.definitions.length === 0) {
						entry.definitions.push(def);
					}
				}
			}
		}
	}

	for (const name of table.keys()) {
		const entry = table.get(name)!;
		const allOccurrences = findWords(text, name);
		for (const occ of allOccurrences) {
			const isExactDef = entry.definitions.some(d => d.line === occ.line && d.character === occ.character && d.uri === uri);
			if (!isExactDef) {
				entry.references.push(occ);
			}
		}
	}

	const docLines = text.split('\n');
	for (let lineIdx = 0; lineIdx < docLines.length; lineIdx++) {
		const rawLine = docLines[lineIdx];
		const line = stripComment(rawLine);

		let processed = '';
		let inString = false;
		for (let i = 0; i < line.length; i++) {
			if (line[i] === '"') {
				inString = !inString;
				processed += ' ';
				continue;
			}
			if (inString) {
				processed += ' ';
				continue;
			}
			if (line[i] === '.' && i + 1 < line.length && /[A-Za-z_]/.test(line[i + 1])) {
				let j = i + 1;
				while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
				for (let k = i; k < j; k++) processed += ' ';
				i = j - 1;
				continue;
			}
			processed += line[i];
		}

		IDENTIFIER_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = IDENTIFIER_RE.exec(processed)) !== null) {
			const word = match[1];
			const lower = word.toLowerCase();
			if (table.has(lower)) continue;
			if (isKnownKeyword(word)) continue;
			if (NUMBER_RE.test(word)) continue;

			const entry = ensureEntry(word);
			const origCol = rawLine.indexOf(word, match.index > 0 ? match.index - 1 : match.index);
			entry.references.push({
				line: lineIdx,
				character: origCol >= 0 ? origCol : match.index,
				endCharacter: (origCol >= 0 ? origCol : match.index) + word.length,
			});
		}
	}

	return table;
}