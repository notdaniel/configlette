import { existsSync, readFileSync } from "node:fs";

type Coercer<T> = (raw: string) => T;

const SENTINEL = Symbol("SENTINEL");
type Sentinel = typeof SENTINEL;

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

export class EnvironmentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EnvironmentError";
	}
}

export class Environment {
	private readonly _environment: Record<string, string | undefined>;
	private readonly _hasBeenRead = new Set<string>();

	constructor(environment: Record<string, string | undefined> = process.env) {
		this._environment = environment;
	}

	get(key: string): string | undefined {
		this._hasBeenRead.add(key);
		return this._environment[key];
	}

	set(key: string, value: string): void {
		if (this._hasBeenRead.has(key)) {
			throw new EnvironmentError(
				`Cannot set environment['${key}'], but the value has already been read.`,
			);
		}
		this._environment[key] = value;
	}

	delete(key: string): void {
		if (this._hasBeenRead.has(key)) {
			throw new EnvironmentError(
				`Cannot delete environment['${key}'], but the value has already been read.`,
			);
		}
		delete this._environment[key];
	}

	has(key: string): boolean {
		return key in this._environment;
	}
}

export const environment = new Environment();

export class Field<T> {
	readonly _tag = "Field";

	constructor(
		readonly coerce: Coercer<T>,
		readonly defaultValue: T | Sentinel = SENTINEL,
		readonly isOptional = false,
		readonly envName?: string,
	) {}

	default<D extends T>(value: D): Field<T> {
		return new Field(this.coerce, value, false, this.envName);
	}

	optional(): Field<T | undefined> {
		return new Field(
			this.coerce as unknown as Coercer<T | undefined>,
			SENTINEL,
			true,
			this.envName,
		);
	}

	fromEnv(name: string): Field<T> {
		return new Field(this.coerce, this.defaultValue, this.isOptional, name);
	}
}

export function custom<T>(coerce: Coercer<T>): Field<T> {
	return new Field(coerce);
}

export function string(): Field<string> {
	return custom((s) => s);
}

export function number(): Field<number> {
	return custom((s) => {
		const n = Number(s);
		if (Number.isNaN(n)) throw new Error("Not a valid number");
		return n;
	});
}

export function boolean(): Field<boolean> {
	return custom((s) => {
		const v = s.trim().toLowerCase();
		if (v === "true" || v === "1") return true;
		if (v === "false" || v === "0") return false;
		throw new Error("Not a valid boolean");
	});
}

export function array<T>(
	item: Field<T> | Coercer<T>,
	opts?: { separator?: string },
): Field<T[]> {
	const sep = opts?.separator ?? ",";
	const itemCoerce: Coercer<T> =
		typeof item === "function"
			? (item as Coercer<T>)
			: (item as Field<T>).coerce;

	return custom((s) => {
		if (s === "") return [];
		return s.split(sep).map((x) => itemCoerce(x.trim()));
	});
}

export function json<T = unknown>(): Field<T> {
	return custom((s) => JSON.parse(s) as T);
}

export interface LoadOptions {
	envFile?: string;
	envPrefix?: string;
	encoding?: BufferEncoding;
	env?: Record<string, string | undefined>;
	environment?: Environment;
}

type OutputOf<F> = F extends Field<infer T> ? T : never;
export type InferConfig<S extends Record<string, Field<any>>> = {
	[K in keyof S]: OutputOf<S[K]>;
};

export function load<S extends Record<string, Field<any>>>(
	schema: S,
	options: LoadOptions = {},
): InferConfig<S> {
	const {
		envFile,
		envPrefix = "",
		encoding = "utf8",
		env,
		environment: customEnvironment,
	} = options;

	const envSource =
		customEnvironment ?? (env ? new Environment(env) : environment);
	const fileValues = envFile ? readEnvFile(envFile, encoding) : {};
	const out: Record<string, unknown> = {};

	for (const key in schema) {
		const field = schema[key];
		const envKey = envPrefix + (field.envName ?? key);
		const raw = envSource.get(envKey) ?? fileValues[envKey];

		if (raw == null) {
			if (field.defaultValue !== SENTINEL) {
				out[key] = field.defaultValue;
				continue;
			}
			if (field.isOptional) {
				out[key] = undefined;
				continue;
			}
			throw new ConfigError(
				`Config '${envKey}' is missing and has no default.`,
			);
		}

		try {
			out[key] = field.coerce(raw);
		} catch (e: any) {
			const msg = e?.message ? ` ${e.message}` : "";
			throw new ConfigError(`Config '${envKey}' has value '${raw}'.${msg}`);
		}
	}

	return out as InferConfig<S>;
}

function readEnvFile(
	file: string,
	encoding: BufferEncoding,
): Record<string, string> {
	if (!existsSync(file)) {
		console.warn(`Config file '${file}' not found.`);
		return {};
	}

	const text = readFileSync(file, { encoding });
	const values: Record<string, string> = {};

	for (const lineRaw of text.split(/\r?\n/)) {
		const line = lineRaw.trim();
		if (!line || line.startsWith("#") || !line.includes("=")) continue;

		const [k, ...rest] = line.split("=");
		let value = rest.join("=").trim();

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		values[k.trim()] = value;
	}

	return values;
}
