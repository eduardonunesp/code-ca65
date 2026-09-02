export type CpuType = '6502' | '65C02' | '6502X' | '65816' | 'HuC6280';

export interface AddressingMode {
	mode: string;
	syntax: string;
}

export interface OpcodeEntry {
	kind: 'opcode';
	mnemonic: string;
	cpus: CpuType[];
	summary: string;
	affectedFlags: string[];
	addressingModes: AddressingMode[];
	example: string;
}

export interface DirectiveEntry {
	kind: 'directive' | 'pseudovar' | 'pseudofunction' | 'block';
	name: string;
	summary: string;
	syntax?: string;
	example?: string;
}

export type KeywordEntry = OpcodeEntry | DirectiveEntry;