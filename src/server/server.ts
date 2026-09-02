import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	InitializeResult,
	DidChangeWatchedFilesNotification,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { provideHover } from './hoverProvider';
import { provideReferences } from './referencesProvider';
import { provideDefinition } from './definitionProvider';
import { provideCompletion } from './completionProvider';
import { provideDiagnostics } from './diagnosticsProvider';
import { provideDocumentSymbols } from './documentSymbolsProvider';
import { buildSymbolTableWithGlobals, buildGlobalDefinitionsTable, SymbolTable, SymbolDef } from './symbolTable';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const symbolTables = new Map<string, SymbolTable>();
let globalDefs = new Map<string, SymbolDef[]>();
let workspaceRoot: string | null = null;

function rebuildTable(uri: string) {
	try {
		const document = documents.get(uri);
		if (document) {
			const table = buildSymbolTableWithGlobals(document, globalDefs);
			symbolTables.set(uri, table);
			connection.console.log(`Built symbol table for ${uri}: ${table.size} symbols (global defs: ${globalDefs.size})`);
			const diagnostics = provideDiagnostics(document, table);
			connection.sendDiagnostics({ uri, diagnostics });
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`Error building symbol table: ${msg}`);
	}
}

function rebuildGlobalDefs() {
	if (!workspaceRoot) return;
	try {
		globalDefs = buildGlobalDefinitionsTable(workspaceRoot);
		connection.console.log(`Built global definitions: ${globalDefs.size} symbols from ${workspaceRoot}`);
		for (const uri of symbolTables.keys()) {
			rebuildTable(uri);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`Error building global definitions: ${msg}`);
	}
}

connection.onInitialize((params): InitializeResult => {
	if (params.workspaceFolders && params.workspaceFolders.length > 0) {
		const folder = params.workspaceFolders[0];
		workspaceRoot = folder.uri.replace('file://', '');
	}
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			hoverProvider: true,
			referencesProvider: true,
			definitionProvider: true,
			completionProvider: {
				triggerCharacters: ['.', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
					'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
					'_', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
					'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
			},
			documentSymbolProvider: true,
			workspace: {
				fileOperations: {
					didCreate: { filters: [{ pattern: { glob: '**/*.{s,asm,a65,inc}' } }] },
					didDelete: { filters: [{ pattern: { glob: '**/*.{s,asm,a65,inc}' } }] },
				},
			},
		},
	};
});

connection.onInitialized(() => {
	rebuildGlobalDefs();
	for (const uri of documents.keys()) {
		rebuildTable(uri);
	}

	void connection.client.register?.(DidChangeWatchedFilesNotification.type, {
		watchers: [{ globPattern: '**/*.{s,asm,a65,inc}' }],
	});

	connection.onDidChangeWatchedFiles(() => {
		connection.console.log('Workspace files changed, rebuilding global definitions...');
		rebuildGlobalDefs();
	});
});

documents.onDidChangeContent((change) => {
	rebuildTable(change.document.uri);
});

documents.onDidOpen((change) => {
	rebuildTable(change.document.uri);
});

documents.onDidClose((change) => {
	symbolTables.delete(change.document.uri);
	connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
});

connection.onHover((params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) return null;
		const table = symbolTables.get(params.textDocument.uri) ?? null;
		const result = provideHover(document, params.position, table);
		if (!result) {
			connection.console.log(`hover: no result at ${params.position.line}:${params.position.character} (table: ${table?.size ?? 0} symbols)`);
		}
		return result;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`hover error: ${msg}`);
		return null;
	}
});

connection.onReferences((params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) return null;
		const table = symbolTables.get(params.textDocument.uri);
		if (!table) return null;
		return provideReferences(document, params.position, params.context, table);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`references error: ${msg}`);
		return null;
	}
});

connection.onDefinition((params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) return null;
		const table = symbolTables.get(params.textDocument.uri);
		if (!table) return null;
		return provideDefinition(document, params.position, table);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`definition error: ${msg}`);
		return null;
	}
});

connection.onCompletion((params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) return [];
		const table = symbolTables.get(params.textDocument.uri) ?? null;
		return provideCompletion(document, params.position, table);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`completion error: ${msg}`);
		return [];
	}
});

connection.onDocumentSymbol((params) => {
	try {
		const document = documents.get(params.textDocument.uri);
		if (!document) return [];
		const table = symbolTables.get(params.textDocument.uri);
		if (!table) return [];
		return provideDocumentSymbols(document, table);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		connection.console.error(`documentSymbol error: ${msg}`);
		return [];
	}
});

documents.listen(connection);
connection.listen();