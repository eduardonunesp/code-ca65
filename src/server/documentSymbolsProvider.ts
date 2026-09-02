import { DocumentSymbol, SymbolKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolTable } from './symbolTable';

export function provideDocumentSymbols(document: TextDocument, symbolTable: SymbolTable): DocumentSymbol[] {
	const symbols: DocumentSymbol[] = [];
	const uri = document.uri;

	for (const [, entry] of symbolTable) {
		const localDefs = entry.definitions.filter(d => !d.uri || d.uri === uri);
		for (const def of localDefs) {
			const kind = def.kind === 'constant' || def.kind === 'define' ? SymbolKind.Constant :
				def.kind === 'macro' ? SymbolKind.Function :
				def.kind === 'set' ? SymbolKind.Variable :
				SymbolKind.Field;

			const name = def.kind === 'macro' ? `.macro ${def.name}` :
				def.kind === 'constant' ? `${def.name} = ${def.value || '...'}` :
				def.kind === 'define' ? `.define ${def.name}` :
				def.name;

			symbols.push(DocumentSymbol.create(
				name,
				def.value && def.kind !== 'constant' ? def.value : undefined,
				kind,
				{
					start: { line: def.line, character: def.character },
					end: { line: def.line, character: def.endCharacter },
				},
				{
					start: { line: def.line, character: def.character },
					end: { line: def.line, character: def.endCharacter },
				},
			));
		}
	}

	symbols.sort((a, b) => a.range.start.line - b.range.start.line);
	return symbols;
}