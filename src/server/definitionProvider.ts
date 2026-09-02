import { Definition, Location } from 'vscode-languageserver/node';
import { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { SymbolTable } from './symbolTable';
import { getWordAtPosition } from './hoverProvider';

export function provideDefinition(
	document: TextDocument,
	position: Position,
	symbolTable: SymbolTable
): Definition | null {
	const wordResult = getWordAtPosition(document, position);
	if (!wordResult) return null;

	const entry = symbolTable.get(wordResult.word.toLowerCase());
	if (!entry || entry.definitions.length === 0) return null;

	const locations: Location[] = [];
	for (const def of entry.definitions) {
		const uri = def.uri || document.uri;
		locations.push({
			uri,
			range: {
				start: { line: def.line, character: def.character },
				end: { line: def.line, character: def.endCharacter },
			},
		});
	}

	return locations.length > 0 ? locations : null;
}