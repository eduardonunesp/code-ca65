import {
	CompletionItem,
	CompletionItemKind,
} from 'vscode-languageserver/node';
import { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { opcodes } from '../data/opcodes';
import { directives } from '../data/directives';
import { SymbolTable } from './symbolTable';

const seenMnemonics = new Set<string>();
const opcodeItems: CompletionItem[] = [];
for (const entry of opcodes) {
	if (seenMnemonics.has(entry.mnemonic)) continue;
	seenMnemonics.add(entry.mnemonic);
	opcodeItems.push({
		label: entry.mnemonic.toLowerCase(),
		kind: CompletionItemKind.Keyword,
		detail: entry.summary,
		documentation: {
			kind: 'markdown',
			value: `**${entry.mnemonic}** — ${entry.summary}\n\nCPUs: ${entry.cpus.join(', ')}` +
				(entry.affectedFlags.length > 0 ? `\n\nAffected flags: ${entry.affectedFlags.join(', ')}` : ''),
		},
		sortText: `1${entry.mnemonic.toLowerCase()}`,
	});
}

const directiveItems: CompletionItem[] = directives.map(entry => ({
	label: entry.name,
	kind: entry.kind === 'pseudofunction' ? CompletionItemKind.Function :
		entry.kind === 'pseudovar' ? CompletionItemKind.Variable :
		entry.kind === 'block' ? CompletionItemKind.Snippet :
		CompletionItemKind.Keyword,
	detail: `${entry.kind}: ${entry.summary}`,
	documentation: entry.syntax ? { kind: 'markdown' as const, value: `**${entry.name}** — ${entry.summary}\n\nSyntax: \`${entry.syntax}\`${entry.example ? `\n\nExample: \`${entry.example}\`` : ''}` } : undefined,
	sortText: `2${entry.name}`,
}));

export function provideCompletion(document: TextDocument, position: Position, symbolTable: SymbolTable | null): CompletionItem[] {
	const text = document.getText();
	const offset = document.offsetAt(position);
	const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
	const linePrefix = text.substring(lineStart, offset);

	const items: CompletionItem[] = [];

	if (linePrefix.trimStart().startsWith('.')) {
		const prefix = linePrefix.trimStart().toLowerCase();
		for (const item of directiveItems) {
			if (item.label.toLowerCase().startsWith(prefix)) {
				items.push(item);
			}
		}
	} else {
		const wordMatch = linePrefix.match(/[A-Za-z_]\w*$/);
		if (wordMatch) {
			const prefix = wordMatch[0].toLowerCase();
			for (const item of opcodeItems) {
				if (item.label.toLowerCase().startsWith(prefix)) {
					items.push(item);
				}
			}
			if (symbolTable) {
				for (const [key, entry] of symbolTable) {
					if (key.startsWith(prefix) && entry.definitions.length > 0) {
						const def = entry.definitions[0];
						const kindLabel = def.kind.charAt(0).toUpperCase() + def.kind.slice(1);
						items.push({
							label: def.name,
							kind: def.kind === 'constant' || def.kind === 'define' ? CompletionItemKind.Constant :
								def.kind === 'macro' ? CompletionItemKind.Interface :
								def.kind === 'set' ? CompletionItemKind.Variable :
								CompletionItemKind.Field,
							detail: `${kindLabel}${def.value ? ` = ${def.value}` : ''}`,
							sortText: `0${def.name}`,
						});
					}
				}
			}
		} else {
			for (const item of opcodeItems) {
				items.push(item);
			}
			for (const item of directiveItems) {
				items.push(item);
			}
			if (symbolTable) {
				for (const [, entry] of symbolTable) {
					if (entry.definitions.length > 0) {
						const def = entry.definitions[0];
						items.push({
							label: def.name,
							kind: def.kind === 'constant' || def.kind === 'define' ? CompletionItemKind.Constant :
								def.kind === 'macro' ? CompletionItemKind.Interface :
								CompletionItemKind.Field,
							sortText: `0${def.name}`,
						});
					}
				}
			}
		}
	}

	return items;
}