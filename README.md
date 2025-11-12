# configlette

Type-safe configuration from environment variables and .env files, inspired by [Starlette's config](https://www.starlette.io/config/).

## Features

- **Type-safe** - Full TypeScript type inference from your config schema
- **Simple API** - Define your schema with field builders, get typed config object
- **No dependencies** - Zero runtime dependencies
- **Type coercion** - Automatic type conversion for strings, numbers, booleans, arrays, and JSON
- **.env support** - Reads from .env files with environment variable precedence
- **Variable interpolation** - Reference variables in .env files with `$VAR` or `${VAR}` syntax
- **Environ wrapper** - Prevents accidental modification of already-read environment variables
- **Flexible** - Supports required/optional fields, defaults, custom env var names, and custom coercion

## Disclaimer

This project is new, not yet production-ready, and may contain bugs, obvious problems, or missing features. Use at your own risk.

## Installation

```bash
npm install configlette
# or
pnpm add configlette
# or
yarn add configlette
```

## Quick Start

```typescript
import {
  load,
  string,
  number,
  boolean,
  array,
  type InferConfig,
} from "configlette";

// Define your config schema
const schema = {
  DATABASE_URL: string(),
  PORT: number().default(3000),
  DEBUG: boolean().default(false),
  ALLOWED_ORIGINS: array(string()).default([]),
  API_KEY: string().optional(),
} as const;

// Load config from environment and .env file
export const config = load(schema, {
  envFile: ".env",
  envPrefix: "APP_",
});

// Export the inferred type
export type AppConfig = InferConfig<typeof schema>;

// config is fully typed!
console.log(config.DATABASE_URL); // string
console.log(config.PORT); // number
console.log(config.DEBUG); // boolean
console.log(config.ALLOWED_ORIGINS); // string[]
console.log(config.API_KEY); // string | undefined
```

### With Environment Prefix

```typescript
const config = load(
  {
    DATABASE_URL: string(),
    PORT: number().default(3000),
  },
  { envPrefix: "MYAPP_" },
);
// Reads MYAPP_DATABASE_URL and MYAPP_PORT
```

### Custom Environment Variable Names

```typescript
const config = load({
  databaseUrl: string().fromEnv("DATABASE_URL"),
  apiKey: string().fromEnv("EXTERNAL_API_KEY"),
});
```

### Complex Types

```typescript
import {
  load,
  string,
  array,
  json,
  custom,
  type InferConfig,
} from "configlette";

const schema = {
  APP_NAME: string(),
  ALLOWED_HOSTS: array(string()).default([]),
  FEATURE_FLAGS: json<string[]>().optional(),
  LOG_LEVEL: custom((s) => {
    const level = s.toUpperCase();
    if (!["DEBUG", "INFO", "WARN", "ERROR"].includes(level)) {
      throw new Error("Invalid log level");
    }
    return level as "DEBUG" | "INFO" | "WARN" | "ERROR";
  }).default("INFO"),
} as const;

const config = load(schema);
type Config = InferConfig<typeof schema>;
```

## API Reference

### Field Constructors

#### `string()`

Creates a string field.

```typescript
const schema = {
  NAME: string(),
  TITLE: string().default("Untitled"),
  DESCRIPTION: string().optional(),
};
```

#### `number()`

Creates a number field. Throws if value cannot be parsed as a number.

```typescript
const schema = {
  PORT: number(),
  TIMEOUT: number().default(5000),
};
```

#### `boolean()`

Creates a boolean field. Accepts `"true"`, `"1"` (true) and `"false"`, `"0"` (false), case-insensitive.

```typescript
const schema = {
  DEBUG: boolean().default(false),
  VERBOSE: boolean(),
};
```

#### `array(itemType, options?)`

Creates an array field. Splits string by separator (default: `","`).

```typescript
const schema = {
  ALLOWED_HOSTS: array(string()),
  PORTS: array(number(), { separator: ";" }),
  TAGS: array(string()).default([]),
};
```

#### `json<T>()`

Creates a JSON field. Parses value with `JSON.parse()`.

```typescript
const schema = {
  SETTINGS: json<{ theme: string; locale: string }>(),
  METADATA: json().optional(),
};
```

#### `custom<T>(coercer)`

Creates a custom field with your own coercion function.

```typescript
const schema = {
  LEVEL: custom((s) => s.toUpperCase() as "DEBUG" | "INFO" | "ERROR"),
  URL: custom((s) => new URL(s)),
};
```

### Field Modifiers

#### `.default(value)`

Sets a default value for the field. Field becomes optional in env/file.

```typescript
PORT: number().default(3000);
```

#### `.optional()`

Marks field as optional. Returns `undefined` if not present.

```typescript
API_KEY: string().optional();
```

#### `.fromEnv(name)`

Uses a different environment variable name than the schema key.

```typescript
const schema = {
  apiKey: string().fromEnv("SERVICE_API_KEY"),
};
// Reads from SERVICE_API_KEY instead of apiKey
```

### `load(schema, options?)`

Loads configuration from environment variables and/or .env file.

```typescript
const config = load(schema, {
  envFile: ".env", // Path to .env file (optional)
  envPrefix: "APP_", // Prefix for env vars (optional)
  encoding: "utf8", // File encoding (default: "utf8")
  env: process.env, // Custom env object (default: process.env)
  environment: customEnvironment, // Custom Environment instance (optional)
  interpolate: true, // Enable variable interpolation (optional)
  // or with options:
  interpolate: {
    missing: "error", // How to handle missing refs: "error" | "leave" | "empty"
    lookup: "env-first", // Where to look: "env-first" | "file-first" | "file-only" | "env-only"
  },
});
```

**Precedence**: Environment variables > .env file > defaults

### `InferConfig<Schema>`

Type helper to extract the TypeScript type from your schema.

```typescript
const schema = {
  PORT: number().default(3000),
  API_KEY: string().optional(),
};

type Config = InferConfig<typeof schema>;
// { PORT: number; API_KEY: string | undefined }
```

### `Environment`

Wrapper around environment variables that tracks reads and prevents modification after reading.

```typescript
import { environment, Environment } from "configlette";

// Global instance
environment.get("PORT");
environment.set("PORT", "3000"); // throws EnvironmentError - already read!

// Custom instance
const env = new Environment({ PORT: "3000" });
```

### Errors

#### `ConfigError`

Thrown when:

- A required config value is missing
- Type coercion fails
- A circular reference is detected in variable interpolation
- A referenced variable doesn't exist (with `missing: "error"` policy)

```typescript
try {
  const config = load(schema);
} catch (error) {
  if (error instanceof ConfigError) {
    // Handle config error
  }
}
```

#### `EnvironmentError`

Thrown when attempting to modify an environment variable that has already been read.

```typescript
environment.get("PORT");
environment.set("PORT", "8080"); // throws EnvironmentError
```

## Variable Interpolation

You can reference other variables in your .env file using `$VAR` or `${VAR}` syntax:

```bash
# .env file
PGHOST=localhost
PGPORT=5432
PGUSER=admin
DATABASE_URL=postgresql://$PGUSER@$PGHOST:$PGPORT/mydb
```

```typescript
const config = load(schema, {
  envFile: ".env",
  interpolate: true, // Enable interpolation
});
// DATABASE_URL will be: postgresql://admin@localhost:5432/mydb
```

### Interpolation Options

```typescript
interpolate: {
  // How to handle missing variable references
  missing: "error" | "leave" | "empty",  // default: "error"

  // Where to look for variable values
  lookup: "env-first" | "file-first" | "file-only" | "env-only"  // default: "env-first"
}
```

**Missing policies:**

- `"error"` - Throw an error if a referenced variable doesn't exist (default)
- `"leave"` - Leave the reference as-is (e.g., `$MISSING` stays `$MISSING`)
- `"empty"` - Replace with empty string

**Lookup policies:**

- `"env-first"` - Check environment variables first, then .env file (default)
- `"file-first"` - Check .env file first, then environment variables
- `"file-only"` - Only look in .env file
- `"env-only"` - Only look in environment variables

### Interpolation Examples

```typescript
// Basic interpolation
load(schema, { envFile: ".env", interpolate: true });

// Custom missing policy
load(schema, {
  envFile: ".env",
  interpolate: { missing: "empty" },
});

// File-only lookup (ignore environment)
load(schema, {
  envFile: ".env",
  interpolate: { lookup: "file-only" },
});
```

### Escaping

Use `\$` to include a literal dollar sign:

```bash
PRICE=\$100
```

### Safety

- **Circular references are detected** - An error is thrown if variables reference each other in a cycle
- **Environment variables are NOT interpolated** - Only .env file values are expanded for security
- **Predictable precedence** - Environment variables always take precedence over .env file in the final config

## .env File Format

```bash
# Comments are ignored
DATABASE_URL=postgres://localhost/mydb
PORT=3000
DEBUG=true

# Quotes are stripped
NAME="My App"
MESSAGE='Hello World'

# Arrays use comma separator by default
ALLOWED_ORIGINS=https://example.com,https://app.example.com

# JSON values
SETTINGS={"theme":"dark","locale":"en"}

# Variable references (with interpolate: true)
PGHOST=localhost
PGPORT=5432
DATABASE_URL=postgresql://$PGHOST:$PGPORT/mydb
```

### Testing

```typescript
import { load, Environ } from "configlette";

const testEnv = new Environ({
  DATABASE_URL: "postgres://test",
  PORT: "3001",
});

const config = load(schema, { environ: testEnv });
```

## License

MIT
