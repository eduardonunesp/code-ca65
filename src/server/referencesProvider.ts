import {
	Location,
} from 'vscode-languageserver/node';
import { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { SymbolTable } from './symbolTable';
import { getWordAtPosition } from './hoverProvider';

export function provideReferences(
	document: TextDocument,
	position: Position,
	context: { includeDeclaration: boolean },
	symbolTable: SymbolTable
): Location[] | null {
	const wordResult = getWordAtPosition(document, position);
	if (!wordResult) return null;

	const entry = symbolTable.get(wordResult.word.toLowerCase());
	if (!entry) return null;

	const locations: Location[] = [];

	if (context.includeDeclaration) {
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
	}

	for (const ref of entry.references) {
		locations.push({
			uri: document.uri,
			range: {
				start: { line: ref.line, character: ref.character },
				end: { line: ref.line, character: ref.endCharacter },
			},
		});
	}

	return locations.length > 0 ? locations : null;
}