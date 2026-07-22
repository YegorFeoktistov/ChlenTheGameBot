export function table(name: string, columns: Record<string, unknown>, extra?: unknown) {
  return { name, columns, extra };
}

export function integer(name: string, options?: unknown) {
  return {
    name,
    options,
    primaryKey: () => ({ name, options, isPrimaryKey: true }),
    default: (val: unknown) => ({ name, options, defaultValue: val }),
    references: (fn: unknown) => ({ name, options, references: fn }),
  };
}

export function text(name: string, options?: unknown) {
  return {
    name,
    options,
    primaryKey: () => ({ name, options, isPrimaryKey: true }),
    default: (val: unknown) => ({ name, options, defaultValue: val }),
    references: (fn: unknown) => ({ name, options, references: fn }),
  };
}

export function primaryKey(...columns: unknown[]) {
  return { columns };
}

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return { strings, values };
}

export function eq(a: unknown, b: unknown) {
  return { a, b };
}

export function and(...conditions: unknown[]) {
  return { conditions };
}

export function desc(column: unknown) {
  return { column };
}
